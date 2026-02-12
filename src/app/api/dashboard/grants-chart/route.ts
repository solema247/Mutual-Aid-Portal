import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

async function fetchAllRows<T>(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  table: string,
  select: string,
  filter?: (q: ReturnType<ReturnType<typeof getSupabaseAdmin>['from']>) => ReturnType<ReturnType<typeof getSupabaseAdmin>['from']>
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  const pageSize = 1000
  while (true) {
    let q = supabase.from(table).select(select).range(from, from + pageSize - 1)
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

type GrantRow = {
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
  balance: number
}

/**
 * GET /api/dashboard/grants-chart
 * Fetches from grants (foreign table). Returns one row per grant_id with:
 * - total_transferred_amount_usd, sum_transfer_fee_amount, sum_activity_amount
 * - balance = total_transferred_amount_usd - sum_transfer_fee_amount - sum_activity_amount
 * For stacked bar: x = grant_id, y = transfer_fee + activity + balance (stacked).
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()

    const rows = await fetchAllRows<GrantRow>(
      supabase,
      'grants',
      'grant_id, total_transferred_amount_usd, sum_transfer_fee_amount, sum_activity_amount',
      (q) => q.order('grant_id', { ascending: true })
    )

    const chartData: GrantsChartRow[] = (rows ?? [])
      .filter((r) => r.grant_id != null && String(r.grant_id).trim() !== '')
      .map((r) => {
        const total = r.total_transferred_amount_usd != null ? Number(r.total_transferred_amount_usd) : 0
        const fee = r.sum_transfer_fee_amount != null ? Number(r.sum_transfer_fee_amount) : 0
        const activity = r.sum_activity_amount != null ? Number(r.sum_activity_amount) : 0
        const balance = total - fee - activity
        return {
          grant_id: String(r.grant_id).trim(),
          total_transferred_amount_usd: total,
          sum_transfer_fee_amount: fee,
          sum_activity_amount: activity,
          balance: Math.max(0, balance),
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
