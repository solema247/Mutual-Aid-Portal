import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { transferAmount } from '@/lib/grantManagement/fundTransferHelpers'
import { sumDisbursedToErrsByFsp } from '@/lib/grantPaymentDisbursement'

type AdminClient = ReturnType<typeof getSupabaseAdmin>

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

/**
 * Treasury in = sum of transfer segments for the FSP (activity + fee).
 * Treasury out = F3 payment confirmations on MOUs linked to the FSP (mous.fsp_id).
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

  const { data: transfers } = await fetchAll(
    supabase,
    'transfer_segments',
    'fsp_id, activity_amount, transfer_fee_amount'
  )

  const inByFsp = new Map<string, { activity: number; fees: number; total: number }>()
  for (const t of transfers) {
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

  let outByFsp: Record<string, number> = {}
  const mousSelect = await fetchAll(
    supabase,
    'mous',
    'id, fsp_id, payment_confirmation_file, exchange_rate, transfer_date'
  )
  if (!mousSelect.error) {
    const mous = mousSelect.data as Array<{
      id: string
      fsp_id?: string | null
      payment_confirmation_file: string | null
      exchange_rate: number | null
      transfer_date: string | null
    }>
    const projectsSelect = await fetchAll(
      supabase,
      'err_projects',
      'id, grant_id, grant_grid_id, mou_id, expenses, submitted_at'
    )
    const projects = projectsSelect.data as Array<{
      id: string
      grant_id: string | null
      grant_grid_id: string | null
      mou_id: string | null
      expenses: unknown
      submitted_at: string | null
    }>
    outByFsp = sumDisbursedToErrsByFsp(projects, mous)
  }

  return fsps.map((f) => {
    const inn = inByFsp.get(String(f.id)) || { activity: 0, fees: 0, total: 0 }
    const out = outByFsp[String(f.id)] || 0
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
