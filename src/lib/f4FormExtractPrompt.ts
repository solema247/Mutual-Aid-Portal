/** F4 financial report extraction — shared by Vision+OpenAI (ocrProcess) and Gemini PDF. */

export type F4PromptSource = 'ocr_text' | 'pdf'

export function buildF4ExtractInstructions(source: F4PromptSource): string {
  const intro =
    source === 'pdf'
      ? 'Extract ONLY F4 Financial Report data from the attached PDF (Arabic or English). Read the ENTIRE PDF in order: header, expense table, then ALL content below the table (summary totals and narrative questions). RTL tables: activity names often on the right, amounts on the left. Do not infer or convert row amounts. Keep raw amounts and detected currency.'
      : 'Extract ONLY F4 Financial Report data from the text (Arabic or English). Do not infer or convert amounts. Keep raw amounts and detected currency.'

  return `${intro}

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

SECTIONS AFTER THE EXPENSE TABLE (do not skip — many errors come from stopping at the last expense row):
- Immediately after the detailed expense rows, forms usually have a SUMMARY / TOTALS block (same page or next). It is separate from per-row amounts.
- Map lines to JSON fields using labels OR letters A/B/C/D:
  - total_expenses_text ← A or Arabic like إجمالي النفقات / إجمالي المصروفات / "Total expenses"
  - total_grant_text ← B or المبلغ المستلم من المنحة / المستلم من المنحة / grant received
  - total_other_sources_text ← C or من مصادر أخرى / other sources
  - remainder_text ← D or المتبقي / المبلغ المتبقي / remainder
- Extract the numeric value only as a string (keep thousand separators as in the form, e.g. "5,270,000"). If a line has both text and a number, take the number that belongs to that summary line.
- Do NOT put A/B/C/D totals into the expenses array. Do NOT use a summary total as an expense row amount.

NARRATIVE QUESTIONS (below the A/B/C/D totals block — two numbering styles exist; map by MEANING to JSON keys):

NUMBERING VARIANTS (same four topics, different printed numbers):
- Variant A: questions labeled **(2) (3) (4) (5)**
- Variant B: questions labeled **(4) (5) (6) (7)** (older bilingual layouts)

SEMANTIC MAP (use this — NOT the digit alone):
- **excess_expenses** ← answer under the question about actual expenses **greater than** the grant / paying the **additional** amount / "أكبر من المنحة" / "المبلغ الإضافي" / "how did you pay the additional"
- **surplus_use** ← answer under expenses **less than** the grant / **surplus** / spending the remainder / "أقل من المنحة" / "الفائض" / state ERR approval note
- **lessons** ← answer under **what you learned** about budget planning / **next time** / "ماذا تعلمت" / "المرة القادمة"
- **training** ← answer under **training** or **capacity** needs / budgeting or financial management / "تدريب" / "تعزيز القدرات"

HOW TO SEPARATE QUESTION VS ANSWER (critical):
- The template prints a long question (often ending with ؟ and a marker like "(2" or "(4" at the end of the line in RTL). **Never** copy that printed question into the JSON value.
- The **answer** is only the text **below** that question (next line(s)): often **لا** or **نعم** or a short phrase, or handwriting. Include trailing punctuation/spaces after نعم/لا if visible (e.g. "نعم ,").
- If more lines follow under the same question, include them until the next numbered block starts.
- Stop when the **next** narrative question begins (next (n) marker in sequence for that template).

IMPORTANT: A lone **لا** or **نعم** (or "نعم ,") is a complete answer when nothing else is written. Do not invent long text. Do not put Q2/Q3 content into lessons/training — use the semantic map above.

TOTALS SECTION (JSON keys — same as summary block above):
- total_expenses_text, total_grant_text, total_other_sources_text, remainder_text as numeric strings or null

NARRATIVE RESPONSES (JSON keys):
- excess_expenses, surplus_use, lessons, training — full text or null

OTHER:
- language: "ar" or "en" inferred from the document
- raw_ocr: For PDF extraction use empty string "". For text-only pipelines include full source text.

Return strict JSON with keys exactly as specified above.`
}
