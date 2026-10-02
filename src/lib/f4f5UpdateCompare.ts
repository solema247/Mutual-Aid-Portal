/**
 * Normalized comparison for F4/F5 update payloads (client + server).
 * Matches the logical shape sent to POST /api/f4/update and POST /api/f5/update.
 */

function nullIfEmpty(value: unknown): string | null {
  if (value === undefined || value === null) return null
  const s = String(value).trim()
  return s === '' ? null : s
}

export function normalizeReportDate(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  const s = String(value).trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return s
}

export function normalizeNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Deep-clone JSON-compatible values; null/undefined/'' equivalent at scalars. */
export function normalizeForCompare(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(normalizeForCompare)
  if (typeof value === 'object') {
    const src = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(src).sort()) {
      out[key] = normalizeForCompare(src[key])
    }
    return out
  }
  return value
}

export function payloadCompareKey(payload: unknown): string {
  return JSON.stringify(normalizeForCompare(payload))
}

export function updatePayloadsEqual(a: unknown, b: unknown): boolean {
  return payloadCompareKey(a) === payloadCompareKey(b)
}

export function normalizeF4ExpenseRow(e: Record<string, unknown>): Record<string, unknown> {
  return {
    expense_activity: nullIfEmpty(e.expense_activity),
    expense_description: nullIfEmpty(e.expense_description),
    expense_amount_sdg: normalizeNumber(e.expense_amount_sdg),
    expense_amount: normalizeNumber(e.expense_amount),
    payment_date: normalizeReportDate(e.payment_date),
    payment_method: nullIfEmpty(e.payment_method) ?? 'Bank Transfer',
    receipt_no: nullIfEmpty(e.receipt_no),
    seller: nullIfEmpty(e.seller),
  }
}

export function buildF4UpdateComparePayload(args: {
  summaryDraft: Record<string, unknown>
  expensesDraft: Array<Record<string, unknown>>
  totalGrantUSD: number
}): { summary: Record<string, unknown>; expenses: Record<string, unknown>[] } {
  const sd = args.summaryDraft
  const totalExpensesSDG = args.expensesDraft.reduce(
    (s, ex) => s + (Number(ex.expense_amount_sdg) || 0),
    0
  )
  const totalExpensesUSD = args.expensesDraft.reduce(
    (s, ex) => s + (Number(ex.expense_amount) || 0),
    0
  )
  const totalGrantUSD = Number(args.totalGrantUSD) || 0
  const remainderUSD = totalGrantUSD - totalExpensesUSD

  return {
    summary: {
      report_date: normalizeReportDate(sd.report_date),
      beneficiaries: nullIfEmpty(sd.beneficiaries),
      lessons: nullIfEmpty(sd.lessons),
      training: nullIfEmpty(sd.training),
      excess_expenses: nullIfEmpty(sd.excess_expenses),
      surplus_use: nullIfEmpty(sd.surplus_use),
      total_other_sources: normalizeNumber(sd.total_other_sources),
      total_grant: normalizeNumber(totalGrantUSD),
      total_expenses: normalizeNumber(totalExpensesUSD),
      total_expenses_sdg: normalizeNumber(totalExpensesSDG),
      remainder: normalizeNumber(remainderUSD),
    },
    expenses: args.expensesDraft.map(normalizeF4ExpenseRow),
  }
}

export function buildF4UpdateComparePayloadFromDb(args: {
  summaryRow: Record<string, unknown>
  expenseRows: Array<Record<string, unknown>>
}): { summary: Record<string, unknown>; expenses: Record<string, unknown>[] } {
  const sr = args.summaryRow
  return {
    summary: {
      report_date: normalizeReportDate(sr.report_date),
      beneficiaries: nullIfEmpty(sr.beneficiaries),
      lessons: nullIfEmpty(sr.lessons),
      training: nullIfEmpty(sr.training),
      excess_expenses: nullIfEmpty(sr.excess_expenses),
      surplus_use: nullIfEmpty(sr.surplus_use),
      total_other_sources: normalizeNumber(sr.total_other_sources),
      total_grant: normalizeNumber(sr.total_grant),
      total_expenses: normalizeNumber(sr.total_expenses),
      total_expenses_sdg: normalizeNumber(sr.total_expenses_sdg),
      remainder: normalizeNumber(sr.remainder),
    },
    expenses: args.expenseRows.map(normalizeF4ExpenseRow),
  }
}

export function normalizeF5ReachRow(r: Record<string, unknown>): Record<string, unknown> {
  return {
    id: r.id != null && String(r.id).trim() !== '' ? String(r.id) : null,
    activity_name: nullIfEmpty(r.activity_name),
    activity_goal: nullIfEmpty(r.activity_goal),
    category: r.category == null || String(r.category).trim() === '' ? null : String(r.category).trim(),
    location: nullIfEmpty(r.location),
    start_date: normalizeReportDate(r.start_date),
    end_date: normalizeReportDate(r.end_date),
    individual_count: normalizeNumber(r.individual_count),
    household_count: normalizeNumber(r.household_count),
    male_count: normalizeNumber(r.male_count),
    female_count: normalizeNumber(r.female_count),
    under18_male: normalizeNumber(r.under18_male),
    under18_female: normalizeNumber(r.under18_female),
    people_with_disabilities: normalizeNumber(r.people_with_disabilities),
  }
}

export function buildF5UpdateComparePayload(args: {
  summaryDraft: Record<string, unknown>
  reachDraft: Array<Record<string, unknown>>
}): { summary: Record<string, unknown>; reach: Record<string, unknown>[] } {
  const sd = args.summaryDraft
  return {
    summary: {
      report_date: normalizeReportDate(sd.report_date),
      reporting_person: nullIfEmpty(sd.reporting_person),
      positive_changes: nullIfEmpty(sd.positive_changes),
      negative_results: nullIfEmpty(sd.negative_results),
      unexpected_results: nullIfEmpty(sd.unexpected_results),
      lessons_learned: nullIfEmpty(sd.lessons_learned),
      suggestions: nullIfEmpty(sd.suggestions),
    },
    reach: args.reachDraft.map(normalizeF5ReachRow),
  }
}

export function buildF5UpdateComparePayloadFromDb(args: {
  reportRow: Record<string, unknown>
  reachRows: Array<Record<string, unknown>>
}): { summary: Record<string, unknown>; reach: Record<string, unknown>[] } {
  const rr = args.reportRow
  return {
    summary: {
      report_date: normalizeReportDate(rr.report_date),
      reporting_person: nullIfEmpty(rr.reporting_person),
      positive_changes: nullIfEmpty(rr.positive_changes),
      negative_results: nullIfEmpty(rr.negative_results),
      unexpected_results: nullIfEmpty(rr.unexpected_results),
      lessons_learned: nullIfEmpty(rr.lessons_learned),
      suggestions: nullIfEmpty(rr.suggestions),
    },
    reach: args.reachRows.map(normalizeF5ReachRow),
  }
}
