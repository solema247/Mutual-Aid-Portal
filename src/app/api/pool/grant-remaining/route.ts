import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

function toDisplayKey(grantId: string): string {
  const id = String(grantId || '').trim()
  if (id.startsWith('FCDO-')) return 'FCDO'
  return id
}

function activitySerialsFromJsonb(activities: unknown): string[] {
  if (activities == null) return []
  if (Array.isArray(activities)) {
    return activities
      .map((item) => (typeof item === 'string' ? item : (item as Record<string, unknown>)?.id ?? (item as Record<string, unknown>)?.serial))
      .filter((s): s is string => typeof s === 'string' && s.trim() !== '')
  }
  if (typeof activities === 'string') {
    try {
      const parsed = JSON.parse(activities)
      return activitySerialsFromJsonb(parsed)
    } catch {
      return (activities as string).split(',').map((s) => s.trim()).filter(Boolean)
    }
  }
  return []
}

async function fetchAllRows<T>(supabase: any, table: string, select: string, filter?: (q: any) => any): Promise<T[]> {
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

/**
 * GET /api/pool/grant-remaining?grantId=xxx
 * Returns { total, committed, allocated, remaining } for the selected grant using the grants table.
 * When grantId is FCDO-HELP-S or FCDO-SHPR (or any FCDO-*), aggregates both under display key "FCDO".
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const grantId = searchParams.get('grantId')?.trim()
    if (!grantId) {
      return NextResponse.json({ error: 'grantId is required' }, { status: 400 })
    }

    const displayKey = toDisplayKey(grantId)
    const adminSupabase = getSupabaseAdmin()

    // Use admin so we see all grants, grid rows, and projects (no RLS) for accurate totals
    // Grants table: all rows whose grant_id maps to displayKey (e.g. FCDO-HELP-S + FCDO-SHPR → FCDO)
    const grants = await fetchAllRows<{
      grant_id: string | null
      total_transferred_amount_usd: number | null
      sum_transfer_fee_amount: number | null
      activities: unknown
    }>(adminSupabase, 'grants', 'grant_id, total_transferred_amount_usd, sum_transfer_fee_amount, activities')

    let totalIncluded = 0
    const activitySerials: string[] = []
    const rawGrantIds = new Set<string>()

    for (const g of grants) {
      if (!g.grant_id || g.grant_id.trim() === '') continue
      const rawId = g.grant_id.trim()
      if (toDisplayKey(rawId) !== displayKey) continue
      rawGrantIds.add(rawId)
      const transferred = g.total_transferred_amount_usd != null ? Number(g.total_transferred_amount_usd) : 0
      const fee = g.sum_transfer_fee_amount != null ? Number(g.sum_transfer_fee_amount) : 0
      totalIncluded += Math.max(0, (Number.isNaN(transferred) ? 0 : transferred) - (Number.isNaN(fee) ? 0 : fee))
      const serials = activitySerialsFromJsonb(g.activities)
      serials.forEach((s) => { if (s && !activitySerials.includes(s)) activitySerials.push(s) })
    }

    // grants_grid_view: grid ids that map to this display key (for grant_grid_id assignment).
    // View may use grant_id "FCDO" or "FCDO-HELP-S"/"FCDO-SHPR"; include displayKey so we match all.
    const grantIdsToMatch = new Set<string>([displayKey, ...rawGrantIds])
    const gridRows = await fetchAllRows<{ id: string; grant_id: string | null }>(
      adminSupabase,
      'grants_grid_view',
      'id, grant_id',
      (q: any) => q.in('grant_id', [...grantIdsToMatch])
    )
    const gridIdsForDisplayKey = new Set<string>()
    for (const row of gridRows || []) {
      if (row.id && row.grant_id && toDisplayKey(String(row.grant_id).trim()) === displayKey) gridIdsForDisplayKey.add(row.id)
    }

    // Projects assigned to this grant: by grant_grid_id (in gridIdsForDisplayKey) or by serial in activitySerials
    const projects = await fetchAllRows<{
      expenses: unknown
      funding_status: string | null
      grant_id: string | null
      grant_grid_id: string | null
      status?: string | null
    }>(adminSupabase, 'err_projects', 'expenses, funding_status, grant_id, grant_grid_id, status')

    const sumExpenses = (exp: unknown): number => {
      try {
        const arr = typeof exp === 'string' ? JSON.parse(exp || '[]') : (exp || [])
        return Array.isArray(arr) ? arr.reduce((s: number, e: any) => s + (e?.total_cost || 0), 0) : 0
      } catch {
        return 0
      }
    }

    // Committed = sum of expenses for projects assigned to this grant (by grant_grid_id or serial) with funding_status = 'committed'
    // Allocated = sum for projects with funding_status = 'allocated' or (unassigned + status = 'pending')
    let committed = 0
    let allocated = 0
    const fs = (s: string | null | undefined) => (s || '').toLowerCase()
    for (const p of projects || []) {
      const assignedByGrid = p.grant_grid_id && gridIdsForDisplayKey.has(p.grant_grid_id)
      const assignedBySerial = p.grant_id && activitySerials.includes(p.grant_id)
      if (!assignedByGrid && !assignedBySerial) continue
      const amt = sumExpenses(p.expenses)
      if (fs(p.funding_status) === 'committed') committed += amt
      else if (fs(p.funding_status) === 'allocated' || (fs(p.funding_status) === 'unassigned' && (p.status || '').toLowerCase() === 'pending')) allocated += amt
    }

    const remaining = totalIncluded - committed - allocated

    return NextResponse.json(
      { total: totalIncluded, committed, allocated, remaining },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  } catch (error) {
    console.error('Grant remaining error:', error)
    return NextResponse.json(
      { error: 'Failed to compute grant remaining' },
      { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  }
}
