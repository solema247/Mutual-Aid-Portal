import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { classifyPoolProject, projectExpenseTotal } from '@/lib/poolProjectClassification'
import {
  applyGrantGridIdFilter,
  chunkGrantScopeIds,
  getUserGrantAccess,
} from '@/lib/userGrantAccess'
import {
  applyOrganizationIdFilter,
  getUserOrgScope,
  orgScopeBlocksAllData,
  orgScopeBlocksResourceType,
} from '@/lib/canvas/orgScope'
import { resolveOrgDecisionKeyScope } from '@/lib/canvas/orgResourceScope'

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
    const [grantAccess, orgScope] = await Promise.all([
      getUserGrantAccess(),
      getUserOrgScope(),
    ])
    const emptySummary = {
      total_allocated: 0,
      total_assigned: 0,
      total_available: 0,
      total_committed: 0,
      total_pending: 0,
      total_balance: 0,
    }
    if (orgScopeBlocksAllData(orgScope)) {
      return NextResponse.json(emptySummary, { headers: { 'Cache-Control': 'no-store' } })
    }
    if (orgScope.mode !== 'disclosed' && grantAccess.mode === 'none') {
      return NextResponse.json(emptySummary, { headers: { 'Cache-Control': 'no-store' } })
    }
    // Pool needs decisions and/or f1; without either, empty
    if (
      orgScope.mode === 'disclosed' &&
      orgScopeBlocksResourceType(orgScope, 'decisions') &&
      orgScopeBlocksResourceType(orgScope, 'f1')
    ) {
      return NextResponse.json(emptySummary, { headers: { 'Cache-Control': 'no-store' } })
    }
    if (grantAccess.mode === 'partner' && orgScope.mode !== 'disclosed') {
      let assignedFromProjects = 0
      let committed = 0
      let pending = 0
      for (const batch of chunkGrantScopeIds(grantAccess.grantGridIds)) {
        let from = 0
        const pageSize = 1000
        while (true) {
          let query = supabase
            .from('err_projects')
            .select('expenses, funding_status, status, grant_id, grant_grid_id')
          query = applyGrantGridIdFilter(query, { ...grantAccess, grantGridIds: batch })
          query = applyOrganizationIdFilter(query, orgScope, 'organization_id', 'f1')
          const { data, error } = await query.range(from, from + pageSize - 1)
          if (error) throw error
          if (!data?.length) break
          for (const p of data) {
            const bucket = classifyPoolProject(p)
            const total = projectExpenseTotal(p.expenses)
            if (bucket === 'assigned') assignedFromProjects += total
            else if (bucket === 'committed') committed += total
            else if (bucket === 'pending') pending += total
          }
          if (data.length < pageSize) break
          from += pageSize
        }
      }
      return NextResponse.json(
        {
          ...emptySummary,
          total_assigned: assignedFromProjects,
          total_committed: committed,
          total_pending: pending,
        },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    }
    
    // 1. Total Included = sum of allocation amounts for this org's decisions
    const allocationsSupabase = getSupabaseAdmin()
    const decisionKeyScope = await resolveOrgDecisionKeyScope(allocationsSupabase, orgScope)
    let allocData: any[] = []
    if (decisionKeyScope.mode === 'all') {
      allocData = await fetchAllRows(allocationsSupabase, 'allocations_by_date', '"Allocation Amount"')
    } else if (decisionKeyScope.mode === 'keys' && decisionKeyScope.keys.length > 0) {
      let from = 0
      const pageSize = 1000
      while (true) {
        const { data: page, error } = await allocationsSupabase
          .from('allocations_by_date')
          .select('"Allocation Amount"')
          .in('Decision_ID', decisionKeyScope.keys)
          .range(from, from + pageSize - 1)
        if (error) throw error
        if (!page?.length) break
        allocData.push(...page)
        if (page.length < pageSize) break
        from += pageSize
      }
    }
    const total_included = (allocData || []).reduce((sum, row) => {
      const amount = row['Allocation Amount'] != null ? Number(row['Allocation Amount']) : 0
      return sum + (Number.isNaN(amount) ? 0 : amount)
    }, 0)

    // 2. Historical import is global LoHub data — omit for org-bound sessions
    let historical = 0
    if (orgScope.mode === 'all') {
      const historicalData = await fetchAllRows(supabase, 'activities_raw_import', 'USD')
      historical = (historicalData || []).reduce((sum, row) => {
        const rawUSD = row['USD'] || row['usd'] || row.USD
        if (rawUSD === null || rawUSD === undefined) return sum
        const usd = Number(rawUSD)
        if (isNaN(usd) || usd === 0) return sum
        return sum + usd
      }, 0)
    }

    // 3. Classify projects using the new logic (org-scoped)
    let projects: any[] = []
    {
      let from = 0
      const pageSize = 1000
      while (true) {
        let q = supabase
          .from('err_projects')
          .select('expenses, funding_status, status, grant_id, grant_grid_id')
          .range(from, from + pageSize - 1)
        q = applyOrganizationIdFilter(q, orgScope, 'organization_id', 'f1')
        const { data: page, error } = await q
        if (error) throw error
        if (!page?.length) break
        projects.push(...page)
        if (page.length < pageSize) break
        from += pageSize
      }
    }

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


