import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

// Helper function to fetch all rows with pagination
async function fetchAllRows<T>(
  supabase: any,
  table: string,
  select: string,
  filter?: (query: any) => any
): Promise<T[]> {
  const allRows: T[] = []
  let from = 0
  const pageSize = 1000

  while (true) {
    let query = supabase.from(table).select(select).range(from, from + pageSize - 1)
    if (filter) {
      query = filter(query)
    }
    const { data, error } = await query
    if (error) throw error
    if (!data || data.length === 0) break
    allRows.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return allRows
}

// Display key for By Grant table: group FCDO-HELP-S, FCDO-SHPR etc. as one row "FCDO"
function toDisplayKey(grantId: string): string {
  const id = grantId.trim()
  if (id.startsWith('FCDO-')) return 'FCDO'
  return id
}

// Extract activity serials from grants.activities jsonb (array of strings or objects with id/serial)
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
      return activities.split(',').map((s) => s.trim()).filter(Boolean)
    }
  }
  return []
}

// GET /api/pool/by-donor - Aggregated by grant from grants table (foreign table). Included = total_transferred - transfer_fee
export async function GET() {
  try {
    const supabase = getSupabaseRouteClient()
    const grantsSupabase = getSupabaseAdmin()

    // Fetch grants from public.grants (foreign table): grant_id, project_name, total_transferred_amount_usd, sum_transfer_fee_amount, activities
    const grants = await fetchAllRows<{
      grant_id: string | null;
      project_name: string | null;
      total_transferred_amount_usd: number | null;
      sum_transfer_fee_amount: number | null;
      activities: unknown;
    }>(
      grantsSupabase,
      'grants',
      'grant_id, project_name, total_transferred_amount_usd, sum_transfer_fee_amount, activities',
      (q) => q.order('grant_id', { ascending: true })
    )

    // Group by display key (e.g. FCDO-HELP-S + FCDO-SHPR → one row "FCDO"); Included = total_transferred - transfer_fee
    const uniqueGrants = new Map<string, {
      grant_id: string;
      project_name: string | null;
      included: number;
      activitySerials: string[];
    }>()

    for (const grant of grants) {
      if (!grant.grant_id || grant.grant_id.trim() === '') continue

      const rawId = grant.grant_id.trim()
      const key = toDisplayKey(rawId)
      const transferred = grant.total_transferred_amount_usd != null ? Number(grant.total_transferred_amount_usd) : 0
      const fee = grant.sum_transfer_fee_amount != null ? Number(grant.sum_transfer_fee_amount) : 0
      const included = (Number.isNaN(transferred) ? 0 : transferred) - (Number.isNaN(fee) ? 0 : fee)
      const activitySerials = activitySerialsFromJsonb(grant.activities)

      if (!uniqueGrants.has(key)) {
        uniqueGrants.set(key, {
          grant_id: key,
          project_name: grant.project_name || rawId,
          included: Math.max(0, included),
          activitySerials
        })
      } else {
        const existing = uniqueGrants.get(key)!
        existing.included += Math.max(0, included)
        const newSerials = activitySerials.filter((s) => !existing.activitySerials.includes(s))
        existing.activitySerials.push(...newSerials)
        // For FCDO row, prefer project_name from FCDO-SHPR over FCDO-HELP-S
        if (key === 'FCDO' && rawId === 'FCDO-SHPR') existing.project_name = grant.project_name || rawId
        else if (!existing.project_name && (grant.project_name || rawId)) existing.project_name = grant.project_name || rawId
      }
    }

    // Fetch historical data from activities_raw_import
    const historicalData = await fetchAllRows<{
      'Project Donor'?: string | null;
      project_donor?: string | null;
      USD?: number | null;
      usd?: number | null;
    }>(
      supabase,
      'activities_raw_import',
      '"Project Donor",USD'
    )

    // Historical by display key (e.g. FCDO-HELP-S and FCDO both contribute to "FCDO")
    const byGrantHistorical = new Map<string, number>()
    for (const row of historicalData || []) {
      const rawDonor = row['Project Donor'] || row['project_donor'] || row['Project Donor']
      const rawUSD = row['USD'] || row['usd'] || row.USD
      if (!rawDonor) continue
      const grantId = String(rawDonor).trim()
      if (!grantId) continue
      let usd = 0
      if (rawUSD !== null && rawUSD !== undefined) {
        usd = Number(rawUSD)
        if (isNaN(usd) || usd === 0) continue
      } else continue
      const displayKey = toDisplayKey(grantId)
      byGrantHistorical.set(displayKey, (byGrantHistorical.get(displayKey) || 0) + usd)
    }

    // Get user's state access rights
    const { getUserStateAccess } = await import('@/lib/userStateAccess')
    const { allowedStateNames } = await getUserStateAccess()

    // grants_grid_view: map grant_grid_id (UUID) → grant_id (e.g. "FCDO") for assigned projects
    const gridViewRows = await fetchAllRows<{ id: string; grant_id: string | null }>(
      supabase,
      'grants_grid_view',
      'id, grant_id',
      (q) => q.not('grant_id', 'is', null)
    )
    const grantGridIdToGrantId = new Map<string, string>()
    for (const row of gridViewRows || []) {
      if (row.id && row.grant_id) grantGridIdToGrantId.set(row.id, String(row.grant_id).trim())
    }

    // Fetch all projects (include grant_grid_id for assignment lookup)
    const projects = await fetchAllRows<{
      expenses: any;
      funding_status: string | null;
      grant_id: string | null;
      grant_grid_id: string | null;
      state: string | null;
    }>(
      supabase,
      'err_projects',
      'expenses, funding_status, grant_id, grant_grid_id, state',
      (q) => {
        if (allowedStateNames !== null && allowedStateNames.length > 0) {
          return q.in('state', allowedStateNames)
        }
        return q
      }
    )

    const sumExpenses = (rows: any[]) => rows.reduce((sum, p) => {
      try {
        const exps = typeof p.expenses === 'string' ? JSON.parse(p.expenses) : p.expenses
        return sum + (exps || []).reduce((s2: number, e: any) => s2 + (e.total_cost || 0), 0)
      } catch { return sum }
    }, 0)

    // Project serial → display key (from grants table activities, for fallback)
    const projectSerialToDisplayKey = new Map<string, string>()
    for (const [displayKey, grant] of uniqueGrants.entries()) {
      for (const serial of grant.activitySerials) {
        projectSerialToDisplayKey.set(serial, displayKey)
      }
    }

    // Assigned: by display key. Prefer grant_grid_id → grants_grid_view → grant_id → display key; else serial in activities
    const byGrantAssigned = new Map<string, number>()
    for (const p of projects) {
      if (!p.grant_id && !p.grant_grid_id) continue
      let displayKey: string | null = null
      if (p.grant_grid_id) {
        const grantId = grantGridIdToGrantId.get(p.grant_grid_id)
        if (grantId) displayKey = toDisplayKey(grantId)
      }
      if (!displayKey && p.grant_id) displayKey = projectSerialToDisplayKey.get(p.grant_id) ?? null
      if (!displayKey) continue
      const amt = sumExpenses([p])
      byGrantAssigned.set(displayKey, (byGrantAssigned.get(displayKey) || 0) + amt)
    }

    // Build result rows (grouped by grant_id only)
    const rows = Array.from(uniqueGrants.entries())
      .map(([grantId, grant]) => {
        const assigned = byGrantAssigned.get(grantId) || 0
        const historical = byGrantHistorical.get(grantId) || 0
        const remaining = grant.included - historical - assigned
        return {
          donor_id: null,
          donor_name: null,
          grant_id: grant.grant_id,
          grant_call_name: grant.project_name || grant.grant_id,
          project_name: grant.project_name || grant.grant_id,
          included: grant.included,
          historical,
          assigned,
          remaining
        }
      })
      .sort((a, b) => (a.grant_id || '').localeCompare(b.grant_id || ''))

    return NextResponse.json(rows, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  } catch (error) {
    console.error('Pool by-donor error:', error)
    return NextResponse.json({ error: 'Failed to compute by-donor' }, { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  }
}


