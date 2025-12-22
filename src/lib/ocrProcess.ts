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

  // Log OCR text for debugging (truncated if too long)
  if (isF4) {
    const textPreview = text.length > 2000 ? text.substring(0, 2000) + '...' : text
    console.log('[F4 OCR] Extracted text length:', text.length)
    console.log('[F4 OCR] Text preview:', textPreview)
  }

  const completion = await withTimeout(
    openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      max_tokens: 3000,
      response_format: (isF4 || isF5) ? { type: 'json_object' } as any : undefined,
      messages: [
        {
          role: 'system',
          content: isF4 ? `Extract ONLY F4 Financial Report data from the text (Arabic or English). Do not infer or convert amounts. Keep raw amounts and detected currency.

CRITICAL EXPENSE TABLE EXTRACTION RULES:

1. TABLE STRUCTURE (RTL - Right to Left):
   - Arabic tables read right-to-left: activity names are on the RIGHT, amounts are on the LEFT
   - Table headings may vary but look for columns like: "النشاط" (Activity), "قيمة المصروفات" (Expenditure Value), "المبلغ" (Amount)
   - Match each expense row by reading horizontally across the table structure

2. EXPENSE AMOUNT IDENTIFICATION (CRITICAL):
   - ONLY extract amounts from the expense amount column (typically labeled "قيمة المصروفات", "المبلغ", "Amount", or similar)
   - If amounts are listed separately at the bottom of the table (common in OCR), use those amounts IN ORDER
   - DO NOT use amounts mentioned in descriptions, even if they look like expense amounts
   - CRITICAL: If a description mentions "على مبلغ X" or "مبلغ X" - that X is NOT the expense amount. The expense amount is in the amount column only.
   - Example: "تم خصم عمولة على مبلغ 5,000,000 بنسبة 8%" - IGNORE the 5,000,000. The actual expense is the commission amount (400,000) in the amount column.
   - Each expense row has ONE amount - find it in the rightmost amount column or in the ordered list at bottom
   - Ignore amounts in payment date fields, receipt numbers, or description text

3. ACTIVITY NAME EXTRACTION:
   - Extract ONLY the activity name from the activity column (typically "النشاط" or "Activity")
   - DO NOT merge activity names with descriptions
   - Keep activity names concise - separate from description columns
   - If two activity names appear on the same row (e.g., "اعاشة التيم العامل" and "نثرية المأمورية"), they represent ONE expense entry - use the primary activity name or combine them appropriately
   - Example: "صيانة مضخات مياة" NOT "صيانة مضخات مياة | مواد صيانة مضخات"

4. ROW-BY-ROW ALIGNMENT (CRITICAL):
   - Process expenses row by row in the order they appear
   - Match each activity name with its corresponding amount in the SAME row
   - If OCR lists amounts separately at the bottom, align them to activities in the EXACT order they appear (first activity = first amount, second activity = second amount, etc.)
   - Do not skip rows - include ALL expense rows with amounts
   - Do not reorder or swap amounts between activities

5. BANK COMMISSIONS & SPECIAL EXPENSES:
   - "خصم عمولة بنكك" (bank commission) is a separate expense row with its own amount
   - Extract it as a distinct expense entry
   - The commission amount is in the expense amount column, NOT the base amount mentioned in description
   - The description may mention a larger amount (e.g., "على مبلغ 5,000,000") - this is the BASE amount, NOT the expense. The expense is the commission (e.g., 400,000).

6. AMOUNT FILTERING:
   - Ignore small numbers (e.g., 25, 31, 10) that are clearly units, dates, or page numbers
   - Prefer numbers with thousands separators (e.g., 4,160,000) for SDG amounts
   - Amounts should be substantial (typically 100,000+ for SDG, 100+ for USD)
   - If you see a list of amounts at the bottom (e.g., "4,160,000\n400,000\n260,000\n400,000\n405,000"), these are the expense amounts in order - use them exactly as listed

BASIC INFORMATION:
- date: Report date in YYYY-MM-DD if present (convert formats); else null
- state: State name as seen (original language) or null
- locality: ERR room or locality name as seen or null

EXPENSES TABLE (actual expenses):
- For each listed expense row with an amount, return an object:
  { activity: string, amount_value: number, currency: "USD" | "SDG" | null }
- activity: Clean activity name only (from activity column, not merged with description). If two activities share a row, use the primary one or combine appropriately.
- amount_value: The actual expense amount from the expense amount column (numeric, no commas). Use amounts in the order they appear - do not swap or reorder.
- currency: Detect from context/symbols/labels (e.g., SDG, جنيه, $, USD). If the form is in Arabic and currency is unclear, default to "SDG". If form is in English and currency is unclear, default to "USD". Only use null if truly ambiguous.
- Do NOT convert any amounts. Keep the number as it appears (strip commas and symbols).
- Include ALL expense rows - do not skip any
- Ignore receipt pages, bank slips, or pages without an expense row with amount

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
  
  // Log AI response for debugging
  if (isF4) {
    const contentPreview = content.length > 1000 ? content.substring(0, 1000) + '...' : content
    console.log('[F4 AI] Response length:', content.length)
    console.log('[F4 AI] Response preview:', contentPreview)
  }
  // ai done

  let structuredData: any
  try {
    structuredData = JSON.parse(content.replace(/^[`\s]*|[`\s]*$/g, ''))
    
    // Log parsed expenses for debugging
    if (isF4 && Array.isArray(structuredData.expenses)) {
      console.log('[F4 AI] Parsed expenses count:', structuredData.expenses.length)
      console.log('[F4 AI] Expenses:', JSON.stringify(structuredData.expenses, null, 2))
      console.log('[F4 AI] Total expenses text:', structuredData.total_expenses_text)
    }
  } catch (e) {
    console.error('[F4 AI] JSON parse error:', e)
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


