import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { fetchF4SectorsForMatch, matchRawActivityToSectorNameEn } from '@/lib/f4ExpenseSectors'
import { sanitizeModelJsonOutput } from '@/lib/geminiStructureOcrText'
import { createGeminiParseSnipsResilient } from '@/lib/geminiParseSnipsResilient'
import { getF4AdditionalQuestionsSnipInstruction, getF4ExpenseTableSnipInstruction } from '@/lib/formStructurePrompts'
import mammoth from 'mammoth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** F4 wizard only (`/api/f4/parse-snips`). Set `GEMINI_F4_PARSE_SNIPS_MODEL=gemini-2.5-flash` to compare with full Flash. */
const F4_PARSE_SNIPS_MODEL =
  process.env.GEMINI_F4_PARSE_SNIPS_MODEL?.trim() || 'gemini-2.5-flash-lite'

/** Used when Flash Lite returns 503/overload after retries (same prompts, higher capacity tier). */
const F4_PARSE_SNIPS_FALLBACK_MODEL = 'gemini-2.5-flash'

const { generateContentResilient } = createGeminiParseSnipsResilient({
  logPrefix: '[F4 parse-snips]',
  primaryModelId: F4_PARSE_SNIPS_MODEL,
  fallbackModelId: F4_PARSE_SNIPS_FALLBACK_MODEL,
  temperatureDefault: 0.1,
})

type SnipKind = 'table' | 'questions' | 'receipts'

async function toInlineParts (files: File[]) {
  const parts: Array<{ inlineData?: { mimeType: string, data: string }, text?: string }> = []
  for (const file of files) {
    const lowerName = String(file.name || '').toLowerCase()
    const mimeType = file.type || 'application/octet-stream'
    const ab = await file.arrayBuffer()
    const buf = Buffer.from(ab)
    const isDocx =
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      lowerName.endsWith('.docx')
    if (isDocx) {
      const extracted = await mammoth.extractRawText({ buffer: buf })
      parts.push({ text: extracted.value || '' })
      continue
    }
    const base64 = buf.toString('base64')
    parts.push({
      inlineData: {
        mimeType,
        data: base64,
      },
    })
  }
  return parts
}

/** Pull token counts when the SDK exposes them (helps spot max-output truncation). */
function logGeminiUsage (response: unknown, label: string) {
  const r = response as { usageMetadata?: Record<string, unknown> } | null
  const u = r?.usageMetadata
  if (!u || typeof u !== 'object') {
    console.log(`[F4 parse-snips] ${label}`, { present: false })
    return null
  }
  const out = {
    promptTokenCount: u.promptTokenCount,
    candidatesTokenCount: u.candidatesTokenCount,
    totalTokenCount: u.totalTokenCount,
    cachedContentTokenCount: u.cachedContentTokenCount,
  }
  console.log(`[F4 parse-snips] ${label}`, { present: true, ...out })
  return out
}

/** Raw model output for questions step — confirms payload reached Gemini and shows if output is null-heavy before JSON repair. */
function logQuestionsGeminiRaw (rawText: string, response: unknown) {
  logGeminiUsage(response, 'QUESTIONS_USAGE_METADATA')
  const t = rawText.trim()
  console.log('[F4 parse-snips] QUESTIONS_RAW', {
    rawChars: rawText.length,
    head480: t.slice(0, 480),
    tail400: t.slice(-400),
    modelOutputMentionsYesNo:
      t.includes('نعم') || t.includes('لا') || /\byes\b/i.test(t) || /\bno\b/i.test(t),
  })
}

/** Diagnostics for expense-table vision extraction (row drops vs truncation vs JSON repair). */
function logTableGeminiRaw (rawText: string, response: unknown) {
  const usage = logGeminiUsage(response, 'TABLE_USAGE_METADATA')
  const trimmed = rawText.trim()
  const amountKeyHits = (rawText.match(/"amount_value"\s*:/g) || []).length
  const activityKeyHits = (rawText.match(/"activity"\s*:/g) || []).length
  const sanitizedPreview = sanitizeModelJsonOutput(rawText).trim()
  const looksLikeClosedJson = sanitizedPreview.endsWith('}')
  console.log('[F4 parse-snips] TABLE_RAW', {
    rawChars: rawText.length,
    sanitizedChars: sanitizedPreview.length,
    /** Occurrences of amount_value keys — often ~1 per expense row in output JSON */
    amountKeyHits,
    activityKeyHits,
    /** Truncated JSON often does not end with a closing brace */
    looksLikeClosedJson,
    usageMetadataPresent: Boolean(usage),
    head320: trimmed.slice(0, 320),
    tail600: trimmed.slice(-600),
  })
}

async function parseJsonWithRepair (kind: SnipKind, rawText: string) {
  const safeParse = (text: string) => {
    try {
      return JSON.parse(text)
    } catch {
      // Fix common malformed escaping from OCR-like text (e.g. "8\3").
      const escaped = text.replace(/\\(?!["\\/bfnrtu])/g, '\\\\')
      return JSON.parse(escaped)
    }
  }
  const sanitized = sanitizeModelJsonOutput(rawText)
  try {
    return safeParse(sanitized)
  } catch (firstErr) {
    console.warn('[F4 parse-snips] JSON_PARSE_RETRY', {
      kind,
      firstError: firstErr instanceof Error ? firstErr.message : String(firstErr),
      sample: sanitized.slice(0, 240),
    })
    const repairResult = await generateContentResilient(
      `You will receive malformed JSON output for F4 ${kind} extraction.
Return STRICT valid JSON only, no markdown, no explanation.
Do not change key names; only repair escaping/quoting/commas/brackets.
If a value is unknown, keep it null.`,
      8192,
      undefined,
      [
        { text: 'Repair this JSON and return valid JSON only:' },
        { text: sanitized },
      ] as any
    )
    const repaired = sanitizeModelJsonOutput(repairResult.response.text())
    try {
      return safeParse(repaired)
    } catch (repairErr) {
      console.error('[F4 parse-snips] JSON_PARSE_REPAIR_FAILED', {
        kind,
        repairError: repairErr instanceof Error ? repairErr.message : String(repairErr),
        sample: repaired.slice(0, 240),
      })
      throw repairErr
    }
  }
}

/**
 * Pass 1: read ONLY column قيمة المصروفات + footer — easier for the vision model than full rows in one shot.
 * Pass 2: full row fields; we then align expenses[].amount_value to pass 1 (fixes systematic “7 rows only” collapse).
 */
const TABLE_AMOUNT_SCAN_INSTRUCTION = `You read screenshot(s) of an Arabic F4 expense report TABLE.

Return STRICT JSON only:
{
  "data_amounts_sdg": number[],
  "total_expenses_text": string | null,
  "total_grant_text": string | null,
  "total_other_sources_text": string | null,
  "remainder_text": string | null
}

data_amounts_sdg — CRITICAL:
- Consider ONLY the ruled DATA grid ABOVE the summary block (rows labeled A إجمالي النفقات, B المنحة, C مصادر أخرى when present).
- Go row by row from TOP of that grid to BOTTOM. For each horizontal rule line that has ONE expense amount in column "قيمة المصروفات" / Expense value (last column on the left in RTL layouts), append that amount once as an integer (728000 not "728,000").
- One visible grid row with one amount ⇒ exactly ONE array element. Never collapse several rows into one number.
- Do NOT append numbers from rows A/B/C. Do NOT skip rows because column النشاط is empty.
- Real tables often have 10–14 body rows in one image. Outputting only ~7 numbers when more ruled rows with amounts exist is an ERROR.

Footer strings:
- If rows A/B/C show totals, copy the numeric text beside each into total_expenses_text, total_grant_text, total_other_sources_text as printed (strings). remainder_text if a D line exists; else null.

Return JSON only.`

function mergeFooterTotals (full: Record<string, unknown>, scan: Record<string, unknown>): Record<string, unknown> {
  const keys = ['total_expenses_text', 'total_grant_text', 'total_other_sources_text', 'remainder_text'] as const
  const out = { ...full }
  for (const k of keys) {
    const cur = out[k]
    const add = scan[k]
    if ((cur == null || cur === '') && add != null && add !== '') out[k] = add
  }
  return out
}

/** Force expenses length and amount_value to match pass-1 scan (pad with empty metadata if detail pass was short). */
function alignExpensesToAmounts (parsed: Record<string, unknown>, amounts: number[]): Record<string, unknown> {
  const prev = Array.isArray(parsed.expenses)
    ? (parsed.expenses as Record<string, unknown>[])
    : []
  const expenses = amounts.map((amt, i) => {
    const row = prev[i] || {}
    const cur = row.currency === 'USD' ? 'USD' : row.currency === 'SDG' ? 'SDG' : 'SDG'
    return {
      activity: row.activity != null && String(row.activity).trim() !== '' ? String(row.activity) : '',
      amount_value: amt,
      currency: cur,
      description: row.description != null ? String(row.description) : null,
      payment_date: row.payment_date != null ? String(row.payment_date) : null,
      payment_method: row.payment_method != null ? String(row.payment_method) : null,
      receipt_no: row.receipt_no != null ? String(row.receipt_no) : null,
      seller: row.seller != null ? String(row.seller) : null,
    }
  })
  return { ...parsed, expenses }
}

async function parseTableSnippetsWithGemini (files: File[]): Promise<unknown> {
  const parts = await toInlineParts(files)

  const scanResult = await generateContentResilient(
    TABLE_AMOUNT_SCAN_INSTRUCTION,
    8192,
    { temperature: 0 },
    [
      {
        text:
          'Task: list every body-row amount from column قيمة المصروفات top-to-bottom, and footer A/B/C text. JSON only.',
      },
      ...parts as any[],
    ] as any
  )
  const scanRaw = scanResult.response.text()
  let scanParsed: Record<string, unknown> = {}
  try {
    scanParsed = (await parseJsonWithRepair('table', scanRaw)) as Record<string, unknown>
  } catch {
    console.warn('[F4 parse-snips] TABLE_PASS1_PARSE_FAILED', { sample: scanRaw.slice(0, 400) })
  }
  const rawArr = scanParsed.data_amounts_sdg
  const amounts = Array.isArray(rawArr)
    ? rawArr
      .map((x: unknown) => Number(x))
      .filter((n: number) => Number.isFinite(n) && n > 0)
    : []

  console.log('[F4 parse-snips] TABLE_PASS1_AMOUNTS', {
    count: amounts.length,
    amounts,
    footer: {
      total_expenses_text: scanParsed.total_expenses_text ?? null,
      total_grant_text: scanParsed.total_grant_text ?? null,
      total_other_sources_text: scanParsed.total_other_sources_text ?? null,
    },
  })

  const tableInstruction = getF4ExpenseTableSnipInstruction()
  const detailHint =
    amounts.length > 0
      ? `This expense grid has EXACTLY ${amounts.length} data rows (confirmed from column قيمة المصروفات).

The amounts in order from TOP to BOTTOM are:
${amounts.map((a, i) => `${i + 1}. ${a}`).join('\n')}

You MUST return "expenses" as an array of length ${amounts.length}.
For each index i, set expenses[i].amount_value to the i-th number above (exact match).
Fill activity from النشاط; if blank use the first line of وصف موجز للمصروفات. Put full brief description in "description".
Map تاريخ الدفع, البائع, نوع الدفع, رقم الإيصال from their columns.
Extract footer A/B/C into total_expenses_text, total_grant_text, total_other_sources_text when visible.

Return JSON only.`
      : `Extract the full expense table (every body row with description columns). Return JSON only.`

  const detailResult = await generateContentResilient(
    tableInstruction,
    16384,
    { temperature: 0 },
    [{ text: detailHint }, ...parts as any[]] as any
  )
  const detailRaw = detailResult.response.text()
  logTableGeminiRaw(detailRaw, detailResult.response)

  let parsed = (await parseJsonWithRepair('table', detailRaw)) as Record<string, unknown>
  const beforeAlign = Array.isArray(parsed.expenses) ? parsed.expenses.length : 0
  parsed = mergeFooterTotals(parsed, scanParsed)
  if (amounts.length > 0) {
    parsed = alignExpensesToAmounts(parsed, amounts)
  }
  console.log('[F4 parse-snips] TABLE_ROW_ALIGN', {
    pass1AmountCount: amounts.length,
    pass2ExpenseRowsBeforeAlign: beforeAlign,
    finalExpenseRows: Array.isArray(parsed.expenses) ? parsed.expenses.length : 0,
  })

  return parsed
}

async function parseWithGemini (kind: SnipKind, files: File[], expectedAmounts: number[] = []) {
  if (kind === 'table') {
    return parseTableSnippetsWithGemini(files)
  }

  const questionInstruction = `Extract only F4 additional-question answers from provided snippet images/PDFs.
Return STRICT JSON:
{
  "excess_expenses": string | null,
  "surplus_use": string | null,
  "lessons": string | null,
  "training": string | null
}
Mapping by meaning (numbering varies):
- excess_expenses: answer to "if expenses were greater than grant, how paid extra?"
- surplus_use: answer to "if expenses were less than grant, how spend surplus?"
- lessons: answer to "what did you learn about budgeting / what would you do differently?"
- training: answer to "additional training/capacity needs in budgeting/financial management?"
Rules:
- Return answer text only, never question text.
- Ignore clarification-only text (e.g. "يجب الحصول على الموافقة...") unless it is the actual answer.
- If no answer is present, return null.
- If answer appears in later continuation bullet/line, include it.`

  const expectedHint = expectedAmounts.length
    ? `Expected expense totals to validate against (SDG): [${expectedAmounts.join(', ')}].`
    : 'No expected totals provided.'
  const receiptInstruction = `You are extracting ONE receipt snippet.
Return STRICT JSON:
{
  "amount_value": number | null,
  "currency": "SDG" | "USD" | null,
  "reference": string | null
}
Rules:
- Extract ONLY the final total paid/transaction amount for this receipt (NOT phone/account/reference/operation IDs).
- If multiple numbers exist, choose the amount that represents the total transfer/payment value.
- Prefer values associated with terms like: مبلغ, القيمة, الإجمالي, total, amount, تحويل.
- ${expectedHint}
- If the detected amount is clearly not a payment total or not reasonably close to any expected total, return amount_value as null.
- Keep amount numeric without separators.
- If truly unclear, return amount_value as null.`

  if (kind === 'receipts') {
    const receipts: Array<{ amount_value: number | null, currency: 'SDG' | 'USD' | null, reference: string | null }> = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const parts = await toInlineParts([file])
      const result = await generateContentResilient(
        receiptInstruction,
        8192,
        undefined,
        [
          { text: `Process receipt snippet ${i + 1}/${files.length}. Return JSON only.` },
          ...parts as any[],
        ] as any
      )
      const parsed = await parseJsonWithRepair(kind, result.response.text())
      const obj = parsed && typeof parsed === 'object' ? parsed : {}
      const amount = obj && (obj as any).amount_value != null ? Number((obj as any).amount_value) : null
      const currency = (obj as any)?.currency === 'USD' ? 'USD' : (obj as any)?.currency === 'SDG' ? 'SDG' : null
      const reference = (obj as any)?.reference != null ? String((obj as any).reference) : file.name
      receipts.push({
        amount_value: Number.isFinite(amount as number) ? amount : null,
        currency,
        reference,
      })
    }
    return { receipts }
  }

  const parts = await toInlineParts(files)
  /** Put images first so vision attention stays on the snippet; instruction reinforces numbered (4)-(7) mapping. */
  const result = await generateContentResilient(
    questionInstruction,
    8192,
    { temperature: 0 },
    [
      ...parts as any[],
      {
        text:
          'Using the image(s) above: map answers under (4)(5)(6)(7) to excess_expenses, surplus_use, lessons, training (see system rules). Copy نعم/لا verbatim when that is the whole answer. Return JSON only.',
      },
    ] as any
  )
  const rawText = result.response.text()
  logQuestionsGeminiRaw(rawText, result.response)
  return parseJsonWithRepair(kind, rawText)
}

function toFiniteAmount (value: unknown): number | null {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : null
}

export async function POST (request: Request) {
  try {
    const form = await request.formData()
    const kindRaw = String(form.get('kind') || '').toLowerCase()
    if (!['table', 'questions', 'receipts'].includes(kindRaw)) {
      return NextResponse.json({ error: 'kind must be table|questions|receipts' }, { status: 400 })
    }
    const kind = kindRaw as SnipKind
    const files = form.getAll('files').filter(Boolean) as File[]
    if (!files.length) {
      return NextResponse.json({ error: 'No snippet files provided' }, { status: 400 })
    }
    console.log('[F4 parse-snips] START', {
      kind,
      model: F4_PARSE_SNIPS_MODEL,
      fileCount: files.length,
      files: files.map(f => ({ name: f.name, mime: f.type || '(unknown)', bytes: f.size })),
      ts: new Date().toISOString(),
    })

    let expected: number[] = []
    if (kind === 'receipts') {
      const expectedRaw = String(form.get('expense_amounts_sdg') || '[]')
      try {
        expected = (JSON.parse(expectedRaw) as unknown[])
          .map(v => Number(v))
          .filter(v => Number.isFinite(v) && v > 0)
      } catch {}
    }

    const parsed = await parseWithGemini(kind, files, expected)
    console.log('[F4 parse-snips] GEMINI_DONE', {
      kind,
      hasParsed: Boolean(parsed),
      keys: parsed && typeof parsed === 'object' ? Object.keys(parsed) : [],
    })

    if (kind === 'receipts') {
      const normalizedReceipts = Array.isArray(parsed?.receipts)
        ? parsed.receipts.map((r: any) => ({
            ...r,
            amount_value: toFiniteAmount(r?.amount_value),
          }))
        : []
      const found = normalizedReceipts.map((r: any) => toFiniteAmount(r?.amount_value))
      const receiptsTotalSdg = found.reduce((sum: number, value: number | null) => sum + (value || 0), 0)
      const detectedCount = found.filter((v: number | null) => v != null).length
      const expectedTotalSdg = expected.reduce((sum: number, value: number) => sum + value, 0)
      console.log('[F4 parse-snips] RECEIPT_COMPARE', {
        expectedCount: expected.length,
        expectedTotalSdg,
        foundCount: detectedCount,
        receiptsTotalSdg,
        normalizedFound: found,
      })
      return NextResponse.json({
        receipts: normalizedReceipts,
        receipts_total_sdg: receiptsTotalSdg,
        receipts_detected_count: detectedCount,
        expected_count: expected.length,
        expected_total_sdg: expectedTotalSdg,
      })
    }

    if (kind === 'table') {
      const expenses = Array.isArray(parsed?.expenses) ? parsed.expenses : []
      const rowPreview = expenses.slice(0, 20).map((row: Record<string, unknown>, i: number) => ({
        i,
        activity: typeof row.activity === 'string' ? row.activity.slice(0, 72) : row.activity,
        amount_value: row.amount_value,
        currency: row.currency ?? null,
      }))
      const sumAmounts = expenses.reduce((acc: number, row: Record<string, unknown>) => {
        const n = Number(row.amount_value)
        return acc + (Number.isFinite(n) ? n : 0)
      }, 0)
      console.log('[F4 parse-snips] TABLE_RESULT', {
        expenseRows: expenses.length,
        total_expenses_text: parsed?.total_expenses_text ?? null,
        total_grant_text: parsed?.total_grant_text ?? null,
        total_other_sources_text: parsed?.total_other_sources_text ?? null,
        remainder_text: parsed?.remainder_text ?? null,
        sumParsedAmountValues: sumAmounts,
        rowPreview,
      })
    } else if (kind === 'questions') {
      const qLen = (v: unknown) => (v != null && String(v).trim() !== '' ? String(v).length : 0)
      console.log('[F4 parse-snips] QUESTIONS_RESULT', {
        excess_expenses: parsed?.excess_expenses ? String(parsed.excess_expenses).slice(0, 120) : null,
        surplus_use: parsed?.surplus_use ? String(parsed.surplus_use).slice(0, 120) : null,
        lessons: parsed?.lessons ? String(parsed.lessons).slice(0, 120) : null,
        training: parsed?.training ? String(parsed.training).slice(0, 120) : null,
        nonEmptyFields: ['excess_expenses', 'surplus_use', 'lessons', 'training'].filter(
          (k) => qLen((parsed as Record<string, unknown>)?.[k]) > 0
        ),
        charLengths: {
          excess_expenses: qLen(parsed?.excess_expenses),
          surplus_use: qLen(parsed?.surplus_use),
          lessons: qLen(parsed?.lessons),
          training: qLen(parsed?.training),
        },
      })
    }

    if (kind === 'table' && parsed && typeof parsed === 'object') {
      const supabase = getSupabaseRouteClient()
      const sectors = await fetchF4SectorsForMatch(supabase)
      const body = parsed as Record<string, unknown>
      if (Array.isArray(body.expenses) && sectors.length) {
        body.expenses = body.expenses.map((row: Record<string, unknown>) => ({
          ...row,
          activity: matchRawActivityToSectorNameEn(row.activity as string | null | undefined, sectors),
        }))
      }
    }

    return NextResponse.json(parsed || {})
  } catch (e) {
    console.error('[F4 parse-snips] error', {
      message: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
      ts: new Date().toISOString(),
    })
    return NextResponse.json({ error: 'Failed to parse snippets' }, { status: 500 })
  }
}

