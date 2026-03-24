# F4 Parsing and Receipt Extraction

This document describes how F4 financial report PDFs are parsed and how receipt pages are extracted and stored.

## Expense fields extracted from the PDF

When a user uploads an F4 PDF, the system runs OCR (Google Vision) and AI extraction (OpenAI) to populate expense rows. The following fields are extracted per expense line where present in the document:

| Field | Description | Stored as |
|-------|-------------|-----------|
| **Activity** | Expense activity/category name | `expense_activity` |
| **Description** | Line description or details | `expense_description` |
| **Amount** | Value in local currency (SDG) or USD | `expense_amount_sdg` / `expense_amount` |
| **Payment date** | Date of payment (YYYY-MM-DD when possible) | `payment_date` |
| **Method of payment** | e.g. Bank Transfer, Cash, Cheque | `payment_method` |
| **Receipt number** | Receipt or invoice number | `receipt_no` |
| **Seller** | Vendor/seller/payee name | `seller` |

- Text fields use **empty string** when not found (not null), so the UI does not show "null".
- **Payment method** defaults to `"Bank Transfer"` when missing.
- Extraction supports both Arabic and English F4 forms; table structure is assumed RTL for Arabic.

**Implementation:** Prompt and mapping live in [src/lib/ocrProcess.ts](../src/lib/ocrProcess.ts) (F4 system prompt) and [src/app/api/f4/parse/route.ts](../src/app/api/f4/parse/route.ts) (draft mapping).

### Model and post-processing

- **Arabic headers:** Google Vision OCR **does** return Arabic text from the PDF (including column titles). Headers are often **split across lines** or **misread** (e.g. مصروفات → مرصوفات). The F4 prompt includes a **dictionary of Arabic header phrases** → JSON fields, and the user message **prepends lines detected as headers** from the OCR so the model maps columns explicitly.
- **Report date → `summary.report_date`:** The first-table field **تاريخ التقرير** / **Report date** is parsed from OCR for **any** F4 PDF using a **standard month list** (Arabic + English names and common OCR splits, e.g. `فبر اير`). Logic lives in `parse/route.ts` (`parseF4ReportDateFromOcr`, `parseF4ReportDateSegment`, `parseF4ReportDateFromFragmentedHeader`) — not tied to one sample form.
- **Report date as `payment_date` fallback only:** For each expense row, **`payment_date`** uses the row’s own **activity-level** date when present (from the model or `enrichF4RowFromOcr`, Arabic **تاريخ الدفع** / English **Payment date**). **Only if that field is still empty** after extraction, the parsed **report date** is used as a fallback (typical when the table has no per-line payment date).
- **Amount (USD):** Many Sudan F4s only have a **SDG** amount column (`قيمة المصروفات`). If there is no **دولار / USD** column, `amount_usd` may stay empty unless an exchange-rate line is found (see parse route) or the user enters FX in the portal.
- **Default model** for F4/F5 JSON extraction is **`gpt-4o-mini`** (better table/column fidelity than `gpt-3.5-turbo`). Override with env: `OPENAI_F4_MODEL`, `OPENAI_F5_MODEL`, or `OPENAI_JSON_MODEL`.
- **Alternate JSON keys** from the model (e.g. `vendor`, `date_paid`, `amount`) are normalized in `ocrProcess` before mapping.
- **OCR line enrichment** (`parse/route.ts`): For each row, the raw OCR chunk around the activity name is scanned for payment dates, Arabic/English payment-method keywords, optional seller labels (`المورد`, `Seller`, etc.), and a fallback **description** (text before receipt number, or activity name if still empty).
- **USD from SDG:** If the document includes an exchange rate line (e.g. سعر الصرف, `1 USD = …`), **Amount (USD)** is filled as `SDG / rate` when the row has SDG but no USD.
- **Total-vs-line guard:** Clearing a line amount because it matches the report total **A** only runs when **more than one** row has an amount, so a single real line matching **A** is not wiped.

## Receipt extraction from the F4 PDF

Receipt pages embedded in the F4 PDF are detected and stored automatically when the report is saved.

### How it works

- **Main report vs receipts:** The first **3 pages** of the PDF are treated as the main F4 report. Any **pages after page 3** are treated as receipt pages.
- **On save:** When the user saves the F4 (with a PDF summary file), the backend:
  1. Uploads the full PDF as the summary attachment (`file_type: 'summary_pdf'`).
  2. If the PDF has more than 3 pages, extracts pages 4, 5, 6, … as separate single-page PDFs.
  3. Uploads each receipt page to storage under `f4-financial-reports/{state}/{err}/{serial}/{summary_id}/receipts/receipt_1.pdf`, `receipt_2.pdf`, etc.
  4. Inserts a row into `err_summary_attachments` for each with `file_type: 'receipt'`.

- Receipt attachments appear in the F4 summary view alongside manually uploaded receipts and proof-of-payment files.

### Configuration

- The main-report page count is defined in [src/lib/extractF4ReceiptPages.ts](../src/lib/extractF4ReceiptPages.ts) as `MAIN_REPORT_PAGE_COUNT = 3`. Changing this constant changes how many leading pages are considered the main form; all remaining pages are treated as receipts.

### Errors

- If receipt extraction or upload fails (e.g. invalid PDF, storage error), the save still succeeds; a warning is logged and no receipt attachments are created for that run.

## Sample F4 PDFs for tuning

Sample F4 expense PDFs used to validate and tune parsing are stored in:

- **docs/F4 documents/**

Examples: `LCC-P2H-SD-1224-0001-30.pdf`, `LCC-P2H-WK-1224-0001-04.pdf`. Use these to:

- Verify that all expense fields (description, amount, payment date, method, receipt no, seller) populate correctly.
- Adjust the AI prompt in `ocrProcess.ts` (e.g. column names, RTL hints) if your forms use different layouts.
- Confirm receipt page boundaries (first 3 pages = main, rest = receipts) and adjust `MAIN_REPORT_PAGE_COUNT` if your template differs.

## Related APIs and tables

- **Parse:** `POST /api/f4/parse` – accepts `project_id` and `file_key_temp`; returns `summaryDraft` and `expensesDraft`.
- **Save:** `POST /api/f4/save` – accepts `project_id`, `summary`, `expenses`, optional `file_key_temp`; creates `err_summary`, `err_expense`, and summary/receipt attachments.
- **Attachments:** `err_summary_attachments` – `summary_id`, `file_key`, `file_type` (`summary_pdf`, `receipt`, `proof_of_payment`).
- **View:** F4 summary detail and attachment list are returned by `GET /api/f4/summary/[id]`.
