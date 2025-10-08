import vision from '@google-cloud/vision'
import OpenAI from 'openai'

// Initialize Google Vision client with proper private_key newline handling
const visionClient = new vision.ImageAnnotatorClient({
  credentials: (() => {
    try {
      const raw = process.env.GOOGLE_VISION || '{}'
      const creds = JSON.parse(raw)
      if (creds && typeof creds.private_key === 'string') {
        creds.private_key = creds.private_key.replace(/\\n/g, '\n')
      }
      return creds
    } catch {
      return {}
    }
  })()
})

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

function detectLanguage(text: string): 'ar' | 'en' {
  const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g
  const englishPattern = /[a-zA-Z]/g
  const arabicCount = (text.match(arabicPattern) || []).length
  const englishCount = (text.match(englishPattern) || []).length
  return arabicCount > englishCount ? 'ar' : 'en'
}

function getLongestArabicParagraph(sourceText: string): string | null {
  if (!sourceText) return null
  const normalized = sourceText.replace(/\r\n/g, '\n')
  const paragraphs = normalized.split(/\n{2,}/)
  let best: string | null = null
  let bestScore = 0
  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed) continue
    const arabicCount = (trimmed.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length
    if (arabicCount > bestScore) { bestScore = arabicCount; best = trimmed }
  }
  return best
}

export interface ProcessMetadata {
  ocr_max_pages?: number
  form_type?: 'F1' | 'F4' | 'F5'
  state_name_ar?: string
  currency?: string
  exchange_rate?: number
}

export async function processFForm(file: File, metadata: ProcessMetadata): Promise<any> {
  const overallStart = Date.now()
  // start
  // Timeout helpers
  const withTimeout = async <T>(p: Promise<T>, ms: number, label: string): Promise<T> => {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), ms)
    try {
      // @ts-ignore signal optional depending on promise
      const res: T = await (p as any)
      return res
    } catch (e) {
      throw new Error(`${label} timed out`)
    } finally {
      clearTimeout(t)
    }
  }

  // Build OCR text using Google Vision
  const buffer = Buffer.from(await file.arrayBuffer())
  const base64 = buffer.toString('base64')

  const isPdf = file.type === 'application/pdf'
  const maxPagesHint = Math.max(1, Math.min(Number(metadata?.ocr_max_pages) || 5, 20))
  let text = ''

  if (isPdf) {
    const visionStart = Date.now()
    const pages = Array.from({ length: Math.min(5, maxPagesHint) }, (_, i) => i + 1)
    const [pageInfo] = await withTimeout(
      visionClient.batchAnnotateFiles({
        requests: [{
          inputConfig: { mimeType: 'application/pdf', content: base64 },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          imageContext: { languageHints: ['ar', 'en'] },
          pages
        }]
      }),
      55000,
      'Vision PDF OCR'
    )
    const responses = pageInfo.responses?.[0]?.responses || []
    const allTexts: string[] = []
    responses.forEach((r: any) => allTexts.push(r?.fullTextAnnotation?.text || ''))
    text = allTexts.join('\n\n---PAGE BREAK---\n\n')
    // pdf done
  } else {
    const visionStart = Date.now()
    const [result] = await withTimeout(
      visionClient.documentTextDetection({
        image: { content: base64 },
        imageContext: { languageHints: ['ar', 'en'] }
      }),
      55000,
      'Vision Image OCR'
    )
    text = result.fullTextAnnotation?.text || ''
    // image done
  }

  // If no text, return minimal object
  if (!text) {
    // no text
    return {
      date: null,
      state: null,
      locality: null,
      planned_activities: [],
      expenses: [],
      form_currency: metadata?.currency || 'USD',
      exchange_rate: metadata?.exchange_rate || 1,
      language: null,
      raw_ocr: ''
    }
  }

  const formType = String(metadata?.form_type || '').toUpperCase()
  const isF4 = formType === 'F4'
  const isF5 = formType === 'F5'

  const completion = await withTimeout(
    openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      max_tokens: 3000,
      response_format: (isF4 || isF5) ? { type: 'json_object' } as any : undefined,
      messages: [
        {
          role: 'system',
          content: isF4 ? `Extract ONLY F4 Financial Report data from the text (Arabic or English). Do not infer or convert amounts. Keep raw amounts and detected currency.

IMPORTANT TABLE NOTE (ARABIC RTL):
- The Arabic table is right-to-left: the expense name is on the right; the amount is on the left.
- OCR may list all amounts separately as a vertical list after the visible activity rows. Align these amounts back to activities IN ORDER.
- Ignore small incidental numbers (e.g., 25, 31) that relate to units or page markers; prefer numbers with thousands grouping for SDG amounts.

BASIC INFORMATION:
- date: Report date in YYYY-MM-DD if present (convert formats); else null
- state: State name as seen (original language) or null
- locality: ERR room or locality name as seen or null

EXPENSES TABLE (actual expenses):
- For each listed expense row with an amount, return an object:
  { activity: string, amount_value: number, currency: "USD" | "SDG" | null }
- Detect currency from context/symbols/labels (e.g., SDG, جنيه, $, USD). If unclear, null.
- Do NOT convert any amounts. Keep the number as it appears (strip commas and symbols).
- Ignore receipt pages, bank slips, or pages without an expense row with amount.

TOTALS SECTION (verbatim extraction without math):
- total_expenses_text: numeric string if A ( إجمالي النفقات ) is present, else null
- total_grant_text: numeric string if B is present, else null
- total_other_sources_text: numeric string if C is present, else null
- remainder_text: numeric string if D is present, else null

NARRATIVE RESPONSES:
- excess_expenses: respondent's answer to question 4 (DO NOT return the question text itself); else null
- surplus_use: respondent's answer to question 5 (DO NOT return the question text itself); else null
- lessons: respondent's answer to question 6 (DO NOT return the question text itself); else null
- training: respondent's answer to question 7 (DO NOT return the question text itself); else null

OTHER:
- language: "ar" or "en" inferred from the text
- raw_ocr: include full OCR text back to caller

Return strict JSON with keys exactly as specified above.` : (isF5 ? `Extract F5 program report data. Return MINIFIED JSON (no whitespace, no markdown) with EXACTLY these fields:

date: Report date (string)
language: "ar" or "en"
reach: Array of activity objects with EXACTLY these fields:
  activity_name: Activity name (string)
  activity_goal: Activity goal/details (string)
  location: Implementation location (string)
  start_date: Start date (string)
  end_date: End date (string)
  individual_count: Number of individuals (number)
  household_count: Number of families/households (number)
  male_count: Number of males (number)
  female_count: Number of females (number)
  under18_male: Number of males under 18 (number)
  under18_female: Number of females under 18 (number)

positive_changes: Positive changes/impacts text (string)
negative_results: Negative results/challenges text (string)
unexpected_results: Unexpected results text (string)
lessons_learned: Lessons learned text (string)
suggestions: Suggestions/requests text (string)
reporting_person: Name of reporting person (string)

IMPORTANT:
- Return ONLY minified JSON, no markdown, no other text
- Use null for missing values, not empty strings` : `Extract information from the following text (which may be in English or Arabic): ...`)
        },
        { role: 'user', content: text }
      ],
      temperature: 0.1
    }),
    55000,
    'OpenAI completion'
  )

  const content = completion.choices[0]?.message?.content
  if (!content) throw new Error('No content in OpenAI response')
  // ai done

  let structuredData: any
  try {
    structuredData = JSON.parse(content.replace(/^[`\s]*|[`\s]*$/g, ''))
  } catch (e) {
    // Best-effort fallback
    structuredData = { raw_ocr: text }
    // json parse fallback
  }

  if (!structuredData.language) {
    structuredData.language = detectLanguage(text)
  }

  // F1 fallback: ensure objectives present
  const formTypeUpper = formType
  if (formTypeUpper !== 'F4' && formTypeUpper !== 'F5') {
    const objectives = structuredData.project_objectives
    const objectivesStr = typeof objectives === 'string' ? objectives.trim() : ''
    if (!objectivesStr || objectivesStr.length < 40) {
      const fallback = getLongestArabicParagraph(text)
      if (fallback && fallback.length > objectivesStr.length) structuredData.project_objectives = fallback
    }
  }

  // Override state when provided (non-F4)
  if (formTypeUpper !== 'F4' && metadata.state_name_ar) {
    structuredData.state = metadata.state_name_ar
  }

  structuredData.raw_ocr = text
  // complete
  return structuredData
}


