import vision, { ImageAnnotatorClient } from '@google-cloud/vision'
import OpenAI from 'openai'
import fs from 'fs'
import path from 'path'
import { getOpenAIApiKey } from '@/lib/getOpenAIApiKey'

// Lazy Vision client so we only validate credentials when F4/F5 OCR is used
let visionClientInstance: ImageAnnotatorClient | null = null

function loadVisionCredentials(): Record<string, unknown> {
  const filePath = process.env.GOOGLE_VISION_FILE
  let raw: string
  if (filePath && filePath.trim()) {
    const resolved = path.resolve(filePath.trim())
    try {
      raw = fs.readFileSync(resolved, 'utf8')
    } catch (e) {
      throw new Error(`GOOGLE_VISION_FILE could not be read (${resolved}). Check the path and file permissions.`)
    }
  } else {
    raw = process.env.GOOGLE_VISION || ''
  }
  if (!raw || raw.trim() === '' || raw === '{}') {
    throw new Error(
      'Vision credentials not set. In .env.local (project root) set either: ' +
      'GOOGLE_VISION_FILE=/absolute/path/to/your-service-account.json or ' +
      'GOOGLE_VISION={"type":"service_account",...} on one line. Then restart the dev server.'
    )
  }
  let creds: Record<string, unknown>
  try {
    creds = JSON.parse(raw) as Record<string, unknown>
  } catch {
    throw new Error('Vision credentials are invalid JSON. Check GOOGLE_VISION or the file at GOOGLE_VISION_FILE.')
  }
  if (!creds || typeof creds.client_email !== 'string' || typeof creds.private_key !== 'string') {
    throw new Error(
      'Vision credentials must be a service account JSON with client_email and private_key.'
    )
  }
  if (typeof creds.private_key === 'string') {
    (creds as any).private_key = (creds.private_key as string).replace(/\\n/g, '\n')
  }
  return creds
}

function getVisionClient(): ImageAnnotatorClient {
  if (visionClientInstance) return visionClientInstance
  const creds = loadVisionCredentials()
  visionClientInstance = new vision.ImageAnnotatorClient({ credentials: creds as any })
  return visionClientInstance
}

// Initialize OpenAI client lazily (only when needed)
function getOpenAIClient(): OpenAI {
  const apiKey = getOpenAIApiKey()
  if (!apiKey) {
    throw new Error(
      'OpenAI API key missing. Set OPENAI_API_KEY in project root .env.local, run npm run sync:openai-key, or add openai-key.txt. Then restart the dev server.'
    )
  }
  return new OpenAI({ apiKey })
}

function detectLanguage(text: string): 'ar' | 'en' {
  const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g
  const englishPattern = /[a-zA-Z]/g
  const arabicCount = (text.match(arabicPattern) || []).length
  const englishCount = (text.match(englishPattern) || []).length
  return arabicCount > englishCount ? 'ar' : 'en'
}

/** Normalize one F4 expense object from model output (handles alternate key names). */
function normalizeF4ExpenseRow(e: any): any {
  if (!e || typeof e !== 'object') return e
  const numLoose = (v: any): number | null => {
    if (v == null || v === '') return null
    const x = Number(String(v).replace(/[،,\s]/g, ''))
    return Number.isFinite(x) ? x : null
  }
  return {
    activity: String(e.activity ?? e.activity_name ?? e.activity_label ?? e.name ?? '').trim(),
    description: String(
      e.description ?? e.details ?? e.notes ?? e.item ?? e.detail ?? e.bayan ?? e.statement ?? e.text ?? ''
    ).trim(),
    amount_value: numLoose(e.amount_value ?? e.amount ?? e.value ?? e.expense_amount ?? e.total),
    amount_usd: numLoose(e.amount_usd ?? e.usd ?? e.usd_amount ?? e.amountUSD ?? e.amount_usd_value),
    currency: e.currency === 'USD' || e.currency === 'SDG' ? e.currency : null,
    payment_date: String(e.payment_date ?? e.date_paid ?? e.paymentDate ?? e.date ?? '').trim(),
    payment_method: String(
      e.payment_method ?? e.method ?? e.pay_method ?? e.payment_type ?? e.way_of_payment ?? ''
    ).trim(),
    receipt_no: String(
      e.receipt_no ??
        e.receipt_number ??
        e.invoice_no ??
        e.invoice ??
        e.receipt ??
        e.reference_number ??
        e.ref_no ??
        e.transaction_id ??
        e.bank_reference ??
        e.receiptNumber ??
        ''
    ).trim(),
    seller: String(
      e.seller ??
        e.vendor ??
        e.payee ??
        e.supplier ??
        e.merchant ??
        e.beneficiary ??
        e.recipient ??
        e.party ??
        ''
    ).trim()
  }
}

/** Lines in early OCR that look like F4 table headers (Arabic + English) */
function extractLikelyF4HeaderLines(ocrText: string): string {
  const lines = ocrText.split(/\r?\n/)
  const headerRe =
    /النشاط|قيمة|المصروف|المرصوف|المبلغ|تاريخ|الدفع|إيصال|ايصال|اليصال|اىصال|اإليصال|بائع|مورد|مستلم|نوع|وسيلة|طريقة|كاش|تطبيق|وصف|موجز|البيان|تفاصيل|دولار|جنيه|سدج|SDG|USD|Receipt|Payment|Seller|Vendor|Invoice|Amount|Description|Date|Method|Payee|Supplier|Reference|Transaction/i
  const picked: string[] = []
  const limit = Math.min(lines.length, 150)
  for (let i = 0; i < limit; i++) {
    const L = lines[i].trim()
    if (!L || L.length > 220) continue
    if (headerRe.test(L)) picked.push(L)
  }
  return [...new Set(picked)].slice(0, 45).join('\n')
}

function buildF4UserMessage(ocrText: string): string {
  const headerBlock = extractLikelyF4HeaderLines(ocrText)
  if (!headerBlock.trim()) return ocrText
  return (
    'DETECTED TABLE HEADER / COLUMN LABELS IN THIS OCR (read carefully; Arabic RTL; labels may be broken across lines — merge fragments like "تاري" + "خ" + "الدفع" into تاريخ الدفع):\n' +
    headerBlock +
    '\n\nUse these labels to locate each COLUMN. For every expense row, copy the cell under "تاريخ الدفع" → payment_date, "نوع الدفع" / كاش|تطبيق بنك → payment_method, "رقم الإيصال" / variants → receipt_no, "البائع/المستلم" / المورد → seller, SDG amount column → amount_value+currency SDG, USD/دولار column if present → amount_usd.\n\n--- FULL OCR TEXT ---\n\n' +
    ocrText
  )
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
  // Timeout: race the promise against a timer; only throw "timed out" when the timer wins
  const withTimeout = async <T>(p: Promise<T>, ms: number, label: string): Promise<T> => {
    let timerId: ReturnType<typeof setTimeout>
    const timeoutPromise = new Promise<never>((_, reject) => {
      timerId = setTimeout(() => reject(new Error(`${label} timed out`)), ms)
    })
    try {
      const res = await Promise.race([p, timeoutPromise])
      clearTimeout(timerId!)
      return res
    } catch (e) {
      clearTimeout(timerId!)
      throw e
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
      getVisionClient().batchAnnotateFiles({
        requests: [{
          inputConfig: { mimeType: 'application/pdf', content: base64 },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          imageContext: { languageHints: ['ar', 'en'] },
          pages
        }]
      }),
      90000,
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
      getVisionClient().documentTextDetection({
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

  const openai = getOpenAIClient()
  const jsonModel =
    (isF4 && process.env.OPENAI_F4_MODEL) ||
    (isF5 && process.env.OPENAI_F5_MODEL) ||
    (isF4 || isF5 ? process.env.OPENAI_JSON_MODEL : '') ||
    (isF4 || isF5 ? 'gpt-4o-mini' : 'gpt-3.5-turbo')
  const openAiTimeoutMs = (() => {
    const fromEnv = Number(process.env.OPENAI_COMPLETION_TIMEOUT_MS)
    if (Number.isFinite(fromEnv) && fromEnv >= 10000) return fromEnv
    return isF4 || isF5 ? 90000 : 30000
  })()
  const completion = await withTimeout(
    openai.chat.completions.create({
      model: jsonModel,
      max_tokens: isF4 || isF5 ? 4096 : 3000,
      response_format: (isF4 || isF5) ? { type: 'json_object' } as any : undefined,
      messages: [
        {
          role: 'system',
          content: isF4 ? `Extract ONLY F4 Financial Report data from the text (Arabic or English). Do not infer or convert amounts. Keep raw amounts and detected currency.

YES, YOU CAN READ ARABIC HEADERS: The user message includes OCR text from the PDF. Arabic column titles ARE in that text (often garbled or split across lines by OCR). You MUST locate them and map every data row to columns.

ARABIC F4 COLUMN HEADERS (match flexibly — OCR typos common). Map labels to JSON:
- activity ← النشاط
- description ← وصف موجز للمصروفات OR وصف موجز للمرصوفات (OCR typo مرصوفات) OR البيان OR الوصف OR تفاصيل (when not seller column)
- payment_date ← تاريخ الدفع OR التاريخ (OCR may split: تاري + خ + الدفع on separate lines — merge mentally)
- payment_method ← نوع الدفع OR وسيلة الدفع OR طريقة الدفع OR cell text كاش OR تطبيق بنك OR تحويل بنكي OR حوالة
- receipt_no ← رقم الإيصال OR رقم الايصال OR رقم اإليصال OR اإليصال OR lines with مرفق بالتقرير near numbers
- seller ← البائع OR المورد OR المستلم OR البائع/المستلم OR تفاصيل البائع OR الجهة OR الاسم التجاري
- amount_value + currency SDG ← قيمة المصروفات OR قيمة المرصوفات OR المبلغ OR قيمة النفقات
- amount_usd ← only if a دولار OR USD OR $ column exists with a number in that row

RTL COLUMN ORDER: On many forms the RIGHT side is activity/description and the LEFT side is amount — read each logical ROW left-to-right as a row, not only visual order.

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
- For each listed expense row with an amount, return an object with ALL of these keys (use empty string "" for missing text; use null only for numbers when truly absent):
  { activity: string, description: string, amount_value: number, amount_usd: number | null, currency: "USD" | "SDG" | null, payment_date: string, payment_method: string, receipt_no: string, seller: string }
- activity: Clean activity name from the activity column. If two activities share a row, use the primary one or combine. Use "" if missing.
- description: Full description or details for this expense line (e.g. narrative, notes, item description). Extract from description column or adjacent text. Use "" if not present.
- amount_value: The expense amount from the amount column (numeric, no commas). Use amounts in order - do not swap. Use null only if no amount in the row.
- amount_usd: USD amount if the row shows USD or if a USD column exists; otherwise null. Do not convert; only use if explicitly in the document.
- currency: "SDG" or "USD" from labels/symbols (e.g. SDG, جنيه, $, USD). If Arabic and unclear, default "SDG". If English and unclear, default "USD".
- payment_date: Per-row payment date in YYYY-MM-DD from the expense table (تاريخ الدفع / Payment date). Use "" if that cell is empty — do not substitute the report header date here; the server uses header date only as fallback when row date is missing.
- payment_method: Method of payment (e.g. "Bank Transfer", "Cash", "Cheque", "تحويل بنكي", "نقدي"). Use "" if not found; do not leave null.
- receipt_no: Receipt or invoice number if visible in the row or table. Use "" if not found.
- seller: Vendor/seller/payee name if visible. Use "" if not found.
- Do NOT convert amounts. Include ALL expense rows. Ignore receipt-only pages without an expense row.

ENGLISH / TRANSLATED FORMS (same rules; map headers to JSON keys):
- "Payment date" / "Date of payment" / "Date paid" → payment_date (YYYY-MM-DD)
- "Payment method" / "Type of payment" / "Cash/Bank/App" → payment_method (Bank Transfer, Cash, Cheque, or exact label in English)
- "Receipt No." / "Receipt #" / "Invoice" / "Reference" / "Transaction ID" → receipt_no (digits only as printed)
- "Seller" / "Vendor" / "Supplier" / "Payee" / "Beneficiary" / "Recipient" → seller
- "Description" / "Details" / "Brief description" → description
Each expense ROW must copy values from THAT row's cells. If the table is English, use English text in string fields.

ROW-LEVEL TEXT COLUMNS (many F4 tables have these on the SAME line as the activity — you MUST copy them into each expense object):
- Headings like "البيان" / "الوصف" / "Description" / "تفاصيل" → put that cell text in "description" (not empty if OCR shows text there).
- "تاريخ الدفع" / "التاريخ" / "Date" → payment_date as YYYY-MM-DD when a date appears on that row.
- "وسيلة الدفع" / "طريقة الدفع" / "Method" / "الدفع" → payment_method; map Arabic to English: تحويل بنكي/حوالة→Bank Transfer, نقدي→Cash, شيك/شيكات→Cheque.
- "البائع" / "المورد" / "الجهة" / "الاسم التجاري" / "Seller" / "Vendor" / "Payee" → seller.
- If there is NO separate description column but the row has extra words between activity and amount, put those words in "description".
- USD column: If the table has a دولار or USD amount column, set amount_usd from that column and amount_value from the SDG/جنيه column with currency "SDG".
- If ONLY SDG amounts appear in the amount column but the document states an exchange rate (e.g. "سعر الصرف" or "1 USD = X SDG"), set amount_usd to round(amount_value / X, 2) for that row; otherwise amount_usd may be null.

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

Return strict JSON with keys exactly as specified above. Prefer empty string for missing string fields so that description, payment_date, payment_method, receipt_no, seller are never null.` : (isF5 ? `Extract F5 program report data. Return MINIFIED JSON (no whitespace, no markdown) with EXACTLY these fields:

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
        { role: 'user', content: isF4 ? buildF4UserMessage(text) : text }
      ],
      temperature: 0.1
    }),
    openAiTimeoutMs,
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

  const formTypeUpper = formType
  if (formTypeUpper === 'F4') {
    const rawEx: any[] = Array.isArray(structuredData.expenses)
      ? structuredData.expenses
      : Array.isArray(structuredData.expense_lines)
        ? structuredData.expense_lines
        : Array.isArray(structuredData.expense_items)
          ? structuredData.expense_items
          : Array.isArray(structuredData.lines)
            ? structuredData.lines
            : []
    structuredData.expenses = rawEx.map(normalizeF4ExpenseRow).filter((x) => x && typeof x === 'object')
  }

  // F1 fallback: ensure objectives present
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


