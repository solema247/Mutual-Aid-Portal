/**
 * System instructions for turning OCR/plain text into structured JSON (F1 / F4 / F5).
 * Kept in one module so /api/fsystem/process and ocrProcess stay aligned.
 */

export type FormStructureFormType = 'F1' | 'F4' | 'F5'

export interface FormStructureMetadata {
  currency?: string
  exchange_rate?: number
}

export function getFormStructureSystemInstruction (
  formType: FormStructureFormType,
  formMetadata: FormStructureMetadata
): string {
  if (formType === 'F4') return F4_SYSTEM_PROMPT
  if (formType === 'F5') return F5_SYSTEM_PROMPT
  return buildF1SystemPrompt(formMetadata)
}

const F4_SYSTEM_PROMPT = `Extract ONLY F4 Financial Report data from the text (Arabic or English). Do not infer or convert amounts. Keep raw amounts and detected currency.

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
   - NOTE: In some templates, section (2) is attachments and the expense table starts at section (3). Still extract all table rows.

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

NARRATIVE RESPONSES (map by meaning; numbering varies by template — often 4–7, sometimes 3–6 before an attachments-only item 7):
- excess_expenses: answer to "expenses greater than grant — how paid extra?" (DO NOT return the question text); else null
- surplus_use: answer to "expenses less than grant — how to use surplus?" (DO NOT return the question text); else null
- lessons: answer to "what did you learn about budget planning / do differently next time?" (DO NOT return the question text); else null
- training: answer to "additional training or capacity needs in budgeting/finance?" (DO NOT return the question text). If the next numbered item is only "attach receipts", return null unless there is a real answer; else null
- IMPORTANT: Question numbering may vary across forms (often 4-7, but can be 2-5). Match by question meaning/text, not fixed numbers.
- IMPORTANT: Some forms use extended numbering (e.g., 4..11) where:
  - item 6 can be an "expenses equal to grant" statement,
  - lessons start at 7 and may continue in 8/9,
  - training question is 10 with answer in 11.
  Map these into: excess_expenses, surplus_use, lessons, training.
- IMPORTANT: If answer is a short direct response (e.g., نعم / لا / Yes / No), return ONLY that answer token.
- CRITICAL BOUNDARY: Stop narrative extraction at attachment/receipt sections such as:
  "الاشعارات", "الإشعارات", "الفواتير", "المرفقات", bank transfer slips, receipts, contracts.
  Do NOT use text from those sections as answers.
- If a narrative answer is not present or unclear, return null (never return the question text).

OTHER:
- language: "ar" or "en" inferred from the text
- raw_ocr: include full OCR text back to caller

Return strict JSON with keys exactly as specified above.`

/**
 * System instruction for vision snippets of the F4 expense table only (`/api/f4/parse-snips`, kind=table).
 * Kept explicit about row completeness — short prompts caused dropped rows on RTL / multi-line tables.
 */
export function getF4ExpenseTableSnipInstruction (): string {
  return `You read IMAGES of one or more snippets from an F4 financial report EXPENSE TABLE only (Arabic or English).

Return STRICT JSON:
{
  "expenses": Array<{
    "activity": string,
    "amount_value": number,
    "currency": "SDG" | "USD" | null,
    "description": string | null,
    "payment_date": string | null,
    "payment_method": string | null,
    "receipt_no": string | null,
    "seller": string | null
  }>,
  "total_expenses_text": string | null,
  "total_grant_text": string | null,
  "total_other_sources_text": string | null,
  "remainder_text": string | null
}

COMMON ARABIC COLUMN NAMES (map carefully — RTL order varies):
- النشاط = primary activity label (often EMPTY for many rows — do NOT skip those rows).
- وصف موجز للمصروفات = brief expense description (often has the real text when النشاط is blank).
- قيمة المصروفات = expense AMOUNT for that row (required).
- تاريخ الدفع, تفاصيل البائع/المستلم, نوع الدفع, رقم الإيصال map to payment_date, seller, payment_method, receipt_no when visible.

ACTIVITY vs DESCRIPTION (critical — avoids null activity and dropped rows):
- NEVER leave "activity" null. If النشاط is empty, fill "activity" from the first line (or first ~80 characters) of وصف موجز للمصروفات using the real Arabic text visible in that cell.
- Put the FULL cell text from وصف موجز للمصروفات into "description" (you may join wrapped lines with a space). Multi-line text in ONE cell = ONE table row = ONE expense object.

COMPLETENESS (most important):
- Count ruled horizontal DATA rows from top to bottom that each have ONE amount in قيمة المصروفات. Your "expenses" length MUST equal that count.
- Typical grids show 10–15 data rows before summary rows A/B/C — extracting only ~7 objects is WRONG unless the image truly has only seven amount cells.
- Do NOT merge rows that share the same seller, receipt number, or date: if two amounts appear on two grid lines, output TWO objects.
- Do NOT skip rows because النشاط is blank — those rows still have description and amount.
- Summary block below the grid (A إجمالي النفقات, B المنحة, C مصادر أخرى) is NOT part of the expense array; copy those numbers only into total_* and remainder_text fields.

RTL / ARABIC TABLES:
- Read row-by-row: one amount cell ↔ one object. Align by horizontal rule lines in the grid.

AMOUNTS:
- amount_value: numeric only, no commas. Use the amount from قيمة المصروفات on that row only.
- Ignore "base" amounts inside descriptive prose (e.g. "على مبلغ 5,000,000") — use the row amount column.
- Default currency to SDG when the form is Arabic and currency is unclear.

TOTALS / FOOTER:
- Extract A/B/C (or إجمالي النفقات / المنحة / مصادر أخرى) into total_expenses_text, total_grant_text, total_other_sources_text; remainder_text when a D line exists; else null.

OTHER:
- Omit narrative-only areas outside the ruled expense grid.
- Return JSON only, no markdown.`
}

/**
 * Vision snippets for F4 “additional questions” (`/api/f4/parse-snips`, kind=questions).
 * Matches narrative mapping in F4_SYSTEM_PROMPT but tuned for screenshots (Arabic numbering varies).
 */
export function getF4AdditionalQuestionsSnipInstruction (): string {
  return `You read screenshot(s) of an F4 financial report showing ADDITIONAL QUESTIONS after the expense table (Arabic and/or English).

Return STRICT JSON only:
{
  "excess_expenses": string | null,
  "surplus_use": string | null,
  "lessons": string | null,
  "training": string | null
}

PRIMARY RULE — NUMBERED QUESTIONS (4)(5)(6)(7):
Many Sudan F4 templates number these items exactly (4) through (7) from TOP to BOTTOM. When you see that pattern:
- The answer line directly UNDER question (4) → put in "excess_expenses"
- The answer line directly UNDER question (5) → put in "surplus_use"
- The answer line directly UNDER question (6) → put in "lessons"
- The answer line directly UNDER question (7) → put in "training"

YES/NO ANSWERS ARE FULL ANSWERS:
- If the only visible answer under a question is نعم or لا (or Yes/No in English), output EXACTLY that token as the JSON string.
- NEVER map نعم or لا to JSON null — null means “no answer written”, not “negative answer”.
- NEVER omit short answers because they look too brief.

SECONDARY RULE — match by question MEANING if numbers differ:
1) excess_expenses — expenses GREATER than grant — how extra was paid (أكبر من المنحة، المبلغ الإضافي، تجاوز، الفائض…)
2) surplus_use — expenses LESS than grant — how surplus used (أقل من المنحة، الفائض، كيف ترغب في إنفاق…)
3) lessons — lessons learned / budget planning / differently next time (ماذا تعلمت، تخطيط الميزانية…)
4) training — training / capacity needs in budgeting or finance (تدريب، احتياجات، تعزيز القدرات…)

Extraction rules:
- Copy ANSWER lines only (usually the line(s) immediately below each numbered question). Do not paste the question paragraph into the value.
- RTL Arabic layout: the short answer (e.g. نعم or لا) is often on the line immediately after the long question paragraph.
- Multi-line answers: join with spaces.
- Handwriting: transcribe if legible.

Use null for a key ONLY when there is truly no answer text for that slot in the image.

Return JSON only, no markdown.`
}

const F5_SYSTEM_PROMPT = `Extract F5 program report data. Return MINIFIED JSON (no whitespace, no markdown) with EXACTLY these fields:

date: Report date (string)
language: "ar" | "en"
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
{"date":"2025-08-25","language":"ar","reach":[{"activity_name":"ورشة تدريبية","activity_goal":"هدف الورشة","location":"موقع التنفيذ","start_date":"2025-08-01","end_date":"2025-08-02","individual_count":30,"household_count":10,"male_count":15,"female_count":15,"under18_male":5,"under18_female":5}],"positive_changes":"التغييرات الإيجابية","negative_results":null,"unexpected_results":null,"lessons_learned":null,"suggestions":null,"reporting_person":"اسم المسؤول"}`

function buildF1SystemPrompt (formMetadata: FormStructureMetadata): string {
  return `Extract information from the following text (which may be in English or Arabic):

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
- If form currency is USD, keep amounts in USD (do NOT convert)
- Return both USD and SDG amounts in the final JSON
- For USD forms: total_cost_usd should be the original USD amount, total_cost_sdg should be null
- For SDG forms: total_cost_sdg should be the original SDG amount, total_cost_usd should be the converted USD amount

Example (USD form):
الإجمالي: $3,900 | سعر الوحدة: $32.5 | المصروفات: مشتريات طبية
Should extract: { activity: "مشتريات طبية", total_cost_usd: 3900, total_cost_sdg: null, currency: "USD" }

Example (SDG form with exchange rate 2700):
الإجمالي: 5,000,000 SDG | المصروفات: مشتريات طبية
Should extract: { activity: "مشتريات طبية", total_cost_usd: 1851.85, total_cost_sdg: 5000000, currency: "SDG" }
Note: Always include the original SDG amount in total_cost_sdg when form currency is SDG

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
}`
}
