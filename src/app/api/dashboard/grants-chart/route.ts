import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sumDisbursedToErrsByGrant } from '@/lib/grantPaymentDisbursement'
import { loadConfirmedProjectIds } from '@/lib/mouPaymentConfirmations'
import {
  chunkGrantScopeIds,
  getUserGrantAccess,
} from '@/lib/userGrantAccess'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

async function fetchAllRows<T>(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  table: string,
  select: string,
  filter?: (q: any) => any
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  const pageSize = 1000
  while (true) {
    let q: any = supabase.from(table).select(select).range(from, from + pageSize - 1)
    if (filter) q = filter(q)
    const { data, error } = await q
    if (error) throw error
    if (!data?.length) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

async function fetchPartnerProjects(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  grantGridIds: string[]
) {
  const projects: Array<{
    id: string
    grant_id: string | null
    grant_grid_id: string | null
    mou_id: string | null
    expenses: unknown
    submitted_at: string | null
  }> = []
  for (const batch of chunkGrantScopeIds(grantGridIds)) {
    const rows = await fetchAllRows<{
      id: string
      grant_id: string | null
      grant_grid_id: string | null
      mou_id: string | null
      expenses: unknown
      submitted_at: string | null
    }>(
      supabase,
      'err_projects',
      'id, grant_id, grant_grid_id, mou_id, expenses, submitted_at',
      (q) => q.in('grant_grid_id', batch)
    )
    projects.push(...rows)
  }
  return projects
}

type GrantRow = {
  id: string
  grant_id: string | null
  total_transferred_amount_usd: number | null
  sum_transfer_fee_amount: number | null
  sum_activity_amount: number | null
}

export type GrantsChartRow = {
  grant_id: string
  total_transferred_amount_usd: number
  sum_transfer_fee_amount: number
  sum_activity_amount: number
  sum_disbursed_to_errs: number
  balance: number
  payout_balance: number
}

/**
 * GET /api/dashboard/grants-chart
 * Fetches from grants_grid_view (portal canonical). Optional query params:
 * - from: ISO date (inclusive) – compared to grant_start_date
 * - to: ISO date (inclusive) – compared to grant_end_date
 * Returns one row per grant_id with:
 * - total_transferred_amount_usd, sum_transfer_fee_amount, sum_activity_amount
 * - sum_disbursed_to_errs (F3 payment confirmations + historical USD)
 * - balance = total_transferred_amount_usd - sum_transfer_fee_amount - sum_activity_amount
 * - payout_balance = total_transferred_amount_usd - sum_disbursed_to_errs
 * For stacked bar: x = grant_id, y = transfer_fee + activity + balance (stacked).
 */
export async function GET(request: Request) {
  try {
    const grantAccess = await getUserGrantAccess()
    if (grantAccess.mode === 'none') {
      return NextResponse.json([], {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
      })
    }

    const supabase = getSupabaseAdmin()

    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const partnerGridIdSet =
      grantAccess.mode === 'partner' ? new Set(grantAccess.grantGridIds) : null

    const rows = await fetchAllRows<GrantRow>(
      supabase,
      'grants_grid_view',
      'id, grant_id, total_transferred_amount_usd, sum_transfer_fee_amount, sum_activity_amount',
      (q) => {
        let query = q
        if (grantAccess.mode === 'partner') {
          query = query.eq('partner_id', grantAccess.partnerId)
        }
        if (from) {
          query = query.gte('grant_start_date', from)
        }
        if (to) {
          query = query.lte('grant_end_date', to)
        }
        return query.order('grant_id', { ascending: true })
      }
    )

    const scopedRows =
      partnerGridIdSet == null
        ? rows ?? []
        : (rows ?? []).filter((r) => r.id && partnerGridIdSet.has(String(r.id)))

    const gridIdToGrantId = new Map<string, string>()
    const canonicalGrantIds: string[] = []
    for (const row of scopedRows) {
      const grantId = row.grant_id != null ? String(row.grant_id).trim() : ''
      if (row.id && grantId) {
        gridIdToGrantId.set(row.id, grantId)
        canonicalGrantIds.push(grantId)
      }
    }

    // Partner: only grant_grid_id-linked portal projects; never activities_raw_import / Project Donor.
    const [projects, mous, historicalRows] = await Promise.all([
      grantAccess.mode === 'partner'
        ? fetchPartnerProjects(supabase, grantAccess.grantGridIds)
        : fetchAllRows<{
            id: string
            grant_id: string | null
            grant_grid_id: string | null
            mou_id: string | null
            expenses: unknown
            submitted_at: string | null
          }>(supabase, 'err_projects', 'id, grant_id, grant_grid_id, mou_id, expenses, submitted_at'),
      fetchAllRows<{
        id: string
        payment_confirmation_file: string | null
        exchange_rate: number | null
        transfer_date: string | null
      }>(supabase, 'mous', 'id, payment_confirmation_file, exchange_rate, transfer_date'),
      grantAccess.mode === 'partner'
        ? Promise.resolve([] as Array<{ 'Project Donor'?: string | null; USD?: number | null }>)
        : fetchAllRows<{
            'Project Donor'?: string | null
            USD?: number | null
          }>(supabase, 'activities_raw_import', '"Project Donor",USD'),
    ])

    const confirmedProjectIds = await loadConfirmedProjectIds(
      supabase,
      grantAccess.mode === 'partner'
        ? { projectIds: projects.map((p) => p.id) }
        : { mouIds: mous.map((m) => m.id) }
    )
    const disbursedByGrant = sumDisbursedToErrsByGrant(
      projects,
      gridIdToGrantId,
      historicalRows,
      canonicalGrantIds,
      confirmedProjectIds
    )

    const chartData: GrantsChartRow[] = scopedRows
      .filter((r) => r.grant_id != null && String(r.grant_id).trim() !== '')
      .map((r) => {
        const grantId = String(r.grant_id).trim()
        const total = r.total_transferred_amount_usd != null ? Number(r.total_transferred_amount_usd) : 0
        const fee = r.sum_transfer_fee_amount != null ? Number(r.sum_transfer_fee_amount) : 0
        const activity = r.sum_activity_amount != null ? Number(r.sum_activity_amount) : 0
        const disbursed = disbursedByGrant[grantId] || 0
        const leftover = total - fee - activity
        const payoutBalance = total - disbursed
        return {
          grant_id: grantId,
          total_transferred_amount_usd: total,
          sum_transfer_fee_amount: fee,
          sum_activity_amount: activity,
          sum_disbursed_to_errs: disbursed,
          balance: Math.max(0, leftover),
          payout_balance: payoutBalance,
        }
      })

    return NextResponse.json(chartData, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    })
  } catch (error) {
    console.error('Dashboard grants-chart error:', error)
    return NextResponse.json(
      { error: 'Failed to load grants chart data' },
      { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  }
}
