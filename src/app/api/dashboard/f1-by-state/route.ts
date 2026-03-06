import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getUserStateAccess } from '@/lib/userStateAccess'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

function normalizeStateName(state: any): string {
  if (!state) return 'Unknown'
  let normalized = String(state).trim()
  if (normalized === '') return 'Unknown'
  const stateMappings: Record<string, string> = {
    'Al Jazeera': 'Al Jazirah',
    'Gadarif': 'Gadaref',
    'Sinar': 'Sennar'
  }
  if (stateMappings[normalized]) return stateMappings[normalized]
  const lower = normalized.toLowerCase()
  for (const [key, value] of Object.entries(stateMappings)) {
    if (key.toLowerCase() === lower) return value
  }
  return normalized
}

/** Paginate through a table and return all rows. */
async function fetchAllRows(supabase: any, table: string, select: string): Promise<any[]> {
  const out: any[] = []
  const pageSize = 1000
  let from = 0
  let hasMore = true
  while (hasMore) {
    const { data: page, error } = await supabase.from(table).select(select).range(from, from + pageSize - 1)
    if (error) throw error
    if (page?.length) {
      out.push(...page)
      from += pageSize
      hasMore = page.length === pageSize
    } else {
      hasMore = false
    }
  }
  return out
}

export type F1ByStateRow = {
  state: string
  state_name_ar: string | null
  count: number
  portal_count: number
  historical_count: number
}

/**
 * GET /api/dashboard/f1-by-state
 * Returns F1 (err_projects) upload counts grouped by state for Sudan.
 * Respects user state access. Optional query: since_date (YYYY-MM-DD) for date filter.
 */
export async function GET(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const { allowedStateNames } = await getUserStateAccess()

    const { searchParams } = new URL(request.url)
    const sinceDate = searchParams.get('since_date') ?? null

    let projectQuery = supabase
      .from('err_projects')
      .select('id, state, created_at')

    if (allowedStateNames !== null && allowedStateNames.length > 0) {
      projectQuery = projectQuery.in('state', allowedStateNames)
    }

    const { data: projects, error: projectsError } = await projectQuery
    if (projectsError) throw projectsError

    const portalByState = new Map<string, number>()
    for (const p of projects || []) {
      const state = normalizeStateName((p as any).state)
      if (sinceDate) {
        const created = (p as any).created_at
        if (created && new Date(created) < new Date(sinceDate)) continue
      }
      portalByState.set(state, (portalByState.get(state) ?? 0) + 1)
    }

    const historicalByState = new Map<string, number>()
    try {
      const adminSupabase = getSupabaseAdmin()
      const historicalRows = await fetchAllRows(adminSupabase, 'activities_raw_import', 'id, "State"')
      for (const row of historicalRows) {
        const rawState = row?.State ?? row?.state
        const state = normalizeStateName(rawState)
        if (allowedStateNames !== null && allowedStateNames.length > 0 && !allowedStateNames.includes(state)) continue
        historicalByState.set(state, (historicalByState.get(state) ?? 0) + 1)
      }
    } catch (historicalErr) {
      console.warn('Dashboard f1-by-state: historical fetch skipped', historicalErr)
      // Continue with portal-only counts so the card still loads
    }

    const byState = new Map<string, number>()
    for (const [state, n] of portalByState) byState.set(state, (byState.get(state) ?? 0) + n)
    for (const [state, n] of historicalByState) byState.set(state, (byState.get(state) ?? 0) + n)

    const { data: statesData, error: statesError } = await supabase
      .from('states')
      .select('state_name, state_name_ar')
      .not('state_name', 'is', null)
      .order('state_name')
    if (statesError) throw statesError

    const stateNames = new Map<string, string | null>()
    for (const s of statesData || []) {
      const name = (s as any).state_name
      if (name) stateNames.set(normalizeStateName(name), (s as any).state_name_ar ?? null)
    }

    const allStateNames = Array.from(new Set([...byState.keys(), ...stateNames.keys()])).filter((k) => k !== 'Unknown')
    const result: F1ByStateRow[] = allStateNames
      .sort((a, b) => a.localeCompare(b))
      .map((state) => {
        const portal_count = portalByState.get(state) ?? 0
        const historical_count = historicalByState.get(state) ?? 0
        return {
          state,
          state_name_ar: stateNames.get(state) ?? null,
          count: portal_count + historical_count,
          portal_count,
          historical_count
        }
      })

    if (stateNames.has('Unknown') || byState.has('Unknown')) {
      const portal_count = portalByState.get('Unknown') ?? 0
      const historical_count = historicalByState.get('Unknown') ?? 0
      result.push({
        state: 'Unknown',
        state_name_ar: null,
        count: portal_count + historical_count,
        portal_count,
        historical_count
      })
    }

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
    })
  } catch (error) {
    console.error('Dashboard f1-by-state error:', error)
    return NextResponse.json(
      { error: 'Failed to load F1 by state' },
      { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  }
}
