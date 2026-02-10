import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

// Helper function to normalize state names consistently
function normalizeStateName(state: any): string {
  if (!state) return 'Unknown'
  const normalized = String(state).trim()
  return normalized === '' ? 'Unknown' : normalized
}

// Helper function to normalize state names from activities_raw_import
// to match the spelling used in err_projects
function normalizeActivitiesStateName(state: any): string {
  if (!state) return 'Unknown'
  let normalized = String(state).trim()
  if (normalized === '') return 'Unknown'
  
  // Normalize specific state name variations from activities_raw_import
  const stateMappings: Record<string, string> = {
    'Al Jazeera': 'Al Jazirah',
    'Gadarif': 'Gadaref',
    'Sinar': 'Sennar'
  }
  
  // Check for exact match first
  if (stateMappings[normalized]) {
    return stateMappings[normalized]
  }
  
  // Check case-insensitive match
  const lowerNormalized = normalized.toLowerCase()
  for (const [key, value] of Object.entries(stateMappings)) {
    if (key.toLowerCase() === lowerNormalized) {
      return value
    }
  }
  
  return normalized
}

// GET /api/distribution-decisions/allocations/by-state
// Returns aggregated allocations grouped by state
export async function GET() {
  try {
    const supabase = getSupabaseRouteClient()
    
    // Helper function to fetch all rows using pagination
    const fetchAllRows = async (table: string, select: string) => {
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
    
    // 1. Get current allocations from allocations_by_date (fetch all rows)
    const allocData = await fetchAllRows('allocations_by_date', 'State,"Allocation Amount"')

    // 2. Get historical USD from activities_raw_import (fetch all rows)
    const historicalData = await fetchAllRows('activities_raw_import', 'State,USD')

    // 3. Get committed and pending from err_projects (fetch all rows)
    const projects = await fetchAllRows('err_projects', 'expenses, funding_status, status, state')

    // Group by state
    const grouped: Record<string, { 
      state: string
      total_allocated: number  // from allocations_by_date
      historical_usd: number   // from activities_raw_import
      committed: number        // from err_projects
      pending: number          // from err_projects
    }> = {}

    // Process allocations_by_date
    for (const row of allocData || []) {
      // Handle both quoted and unquoted keys
      const rawState = row['State'] || row['state'] || row.State
      const rawAmount = row['Allocation Amount'] || row['allocation_amount'] || row['allocation amount']
      const state = normalizeStateName(rawState)
      const amount = rawAmount ? Number(rawAmount) : 0
      if (!grouped[state]) {
        grouped[state] = { state, total_allocated: 0, historical_usd: 0, committed: 0, pending: 0 }
      }
      grouped[state].total_allocated += amount
    }

    // Process activities_raw_import - normalize state names and skip null/zero USD
    for (const row of historicalData || []) {
      // Handle both quoted and unquoted keys
      const rawState = row['State'] || row['state'] || row.State
      const rawUSD = row['USD'] || row['usd'] || row.USD
      // Use normalizeActivitiesStateName to normalize state names from activities_raw_import
      const state = normalizeActivitiesStateName(rawState)
      
      let usd = 0
      if (rawUSD !== null && rawUSD !== undefined) {
        usd = Number(rawUSD)
        if (isNaN(usd)) {
          continue
        }
      }
      
      // Skip rows with zero USD
      if (usd === 0) {
        continue
      }
      
      if (!grouped[state]) {
        grouped[state] = { state, total_allocated: 0, historical_usd: 0, committed: 0, pending: 0 }
      }
      grouped[state].historical_usd += usd
    }

    // Process err_projects for committed (funding_status === 'committed')
    for (const p of projects || []) {
      if (p.funding_status !== 'committed') continue
      try {
        const exps = typeof p.expenses === 'string' ? JSON.parse(p.expenses) : p.expenses
        const amount = (exps || []).reduce((s: number, e: any) => s + (e.total_cost || 0), 0)
        const state = normalizeStateName(p.state)
        if (!grouped[state]) {
          grouped[state] = { state, total_allocated: 0, historical_usd: 0, committed: 0, pending: 0 }
        }
        grouped[state].committed += amount
      } catch { /* ignore */ }
    }

    // Process err_projects for pending (funding_status === 'allocated' OR (funding_status === 'unassigned' AND status === 'pending'))
    for (const p of projects || []) {
      if (p.funding_status === 'allocated' || (p.funding_status === 'unassigned' && p.status === 'pending')) {
        try {
          const exps = typeof p.expenses === 'string' ? JSON.parse(p.expenses) : p.expenses
          const amount = (exps || []).reduce((s: number, e: any) => s + (e.total_cost || 0), 0)
          const state = normalizeStateName(p.state)
          if (!grouped[state]) {
            grouped[state] = { state, total_allocated: 0, historical_usd: 0, committed: 0, pending: 0 }
          }
          grouped[state].pending += amount
        } catch { /* ignore */ }
      }
    }

    // Calculate total for percentage
    const totalAll = Object.values(grouped).reduce((s, g) => s + g.total_allocated, 0) || 0

    const result = Object.values(grouped)
      .map(g => ({
        state: g.state,
        total_allocated: g.total_allocated,
        historical_usd: g.historical_usd,
        committed: g.committed,
        pending: g.pending,
        percent_total: totalAll > 0 ? (g.total_allocated / totalAll) * 100 : 0
      }))
      .sort((a, b) => b.total_allocated - a.total_allocated)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error aggregating allocations by state:', error)
    return NextResponse.json({ error: 'Failed to fetch allocations by state' }, { status: 500 })
  }
}

