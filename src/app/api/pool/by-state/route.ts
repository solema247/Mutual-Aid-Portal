import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

// Helper function to normalize state names consistently
function normalizeStateName(state: any): string {
  if (!state) return 'Unknown'
  const normalized = String(state).trim()
  return normalized === '' ? 'Unknown' : normalized
}

// Helper function to fetch all rows using pagination
const fetchAllRows = async (supabase: any, table: string, select: string) => {
  let allData: any[] = []
  let from = 0
  const pageSize = 1000
  let hasMore = true

  while (hasMore) {
    const { data: page, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1)
    
    if (error) throw error
    
    if (page && page.length > 0) {
      allData = [...allData, ...page]
      from += pageSize
      hasMore = page.length === pageSize // If we got a full page, there might be more
    } else {
      hasMore = false
    }
  }
  
  return allData
}

// GET /api/pool/by-state - Aggregated view using allocations_by_date
export async function GET() {
  try {
    const supabase = getSupabaseRouteClient()
    
    // Get user's state access rights
    const { getUserStateAccess } = await import('@/lib/userStateAccess')
    const { allowedStateNames } = await getUserStateAccess()
    
    // 1. Get allocations from allocations_by_date (replaces cycle_state_allocations)
    const allocData = await fetchAllRows(supabase, 'allocations_by_date', 'State,"Allocation Amount"')
    
    const allocatedByState = new Map<string, number>()
    for (const row of allocData || []) {
      const rawState = row['State'] || row['state'] || row.State
      const state = normalizeStateName(rawState)
      // Filter by user's allowed states
      if (allowedStateNames !== null && allowedStateNames.length > 0 && !allowedStateNames.includes(state)) {
        continue
      }
      const amount = row['Allocation Amount'] ? Number(row['Allocation Amount']) : 0
      allocatedByState.set(state, (allocatedByState.get(state) || 0) + amount)
    }

    // 2. Get historical commitments from activities_raw_import
    const historicalData = await fetchAllRows(supabase, 'activities_raw_import', 'State,USD')
    
    const historicalByState = new Map<string, number>()
    for (const row of historicalData || []) {
      const rawState = row['State'] || row['state'] || row.State
      const state = normalizeStateName(rawState)
      // Filter by user's allowed states
      if (allowedStateNames !== null && allowedStateNames.length > 0 && !allowedStateNames.includes(state)) {
        continue
      }
      const rawUSD = row['USD'] || row['usd'] || row.USD
      let usd = 0
      if (rawUSD !== null && rawUSD !== undefined) {
        usd = Number(rawUSD)
        if (!isNaN(usd) && usd > 0) {
          historicalByState.set(state, (historicalByState.get(state) || 0) + usd)
        }
      }
    }

    // 3. Get committed and pending from err_projects (fetch all rows with state filtering)
    let projectsQuery = supabase.from('err_projects').select('expenses, funding_status, status, state')
    if (allowedStateNames !== null && allowedStateNames.length > 0) {
      projectsQuery = projectsQuery.in('state', allowedStateNames)
    }
    const { data: projectsData } = await projectsQuery
    const projects = projectsData || []

    const sumByCommitted = () => {
      const byState = new Map<string, number>()
      for (const p of projects || []) {
        if (p.funding_status !== 'committed') continue
        try {
          const exps = typeof p.expenses === 'string' ? JSON.parse(p.expenses) : p.expenses
          const amount = (exps || []).reduce((s: number, e: any) => s + (e.total_cost || 0), 0)
          const state = normalizeStateName(p.state)
          byState.set(state, (byState.get(state) || 0) + amount)
        } catch { /* ignore */ }
      }
      return byState
    }

    const sumByPending = () => {
      const byState = new Map<string, number>()
      for (const p of projects || []) {
        // Include both 'allocated' funding_status and 'pending' status (new uploads without metadata)
        if (p.funding_status === 'allocated' || (p.funding_status === 'unassigned' && p.status === 'pending')) {
          try {
            const exps = typeof p.expenses === 'string' ? JSON.parse(p.expenses) : p.expenses
            const amount = (exps || []).reduce((s: number, e: any) => s + (e.total_cost || 0), 0)
            const state = normalizeStateName(p.state)
            byState.set(state, (byState.get(state) || 0) + amount)
          } catch { /* ignore */ }
        }
      }
      return byState
    }

    const committedByState = sumByCommitted()
    const pendingByState = sumByPending()

    const states = Array.from(new Set<string>([
      ...Array.from(allocatedByState.keys()),
      ...Array.from(historicalByState.keys()),
      ...Array.from(committedByState.keys()),
      ...Array.from(pendingByState.keys())
    ]))

    const rows = states.map(state => {
      const allocated = allocatedByState.get(state) || 0
      const historical_commitments = historicalByState.get(state) || 0
      const committed = committedByState.get(state) || 0
      const pending = pendingByState.get(state) || 0
      const remaining = allocated - historical_commitments - committed - pending
      return { state_name: state, allocated, historical_commitments, committed, pending, remaining }
    }).sort((a, b) => a.state_name.localeCompare(b.state_name))

    return NextResponse.json(rows, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
    })
  } catch (error) {
    console.error('Pool by-state error:', error)
    return NextResponse.json({ error: 'Failed to compute by-state' }, { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  }
}


