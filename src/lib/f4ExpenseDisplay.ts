/** Expense row fields used when rendering F4 line items (read-only views). */
export type F4ExpenseDisplayRow = {
  expense_id?: number
  summary_id?: number | null
  project_id?: string | null
  expense_amount?: number | null
  expense_amount_sdg?: number | null
  payment_date?: string | null
  payment_method?: string | null
  seller?: string | null
  receipt_no?: string | null
  expense_description?: string | null
  expense_activity?: string | null
}

function isBlankish(value: unknown): boolean {
  if (value == null) return true
  const s = String(value).trim()
  return s === '' || s === '-'
}

/** Line items only — excludes category subtotal rows stored without a description. */
export function hasExpenseDescription(expense: F4ExpenseDisplayRow): boolean {
  return !isBlankish(expense.expense_description)
}

/**
 * Rows used for display totals and rollup actuals: must have expense_description.
 */
export function filterF4ExpensesForDisplay<T extends F4ExpenseDisplayRow>(
  expenses: T[] | null | undefined,
  _summaryTotalExpenses?: number | null
): T[] {
  return (expenses ?? []).filter(hasExpenseDescription)
}

export function sumF4ExpenseDisplayAmounts(expenses: F4ExpenseDisplayRow[]): { usd: number; sdg: number } {
  return (expenses ?? []).reduce(
    (acc, row) => ({
      usd: acc.usd + (Number(row.expense_amount) || 0),
      sdg: acc.sdg + (Number(row.expense_amount_sdg) || 0),
    }),
    { usd: 0, sdg: 0 }
  )
}

const USD_DISPLAY: Intl.NumberFormatOptions = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}

const SDG_DISPLAY: Intl.NumberFormatOptions = {
  maximumFractionDigits: 0,
}

export function formatF4UsdAmount(value: number | null | undefined): string {
  return Number(value ?? 0).toLocaleString(undefined, USD_DISPLAY)
}

export function formatF4SdgAmount(value: number | null | undefined): string {
  return Number(value ?? 0).toLocaleString(undefined, SDG_DISPLAY)
}

export type PortalF4SummaryRow = {
  id?: number
  project_id?: string | null
  total_expenses?: number | null
  report_date?: string | null
}

/** Portal project actuals: sum line-item expenses per F4 report, else err_summary.total_expenses when no rows. */
export function computePortalActualsByProject(
  expenses: F4ExpenseDisplayRow[],
  summaries: PortalF4SummaryRow[]
): Map<string, { actual: number; count: number; last: string | null }> {
  const result = new Map<string, { actual: number; count: number; last: string | null }>()
  const expensesBySummaryId = new Map<number, F4ExpenseDisplayRow[]>()

  for (const expense of expenses) {
    const summaryId = expense.summary_id
    if (summaryId == null) continue
    if (!expensesBySummaryId.has(summaryId)) expensesBySummaryId.set(summaryId, [])
    expensesBySummaryId.get(summaryId)!.push(expense)
  }

  for (const summary of summaries) {
    const projectId = summary.project_id
    if (!projectId || summary.id == null) continue

    const rows = expensesBySummaryId.get(summary.id) ?? []
    const lineItems = filterF4ExpensesForDisplay(rows, summary.total_expenses)
    let summaryActual = 0
    if (lineItems.length > 0) {
      summaryActual = sumF4ExpenseDisplayAmounts(lineItems).usd
    } else if (rows.length === 0) {
      summaryActual = Number(summary.total_expenses) || 0
    }

    const prev = result.get(projectId) || { actual: 0, count: 0, last: null }
    prev.actual += summaryActual
    prev.count += 1
    const reportDate = summary.report_date ?? null
    if (reportDate) {
      prev.last =
        prev.last && new Date(prev.last) > new Date(reportDate) ? prev.last : reportDate
    }
    result.set(projectId, prev)
  }

  return result
}

/** When err_summary rows are missing, sum line items still tied to project_id on err_expense. */
export function computePortalActualsFromProjectExpenses(
  expenses: F4ExpenseDisplayRow[],
  projectIds: string[]
): Map<string, number> {
  const byProject = new Map<string, number>()
  for (const projectId of projectIds) {
    const rows = expenses.filter((e) => e.project_id === projectId)
    const lineItems = filterF4ExpensesForDisplay(rows, null)
    if (!lineItems.length) continue
    const total = sumF4ExpenseDisplayAmounts(lineItems).usd
    if (total > 0) byProject.set(projectId, total)
  }
  return byProject
}
