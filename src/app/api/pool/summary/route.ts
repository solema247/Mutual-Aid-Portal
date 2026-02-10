import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const revalidate = 0

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

// GET /api/pool/summary - Overall pool summary
export async function GET() {
  try {
    const supabase = getSupabaseRouteClient()
    
    // 1. Total Included = sum of all allocation_amount from allocations table (foreign table)
    const allocationsSupabase = getSupabaseAdmin()
    const allocData = await fetchAllRows(allocationsSupabase, 'allocations', 'allocation_amount')
    const total_included = (allocData || []).reduce((sum, row) => {
      const amount = row['allocation_amount'] != null ? Number(row['allocation_amount']) : 0
      return sum + (Number.isNaN(amount) ? 0 : amount)
    }, 0)

    // 2. Get Historical Committed from activities_raw_import
    const historicalData = await fetchAllRows(supabase, 'activities_raw_import', 'USD')
    const historical_committed = (historicalData || []).reduce((sum, row) => {
      const rawUSD = row['USD'] || row['usd'] || row.USD
      if (rawUSD === null || rawUSD === undefined) return sum
      const usd = Number(rawUSD)
      if (isNaN(usd) || usd === 0) return sum
      return sum + usd
    }, 0)

    // 3. Get Committed from err_projects
    const projects = await fetchAllRows(supabase, 'err_projects', 'expenses, funding_status, status')
    const sumExpenses = (rows: any[]) => rows.reduce((sum, p) => {
      try {
        const exps = typeof p.expenses === 'string' ? JSON.parse(p.expenses) : p.expenses
        return sum + (exps || []).reduce((s2: number, e: any) => s2 + (e.total_cost || 0), 0)
      } catch {
        return sum
      }
    }, 0)

    const committed_from_projects = sumExpenses((projects || []).filter(p => p.funding_status === 'committed'))
    
    // Committed = Historical Committed + Committed from projects
    const total_committed = historical_committed + committed_from_projects

    // 4. Pending stays the same (from err_projects)
    const pending = sumExpenses((projects || []).filter(p => p.funding_status === 'allocated' || (p.funding_status === 'unassigned' && p.status === 'pending')))
    
    // 5. Remaining = Total - Committed - Pending
    const remaining = total_included - total_committed - pending

    // 6. Get Total Grants from public.grants (foreign table) – sum of sum_activity_amount
    const grantsSupabase = getSupabaseAdmin()
    const grantsData = await fetchAllRows(grantsSupabase, 'grants', 'sum_activity_amount')
    const total_grants = (grantsData || []).reduce((sum, row) => {
      const amount = row['sum_activity_amount'] != null ? Number(row['sum_activity_amount']) : 0
      return sum + (Number.isNaN(amount) ? 0 : amount)
    }, 0)

    // 7. Total Not Included = Total Grants - Total Included
    const total_not_included = total_grants - total_included

    return NextResponse.json({ 
      total_included, 
      total_committed, 
      total_pending: pending, 
      remaining,
      total_grants,
      total_not_included
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Pool summary error:', error)
    return NextResponse.json({ error: 'Failed to compute pool summary' }, { status: 500 })
  }
}


