/** Shared F1 extraction instructions for OpenAI (OCR text) and Gemini (native PDF). */

export interface F1FormMetadataForPrompt {
  currency?: string
  exchange_rate?: number
}

export function buildF1ExtractInstructions(
  formMetadata: F1FormMetadataForPrompt,
  source: 'ocr_text' | 'pdf'
): string {
  const intro =
    source === 'pdf'
      ? 'Extract information from the attached F1 work plan PDF (English or Arabic). Use layout, tables, and RTL column order. Return one JSON object only.'
      : 'Extract information from the following text (which may be in English or Arabic):'

  return `${intro}

BASIC INFORMATION:
- date: Date of the project in YYYY-MM-DD format (convert any date format to this)
- state: State name (keep in original language)
- locality: Locality name (keep in original language)
- project_objectives: Return the exact text as found in the document (verbatim, preserve line breaks). Do not summarize or shorten. If not present, return null.
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
- Exchange rate (USD to SDG): ${formMetadata.exchange_rate ?? '1'}
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
  "exchange_rate": number,
  "language": "ar" | "en"
}`
}
