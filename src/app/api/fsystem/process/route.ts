import { NextResponse } from 'next/server'
import vision from '@google-cloud/vision'
import OpenAI from 'openai'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Initialize Google Vision client
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

// Add types for the expense object
interface Expense {
  description: string | null;
  location: string | null;
  quantity: number | null;
  unit_cost: number | null;
  total_cost: number | null;
}

// Validate extracted data
function validateExtractedData(data: any) {
  // Ensure planned_activities is an array and clean up items
  if (data.planned_activities) {
    if (!Array.isArray(data.planned_activities)) {
      data.planned_activities = typeof data.planned_activities === 'string' 
        ? [data.planned_activities] 
        : []
    }
    // Clean up each activity
    data.planned_activities = data.planned_activities
      .map((activity: unknown) => {
        if (typeof activity !== 'string') return null
        return activity
          .trim()
          .replace(/^[-●•\s\d\(\)]+/, '') // Remove leading bullets, numbers, parentheses
          .replace(/[\(\)]+$/, '')        // Remove trailing parentheses
          .trim()
      })
      .filter(Boolean) // Remove null/empty items
  } else {
    data.planned_activities = []
  }

  // Validate and normalize expenses array
  if (data.expenses && Array.isArray(data.expenses)) {
    data.expenses = data.expenses
      .map((expense: unknown) => {
        if (!expense || typeof expense !== 'object') return null
        const exp = expense as Record<string, unknown>

        // Clean up description and location
        const description = typeof exp.description === 'string' 
          ? exp.description.trim() 
          : null
        const location = typeof exp.location === 'string'
          ? exp.location
              .trim()
              .replace(/[\\\/]+/g, ' ') // Normalize slashes to spaces
              .replace(/\s+/g, ' ')     // Normalize spaces
          : null

        // Parse numeric values
        const quantity = exp.quantity ? parseInt(String(exp.quantity)) : null
        const unit_cost = exp.unit_cost ? parseFloat(String(exp.unit_cost)) : null
        const total_cost = exp.total_cost ? parseFloat(String(exp.total_cost)) : null

        // Validate and compute missing values if possible
        const validatedExpense: Expense = {
          description,
          location,
          quantity: isNaN(quantity as number) ? null : quantity,
          unit_cost: isNaN(unit_cost as number) ? null : unit_cost,
          total_cost: isNaN(total_cost as number) ? null : total_cost
        }

        // Try to compute missing values
        if (validatedExpense.quantity !== null && validatedExpense.unit_cost !== null && validatedExpense.total_cost === null) {
          validatedExpense.total_cost = validatedExpense.quantity * validatedExpense.unit_cost
        } else if (validatedExpense.total_cost !== null && validatedExpense.unit_cost !== null && validatedExpense.quantity === null) {
          const computed = validatedExpense.total_cost / validatedExpense.unit_cost
          if (Math.abs(Math.round(computed) - computed) < 0.02) { // Within 2% of an integer
            validatedExpense.quantity = Math.round(computed)
          }
        } else if (validatedExpense.total_cost !== null && validatedExpense.quantity !== null && validatedExpense.unit_cost === null) {
          validatedExpense.unit_cost = validatedExpense.total_cost / validatedExpense.quantity
        }

        return validatedExpense
      })
      .filter((expense: Expense | null): expense is Expense => expense !== null) // Type guard to remove null items
  } else {
    data.expenses = []
  }

  return data
}

// Find the longest Arabic paragraph to use as a fallback for verbatim text fields
function getLongestArabicParagraph(sourceText: string): string | null {
  if (!sourceText) return null
  const normalized = sourceText.replace(/\r\n/g, '\n')
  const paragraphs = normalized.split(/\n{2,}/)
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/

  let best: string | null = null
  let bestScore = 0

  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed) continue
    // Score by number of Arabic characters to bias toward Arabic blocks
    const arabicCount = (trimmed.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length
    if (arabicCount === 0) continue
    const score = arabicCount
    if (score > bestScore) {
      bestScore = score
      best = trimmed
    }
  }

  return best
}

// Add language detection function after the validateExtractedData function
function detectLanguage(text: string): 'ar' | 'en' {
  // Count Arabic and English characters
  const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
  const englishPattern = /[a-zA-Z]/g;
  
  const arabicCount = (text.match(arabicPattern) || []).length;
  const englishCount = (text.match(englishPattern) || []).length;
  
  return arabicCount > englishCount ? 'ar' : 'en';
}

export async function POST(req: Request) {
  try {
    const start = Date.now()
    const formData = await req.formData()
    const file = formData.get('file') as File
    const metadataStr = formData.get('metadata') as string
    console.log('Received metadata string:', metadataStr)
    
    const formMetadata = JSON.parse(metadataStr)
    console.log('Parsed form metadata:', formMetadata)

    if (!file) {
      throw new Error('No file provided')
    }

    console.log('Processing file:', file.name, 'Type:', file.type, 'Size:', file.size)

    // Convert file to base64
    const buffer = Buffer.from(await file.arrayBuffer())
    const base64 = buffer.toString('base64')

    let text = ''
    
    if (file.type === 'application/pdf') {
      console.log('Processing PDF file...')

      // Respect max pages hint (default 5, capped 20)
      const maxPagesHint = Math.max(1, Math.min(Number(formMetadata?.ocr_max_pages) || 5, 20))
      const firstBatchPages = Array.from({ length: Math.min(5, maxPagesHint) }, (_, i) => i + 1)
      const [pageInfo] = await visionClient.batchAnnotateFiles({
        requests: [{
          inputConfig: {
            mimeType: 'application/pdf',
            content: base64
          },
          features: [{
            type: 'DOCUMENT_TEXT_DETECTION'
          }],
          imageContext: {
            languageHints: ['ar', 'en']
          },
          pages: firstBatchPages  // First batch pages
        }]
      })

      // Get initial text and count of first batch
      let allTexts: string[] = []
      const firstBatchResponses = pageInfo.responses?.[0]?.responses || []
      firstBatchResponses.forEach((response, idx) => {
        const pageText = response?.fullTextAnnotation?.text || ''
        console.log(`Page ${idx + 1} text length:`, pageText.length)
        allTexts.push(pageText)
      })

      // Remove second-batch attempts to bound runtime strictly to first batch only

      console.log('Total pages processed:', allTexts.length)
      // timing

      if (allTexts.length === 0) {
        // Gracefully handle empty OCR: return minimal structure
        return NextResponse.json({
          date: null,
          state: null,
          locality: null,
          project_objectives: null,
          intended_beneficiaries: null,
          estimated_beneficiaries: null,
          estimated_timeframe: null,
          additional_support: null,
          banking_details: null,
          program_officer_name: null,
          program_officer_phone: null,
          reporting_officer_name: null,
          reporting_officer_phone: null,
          finance_officer_name: null,
          finance_officer_phone: null,
          planned_activities: [],
          expenses: [],
          form_currency: formMetadata?.currency || 'USD',
          exchange_rate: formMetadata?.exchange_rate || 1,
          language: null,
          raw_ocr: ''
        })
      }

      // Combine all texts with page breaks
      text = allTexts.join('\n\n---PAGE BREAK---\n\n')
    } else {
      console.log('Processing image file...')
      const [result] = await visionClient.documentTextDetection({
        image: { content: base64 },
        imageContext: {
          languageHints: ['ar', 'en']  // Help Vision detect Arabic/English text
        }
      })
      text = result.fullTextAnnotation?.text || ''
    }

    // extracted text

    // Log the first and last 100 characters to check text boundaries
    if (text.length > 0) {
      console.log('Text start:', text.substring(0, 100))
      console.log('Text end:', text.substring(Math.max(0, text.length - 100)))
    }

    if (!text) {
      // Gracefully handle empty OCR: return minimal structure
      return NextResponse.json({
        date: null,
        state: null,
        locality: null,
        project_objectives: null,
        intended_beneficiaries: null,
        estimated_beneficiaries: null,
        estimated_timeframe: null,
        additional_support: null,
        banking_details: null,
        program_officer_name: null,
        program_officer_phone: null,
        reporting_officer_name: null,
        reporting_officer_phone: null,
        finance_officer_name: null,
        finance_officer_phone: null,
        planned_activities: [],
        expenses: [],
        form_currency: formMetadata?.currency || 'USD',
        exchange_rate: formMetadata?.exchange_rate || 1,
        language: null,
        raw_ocr: ''
      })
    }

    // Decide prompt based on form type
    const formType = String(formMetadata?.form_type || '').toUpperCase()
    const isF4 = formType === 'F4'
    const isF5 = formType === 'F5'

    // Process with OpenAI
    const aiStart = Date.now()
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      max_tokens: 3000,
      response_format: (isF4 || isF5) ? { type: 'json_object' } as any : undefined,
      messages: [
        {
          role: "system",
          content: isF4 ? `Extract ONLY F4 Financial Report data from the text (Arabic or English). Do not infer or convert amounts. Keep raw amounts and detected currency.

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
- excess_expenses: text for question 4 if present, else null
- surplus_use: text for question 5 if present, else null
- lessons: text for question 6 if present, else null
- training: text for question 7 if present, else null

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
- Use null for missing values, not empty strings
- For reach activities:
  - Extract all activities with their details
  - Map Arabic headers:
    اسم النشاط -> activity_name
    هدف/تفاصيل النشاط -> activity_goal
    مكان التنفيذ -> location
    البداية -> start_date
    النهاية -> end_date
    أفراد -> individual_count
    أسر -> household_count
    ذكور -> male_count
    إناث -> female_count
    ذكور تحت 18 -> under18_male
    إناث تحت 18 -> under18_female

Example output format (minified):
{"date":"2025-08-25","language":"ar","reach":[{"activity_name":"ورشة تدريبية","activity_goal":"هدف الورشة","location":"موقع التنفيذ","start_date":"2025-08-01","end_date":"2025-08-02","individual_count":30,"household_count":10,"male_count":15,"female_count":15,"under18_male":5,"under18_female":5}],"positive_changes":"التغييرات الإيجابية","negative_results":null,"unexpected_results":null,"lessons_learned":null,"suggestions":null,"reporting_person":"اسم المسؤول"}` : `Extract information from the following text (which may be in English or Arabic):

BASIC INFORMATION:
- date: Date of the project in YYYY-MM-DD format (convert any date format to this)
- state: State name (keep in original language)
- locality: Locality name (keep in original language)
- project_objectives: Return the exact text as found in the OCR (verbatim, preserve line breaks). Do not summarize or shorten. If not present, return null.
- intended_beneficiaries: Description of who will benefit (keep in original language)
- estimated_beneficiaries: Number of beneficiaries (integer)
- estimated_timeframe: Project duration (keep in original language)
- additional_support: Any additional support mentioned (keep in original language)
- banking_details: Banking information (keep in original language)

CONTACT INFORMATION:
- program_officer_name: Name of program officer (keep in original language)
- program_officer_phone: Phone of program officer
- reporting_officer_name: Name of reporting officer (keep in original language)
- reporting_officer_phone: Phone of reporting officer
- finance_officer_name: Name of finance officer (keep in original language)
- finance_officer_phone: Phone of finance officer

ACTIVITIES AND EXPENSES:
1. From section 6 (الأنشطة الرئيسية اللازمة):
   - Each activity row has three columns: العدد, مدة النشاط, مكان التنفيذ
   - ONLY include an activity if ALL THREE columns have values
   - Example row with complete data:
     Activity: المطبخ المشترك/ تموين
     العدد: 100
     مدة النشاط: 7 أيام
     مكان التنفيذ: الدلنج -- حي الواحة
   - This activity should be included because all columns are filled
   - Activities with empty columns should be excluded

2. From section 7 (الميزانية التفصيلية):
   If form is in Arabic (RTL):
   - Look at the leftmost column labeled الإجمالي for total costs
   - Take activity names from rightmost column المصروفات
   - Ignore middle columns (التكرار, سعر الوحدة)

   If form is in English (LTR):
   - Look at the rightmost column labeled Total/الإجمالي
   - Take activity names from leftmost column Expenses/المصروفات
   - Ignore middle columns

   For each row:
   - Only extract rows where الإجمالي has a value (e.g. $3,900, $10, $50)
   - Remove $ symbol from numbers
   - Ignore any numbers that aren't in the الإجمالي column

CURRENCY CONVERSION:
- Form currency: ${formMetadata.currency || 'USD'}
- Exchange rate (USD to SDG): ${formMetadata.exchange_rate || '1'}
- If form currency is SDG, convert all amounts to USD using the exchange rate (divide SDG amount by exchange rate)
- Always return amounts in USD in the final JSON
- Also include the original amount in SDG if conversion was applied

Example (Arabic form):
الإجمالي: $3,900 | سعر الوحدة: $32.5 | المصروفات: مشتريات طبية
Should extract: { activity: "مشتريات طبية", total_cost_usd: 3900, total_cost_sdg: null, currency: "USD" }

Example (SDG form with exchange rate 2700):
الإجمالي: 5,000,000 SDG | المصروفات: مشتريات طبية
Should extract: { activity: "مشتريات طبية", total_cost_usd: 1851.85, total_cost_sdg: 5000000, currency: "SDG" }

Return all fields in this format:
{
  "date": string | null,
  "state": string | null,
  "locality": string | null,
  "project_objectives": string | null,
  "intended_beneficiaries": string | null,
  "estimated_beneficiaries": number | null,
  "estimated_timeframe": string | null,
  "additional_support": string | null,
  "banking_details": string | null,
  "program_officer_name": string | null,
  "program_officer_phone": string | null,
  "reporting_officer_name": string | null,
  "reporting_officer_phone": string | null,
  "finance_officer_name": string | null,
  "finance_officer_phone": string | null,
  "planned_activities": string[],
  "expenses": Array<{activity: string, total_cost_usd: number, total_cost_sdg: number | null, currency: string}>,
  "form_currency": string,
  "exchange_rate": number
}`)
        },
        {
          role: "user",
          content: text
        }
      ],
      temperature: 0.1
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      throw new Error('No content in OpenAI response')
    }

    console.log('Raw GPT response:', content)
    // ai duration

    // Sanitize the JSON string (basic cleanup only)
    const sanitizedContent = content
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
      .replace(/^```[a-zA-Z]*\n|```$/g, '') // Strip markdown fences if present

    try {
      const structuredData = JSON.parse(sanitizedContent)
      // Add language detection if missing
      if (!structuredData.language) {
        const detectedLanguage = detectLanguage(text)
        structuredData.language = detectedLanguage
      }

      if (!isF4 && !isF5) {
        // F1 behavior only
        const objectives: unknown = structuredData.project_objectives
        const objectivesStr = typeof objectives === 'string' ? objectives.trim() : ''
        if (!objectivesStr || objectivesStr.length < 40) {
          const fallback = getLongestArabicParagraph(text)
          if (fallback && fallback.length > objectivesStr.length) {
            structuredData.project_objectives = fallback
          }
        }
      }

      // Override the state from OCR with the selected state from form metadata
      if (!isF4 && formMetadata.state_name_ar) {
        console.log('Overriding OCR state with selected state:', {
          original: structuredData.state,
          new: formMetadata.state_name_ar
        })
        structuredData.state = formMetadata.state_name_ar
      }
      
      // If F5, normalize reach rows and parse demographics from raw OCR
      if (isF5) {
        function toAsciiDigits(s: any) {
          if (s == null) return s
          const map: Record<string,string> = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9' }
          return String(s).replace(/[٠-٩]/g, d => (map as any)[d] ?? d).replace(/[,،]/g,'').trim()
        }
        function toNum(n: any): number | null {
          const v = toAsciiDigits(n)
          if (!v) return null
          const f = parseInt(v, 10)
          return Number.isFinite(f) ? f : null
        }
        function normalizeDate(v: any): string | null {
          const s = toAsciiDigits(v)
          if (!s) return null
          if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
          if (/^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(s)) return s
          return null
        }
        function normalizeReachRow(row: any) {
          const r: any = { ...row }
          // Map alternates to expected keys
          if (r.individuals != null && r.individual_count == null) r.individual_count = r.individuals
          if (r.families != null && r.household_count == null) r.household_count = r.families
          if (r.start != null && r.start_date == null) r.start_date = r.start
          if (r.end != null && r.end_date == null) r.end_date = r.end

          r.activity_name = r.activity_name ?? r.name ?? null
          r.activity_goal = r.activity_goal ?? r.details ?? null
          r.location = r.location ?? r.place ?? null

          r.start_date = normalizeDate(r.start_date)
          r.end_date = normalizeDate(r.end_date)

          r.individual_count = toNum(r.individual_count)
          r.household_count = toNum(r.household_count)
          r.male_count = toNum(r.male_count)
          r.female_count = toNum(r.female_count)
          r.under18_male = toNum(r.under18_male)
          r.under18_female = toNum(r.under18_female)

          return {
            activity_name: r.activity_name || null,
            activity_goal: r.activity_goal || null,
            location: r.location || null,
            start_date: r.start_date || null,
            end_date: r.end_date || null,
            individual_count: r.individual_count ?? null,
            household_count: r.household_count ?? null,
            male_count: r.male_count ?? null,
            female_count: r.female_count ?? null,
            under18_male: r.under18_male ?? null,
            under18_female: r.under18_female ?? null
          }
        }
        function parseDemographics(sourceText: string) {
          const t = (sourceText || '').replace(/\s+/g,' ').trim()
          
          // Look for the demographics section and the activities list
          const demographicsMatch = t.match(/الحصر\s*الإضافي\s*للمستفيدين[\s\S]*?(?=التأثيرات|$)/i)
          if (!demographicsMatch) {
            return { breakdowns: [] }
          }
          
          const demoSection = demographicsMatch[0]
          
          // Split into lines and clean
          const lines = demoSection.split('\n').map(l => l.trim()).filter(l => l.length > 0)
          
          // First, find all activity names in the main activities section
          const activityNames = Array.isArray(structuredData.reach) 
            ? structuredData.reach.map((r: { activity_name?: string }) => r.activity_name).filter(Boolean)
            : []
          
          // Then find the demographics breakdown section which lists activities again with their numbers
          let inBreakdownSection = false
          let currentActivity = ''
          let numberGroups: number[][] = []
          let currentNumbers: number[] = []
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            
            // Skip header lines
            if (line.includes('الحصر') || line.includes('إسم النشاط') || line.includes('التاريخ') || line.includes('محلية')) {
              continue
            }
            
            // Look for numbers
            const numbers = line.match(/[٠-٩0-9,]+/g)
            if (numbers) {
              // Convert Arabic numerals and clean
              const cleanNums = numbers.map(n => {
                const cleaned = n.replace(/[,،]/g, '')
                return toNum(cleaned) || 0
              })
              currentNumbers.push(...cleanNums)
              continue
            }
            
            // If we have a line that matches one of our activity names
            const matchingActivity = activityNames.find((name: string) => 
              name && line.includes(name.split(' ')[0]) // Match on first word to be more lenient
            )
            
            if (matchingActivity) {
              // If we already have numbers for a previous activity, save them
              if (currentNumbers.length > 0) {
                numberGroups.push(currentNumbers)
              }
              currentActivity = matchingActivity
              currentNumbers = []
              continue
            }
          }
          
          // Don't forget the last group of numbers
          if (currentNumbers.length > 0) {
            numberGroups.push(currentNumbers)
          }
          
          // Now map the activities to their demographic breakdowns
          const breakdowns = activityNames.map((activityName: string, idx: number) => {
            const numbers = numberGroups[idx] || []
            return {
              activity_name: activityName,
              male_count: numbers[0] || 0,
              female_count: numbers[1] || 0,
              under18_male: numbers[2] || 0,
              under18_female: numbers[3] || 0,
              special_needs: numbers[4] || 0
            }
          })
          
          return { breakdowns }
        }
        
        function parseNarrativeSection(sourceText: string) {
          const t = (sourceText || '').replace(/\s+/g,' ').trim()
          
          // Extract narrative sections using markers and question numbers
          const positiveMatch = t.match(/(?:7\s*\.\s*)?(?:أروي\s+)?التغيرات\s*والآثار\s*الإيجابية[^\n]*\n([\s\S]*?)(?=2\s*\.\s*هل|هل\s*توجد|$)/i)
          const negativeMatch = t.match(/(?:2\s*\.\s*)?هل\s*توجد\s*أي\s*نتائج\s*سلبية[^\n]*\n([\s\S]*?)(?=3\s*\.\s*ما|ما\s*الذي|$)/i)
          const unexpectedMatch = t.match(/(?:3\s*\.\s*)?ما\s*الذي\s*لم\s*يحدث[^\n]*\n([\s\S]*?)(?=4\s*\.\s*بناءاً|بناءاً|$)/i)
          const lessonsMatch = t.match(/(?:4\s*\.\s*)?بناءاً\s*على\s*ما\s*تعلمتموه[^\n]*\n([\s\S]*?)(?=5\s*\.\s*ما|ما\s*هي\s*النصائح|$)/i)
          const suggestionsMatch = t.match(/(?:5\s*\.\s*)?ما\s*هي\s*النصائح[^\n]*\n([\s\S]*?)(?=\n\s*$|$)/i)
          
          return {
            positive_changes: positiveMatch?.[1]?.trim() || null,
            negative_results: negativeMatch?.[1]?.trim() || null,
            unexpected_results: unexpectedMatch?.[1]?.trim() || null,
            lessons_learned: lessonsMatch?.[1]?.trim() || null,
            suggestions: suggestionsMatch?.[1]?.trim() || null
          }
        }

        if (Array.isArray(structuredData.reach)) {
          structuredData.reach = structuredData.reach
            .map((r: any) => normalizeReachRow(r))
            .filter((r: any) => r.activity_name)
        }
        
        // Parse demographics and narrative sections
        const demographics = parseDemographics(text)
        const narrative = parseNarrativeSection(text)
        
        // Merge results
        structuredData.demographics = demographics
        
        // Only use regex-parsed narrative as fallback if AI didn't extract them
        if (!structuredData.positive_changes && narrative.positive_changes) {
          structuredData.positive_changes = narrative.positive_changes
        }
        if (!structuredData.negative_results && narrative.negative_results) {
          structuredData.negative_results = narrative.negative_results
        }
        if (!structuredData.unexpected_results && narrative.unexpected_results) {
          structuredData.unexpected_results = narrative.unexpected_results
        }
        if (!structuredData.lessons_learned && narrative.lessons_learned) {
          structuredData.lessons_learned = narrative.lessons_learned
        }
        if (!structuredData.suggestions && narrative.suggestions) {
          structuredData.suggestions = narrative.suggestions
        }
      }

      // Attach raw OCR for transparency/debugging
      structuredData.raw_ocr = text
      
      // validated data
      return NextResponse.json(structuredData)
    } catch (error) {
      console.error('JSON parse error:', error)
      console.error('Sanitized content:', sanitizedContent)

      // Attempt a one-shot repair for F5 JSON
      if (isF5) {
        try {
          const repair = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            max_tokens: 3000,
            temperature: 0,
            messages: [
              { role: 'system', content: 'You will receive possibly malformed JSON. Return STRICT, MINIFIED JSON only (no code fences, no prose). Use exactly these keys: raw_ocr, language, date, reach (array of objects with activity_name, activity_goal, location, start_date, end_date, individual_count, household_count, male_count, female_count, under18_male, under18_female), positive_changes, negative_results, unexpected_results, lessons_learned, suggestions, reporting_person.' },
              { role: 'user', content: sanitizedContent }
            ]
          })
          const fixed = repair.choices[0]?.message?.content || ''
          const fixedSan = fixed.replace(/^[\s`]+|[\s`]+$/g, '')
          const repaired = JSON.parse(fixedSan)
          if (!repaired.language) repaired.language = detectLanguage(text)
          repaired.raw_ocr = text
          return NextResponse.json(repaired)
        } catch (repairErr) {
          console.warn('F5 repair attempt failed:', repairErr)
        }
      }

      // Fallback for F5: return a minimal valid structure so caller can proceed
      if (isF5) {
        const detectedLanguage = detectLanguage(text)
        return NextResponse.json({
          raw_ocr: text,
          language: detectedLanguage,
          date: null,
          reach: [],
          positive_changes: null,
          negative_results: null,
          unexpected_results: null,
          lessons_learned: null,
          suggestions: null,
          reporting_person: null
        })
      }

      throw new Error(`Failed to parse OpenAI response: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  } catch (error) {
    console.error('Error processing document:', error)
    return NextResponse.json({ 
      error: 'Error processing document',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 