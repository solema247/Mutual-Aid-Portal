import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { classifyPoolProject, projectExpenseTotal } from '@/lib/poolProjectClassification'

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
    
    // 1. Total Included = sum of all allocation amounts from allocations_by_date (canonical)
    const allocationsSupabase = getSupabaseAdmin()
    const allocData = await fetchAllRows(allocationsSupabase, 'allocations_by_date', '"Allocation Amount"')
    const total_included = (allocData || []).reduce((sum, row) => {
      const amount = row['Allocation Amount'] != null ? Number(row['Allocation Amount']) : 0
      return sum + (Number.isNaN(amount) ? 0 : amount)
    }, 0)

    // 2. Get Historical (Assigned) from activities_raw_import
    const historicalData = await fetchAllRows(supabase, 'activities_raw_import', 'USD')
    const historical = (historicalData || []).reduce((sum, row) => {
      const rawUSD = row['USD'] || row['usd'] || row.USD
      if (rawUSD === null || rawUSD === undefined) return sum
      const usd = Number(rawUSD)
      if (isNaN(usd) || usd === 0) return sum
      return sum + usd
    }, 0)

    // 3. Classify projects using the new logic
    const projects = await fetchAllRows(supabase, 'err_projects', 'expenses, funding_status, status, grant_id, grant_grid_id')
    
    let assignedFromProjects = 0
    let committed = 0
    let pending = 0

    for (const p of projects || []) {
      const bucket = classifyPoolProject(p)
      const total = projectExpenseTotal(p.expenses)
      if (bucket === 'assigned') {
        assignedFromProjects += total
      } else if (bucket === 'committed') {
        committed += total
      } else if (bucket === 'pending') {
        pending += total
      }
    }

    // 4. Calculate totals using the new logic
    const total_assigned = historical + assignedFromProjects
    const total_available = total_included - total_assigned
    const total_committed = committed
    const total_pending = pending
    const total_balance = total_available - total_committed - total_pending

    return NextResponse.json({ 
      total_allocated: total_included,
      total_assigned,
      total_available,
      total_committed,
      total_pending,
      total_balance
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Pool summary error:', error)
    return NextResponse.json({ error: 'Failed to compute pool summary' }, { status: 500 })
  }
}


