import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { transferAmount } from '@/lib/grantManagement/fundTransferHelpers'
import { projectExpenseTotal } from '@/lib/poolProjectClassification'

type AdminClient = ReturnType<typeof getSupabaseAdmin>

const PROJECT_ID_CHUNK = 200

type PaymentConfirmationFspRow = {
  project_id: string
  fsp_id: string | null
  transfer_date: string | null
  created_at: string
}

async function fetchAll(
  supabase: AdminClient,
  table: string,
  select: string
): Promise<{ data: Record<string, unknown>[]; error: { message?: string } | null }> {
  const all: Record<string, unknown>[] = []
  let from = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1)
    if (error) return { data: all, error }
    if (!data?.length) break
    all.push(...(data as unknown as Record<string, unknown>[]))
    if (data.length < pageSize) break
    from += pageSize
  }
  return { data: all, error: null }
}

function isLaterConfirmation(
  a: PaymentConfirmationFspRow,
  b: PaymentConfirmationFspRow
): boolean {
  const aDate = a.transfer_date || ''
  const bDate = b.transfer_date || ''
  if (aDate !== bDate) {
    if (!aDate) return false
    if (!bDate) return true
    return aDate > bDate
  }
  return (a.created_at || '') > (b.created_at || '')
}

/** Latest F3 confirmation that has an FSP, keyed by project id. */
export function latestConfirmationFspByProject(
  confirmations: PaymentConfirmationFspRow[]
): Map<string, string> {
  const latest = new Map<string, PaymentConfirmationFspRow>()
  for (const row of confirmations) {
    const fspId = row.fsp_id != null ? String(row.fsp_id).trim() : ''
    if (!fspId) continue
    const projectId = row.project_id != null ? String(row.project_id) : ''
    if (!projectId) continue
    const prev = latest.get(projectId)
    if (!prev || isLaterConfirmation(row, prev)) latest.set(projectId, row)
  }

  const out = new Map<string, string>()
  for (const [projectId, row] of latest) {
    out.set(projectId, String(row.fsp_id))
  }
  return out
}

async function fetchPaymentConfirmations(
  supabase: AdminClient
): Promise<PaymentConfirmationFspRow[]> {
  const { data, error } = await fetchAll(
    supabase,
    'mou_payment_confirmations',
    'project_id, fsp_id, transfer_date, created_at'
  )
  if (error && /fsp_id/i.test(error.message || '')) return []
  return data.map((row) => ({
    project_id: row.project_id != null ? String(row.project_id) : '',
    fsp_id: row.fsp_id != null ? String(row.fsp_id) : null,
    transfer_date: row.transfer_date != null ? String(row.transfer_date) : null,
    created_at: row.created_at != null ? String(row.created_at) : '',
  }))
}

async function fetchProjectExpensesById(
  supabase: AdminClient,
  projectIds: string[]
): Promise<Map<string, unknown>> {
  const expenses = new Map<string, unknown>()
  for (let i = 0; i < projectIds.length; i += PROJECT_ID_CHUNK) {
    const chunk = projectIds.slice(i, i + PROJECT_ID_CHUNK)
    const { data, error } = await supabase
      .from('err_projects')
      .select('id, expenses')
      .in('id', chunk)
    if (error || !data?.length) continue
    for (const row of data) {
      expenses.set(String(row.id), row.expenses)
    }
  }
  return expenses
}

/**
 * Treasury in = transfer segments with an assigned FSP (activity + fee).
 * Treasury out = F3 payment-confirmation FSP × that project's F3 total
 * (project expense total). Not split across F4 activity lines.
 */
export async function attachFspTreasuryRollups<T extends Record<string, unknown>>(
  supabase: AdminClient,
  fsps: T[]
): Promise<
  Array<
    T & {
      treasury_in_usd: number
      treasury_out_usd: number
      balance: number
      activity_funds: number
      fees: number
      total_funds: number
    }
  >
> {
  if (!fsps.length) return []

  const [transferResult, confirmations] = await Promise.all([
    fetchAll(supabase, 'transfer_segments', 'fsp_id, activity_amount, transfer_fee_amount'),
    fetchPaymentConfirmations(supabase),
  ])

  const inByFsp = new Map<string, { activity: number; fees: number; total: number }>()
  for (const t of transferResult.data) {
    const id = t.fsp_id != null ? String(t.fsp_id) : ''
    if (!id) continue
    const cur = inByFsp.get(id) || { activity: 0, fees: 0, total: 0 }
    const activity = Number(t.activity_amount) || 0
    const fees = Number(t.transfer_fee_amount) || 0
    cur.activity += activity
    cur.fees += fees
    cur.total += transferAmount(activity, fees) || 0
    inByFsp.set(id, cur)
  }

  const fspByProject = latestConfirmationFspByProject(confirmations)
  const expensesByProject = await fetchProjectExpensesById(supabase, [...fspByProject.keys()])
  const outByFsp = new Map<string, number>()
  for (const [projectId, fspId] of fspByProject) {
    const amount = projectExpenseTotal(expensesByProject.get(projectId))
    if (!amount) continue
    outByFsp.set(fspId, (outByFsp.get(fspId) || 0) + amount)
  }

  return fsps.map((f) => {
    const inn = inByFsp.get(String(f.id)) || { activity: 0, fees: 0, total: 0 }
    const out = outByFsp.get(String(f.id)) || 0
    return {
      ...f,
      activity_funds: inn.activity,
      fees: inn.fees,
      total_funds: inn.total,
      treasury_in_usd: inn.total,
      treasury_out_usd: out,
      balance: inn.total - out,
    }
  })
}
