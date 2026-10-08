import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { normalizeStateName } from '@/lib/normalizeStateName'
import {
  classifyPoolProject,
  poolRowFromParts,
  projectExpenseTotal,
} from '@/lib/poolProjectClassification'
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
export const fetchCache = 'force-no-store'

function normalizeState(state: string | null | undefined): string {
  const normalized = normalizeStateName(state)
  return normalized === 'Unknown' ? '' : normalized
}

async function fetchAllRows<T>(supabase: any, table: string, select: string): Promise<T[]> {
  const all: T[] = []
  let from = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + pageSize - 1)
    if (error) throw error
    if (!data?.length) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

/**
 * GET /api/pool/state-allocation-remaining?state=South Kordofan
 * Matches Pool by-state: Assigned = historical + grant-linked projects;
 * Available = total - assigned; Balance = available - committed - pending.
 */
const EMPTY_STATE_REMAINING = {
  total: 0,
  assigned: 0,
  available: 0,
  committed: 0,
  pending: 0,
  balance: 0,
  remaining: 0,
  historical: 0,
  allocated: 0,
}
const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

export async function GET(request: NextRequest) {
  try {
    const [grantAccess, orgScope] = await Promise.all([
      getUserGrantAccess(),
      getUserOrgScope(),
    ])
    if (orgScopeBlocksAllData(orgScope)) {
      return NextResponse.json(EMPTY_STATE_REMAINING, { headers: NO_STORE })
    }
    if (
      orgScope.mode === 'disclosed' &&
      orgScopeBlocksResourceType(orgScope, 'decisions') &&
      orgScopeBlocksResourceType(orgScope, 'f1')
    ) {
      return NextResponse.json(EMPTY_STATE_REMAINING, { headers: NO_STORE })
    }
    if (orgScope.mode !== 'disclosed' && grantAccess.mode === 'none') {
      return NextResponse.json(EMPTY_STATE_REMAINING, { headers: NO_STORE })
    }

    const { searchParams } = new URL(request.url)
    const stateParam = searchParams.get('state')?.trim()
    if (!stateParam) {
      return NextResponse.json({ error: 'state is required' }, { status: 400 })
    }

    const stateNormalized = normalizeState(stateParam)
    if (!stateNormalized) {
      return NextResponse.json({ error: 'Invalid state' }, { status: 400 })
    }

    if (grantAccess.mode === 'partner' && orgScope.mode !== 'disclosed') {
      const supabase = getSupabaseRouteClient()
      const stateVariants = [stateNormalized, stateParam].filter((v, i, a) => v && a.indexOf(v) === i)
      let assignedFromProjects = 0
      let committed = 0
      let pending = 0
      for (const batch of chunkGrantScopeIds(grantAccess.grantGridIds)) {
        let from = 0
        const pageSize = 1000
        while (true) {
          let query = supabase
            .from('err_projects')
            .select('expenses, funding_status, state, status, grant_id, grant_grid_id')
            .in('state', stateVariants)
          query = applyGrantGridIdFilter(query, { ...grantAccess, grantGridIds: batch })
          query = applyOrganizationIdFilter(query, orgScope, 'organization_id', 'f1')
          const { data, error } = await query.range(from, from + pageSize - 1)
          if (error) throw error
          if (!data?.length) break
          for (const p of data) {
            const rowState = normalizeState(p.state)
            if (rowState !== stateNormalized) continue
            const bucket = classifyPoolProject(p)
            if (!bucket) continue
            const amt = projectExpenseTotal(p.expenses)
            if (bucket === 'assigned') assignedFromProjects += amt
            else if (bucket === 'committed') committed += amt
            else pending += amt
          }
          if (data.length < pageSize) break
          from += pageSize
        }
      }
      return NextResponse.json(
        {
          ...EMPTY_STATE_REMAINING,
          assigned: assignedFromProjects,
          committed,
          pending,
          allocated: pending,
        },
        { headers: NO_STORE }
      )
    }

    const adminSupabase = getSupabaseAdmin()
    const routeSupabase = getSupabaseRouteClient()

    const decisionKeyScope = await resolveOrgDecisionKeyScope(adminSupabase, orgScope)
    let allocRows: { State?: string | null; 'Allocation Amount'?: number | null }[] = []
    if (decisionKeyScope.mode === 'all') {
      allocRows = await fetchAllRows<{ State?: string | null; 'Allocation Amount'?: number | null }>(
        adminSupabase,
        'allocations_by_date',
        'State,"Allocation Amount"'
      )
    } else if (decisionKeyScope.mode === 'keys' && decisionKeyScope.keys.length > 0) {
      let from = 0
      const pageSize = 1000
      while (true) {
        const { data: page, error } = await adminSupabase
          .from('allocations_by_date')
          .select('State,"Allocation Amount"')
          .in('Decision_ID', decisionKeyScope.keys)
          .range(from, from + pageSize - 1)
        if (error) throw error
        if (!page?.length) break
        allocRows.push(...page)
        if (page.length < pageSize) break
        from += pageSize
      }
    }

    let totalAllocated = 0
    for (const row of allocRows || []) {
      const rowState = normalizeState(row?.State)
      if (rowState !== stateNormalized) continue
      const amt = row?.['Allocation Amount'] != null ? Number(row['Allocation Amount']) : 0
      if (!Number.isNaN(amt) && amt > 0) totalAllocated += amt
    }

    // Historical commitments for this state from activities_raw_import (State, USD)
    const historicalRows =
      orgScope.mode === 'all'
        ? await fetchAllRows<{
            State?: string | null
            state?: string | null
            USD?: number | null
            usd?: number | null
          }>(adminSupabase, 'activities_raw_import', 'State,USD')
        : []
    let historical = 0
    for (const row of historicalRows || []) {
      const rawState = row['State'] ?? row['state'] ?? row.State
      const rowState = normalizeState(rawState)
      if (rowState !== stateNormalized) continue
      const rawUSD = row['USD'] ?? row['usd'] ?? row.USD
      if (rawUSD == null) continue
      const usd = Number(rawUSD)
      if (!Number.isNaN(usd) && usd > 0) historical += usd
    }

    const stateVariants = [stateNormalized, stateParam].filter((v, i, a) => v && a.indexOf(v) === i)
    let projects: {
      expenses: unknown
      funding_status: string | null
      state: string | null
      status: string | null
      grant_id: string | null
      grant_grid_id: string | null
    }[] = []
    {
      let from = 0
      const pageSize = 1000
      while (true) {
        let q = routeSupabase
          .from('err_projects')
          .select('expenses, funding_status, state, status, grant_id, grant_grid_id')
          .in('state', stateVariants)
          .range(from, from + pageSize - 1)
        q = applyOrganizationIdFilter(q, orgScope, 'organization_id', 'f1')
        const { data: page, error: projectsError } = await q
        if (projectsError) throw projectsError
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
      const rowState = normalizeState((p as any).state)
      if (rowState !== stateNormalized) continue
      const bucket = classifyPoolProject(p)
      if (!bucket) continue
      const amt = projectExpenseTotal((p as any).expenses)
      if (bucket === 'assigned') assignedFromProjects += amt
      else if (bucket === 'committed') committed += amt
      else pending += amt
    }

    const assigned = historical + assignedFromProjects
    const parts = poolRowFromParts({
      allocated: totalAllocated,
      assigned,
      committed,
      pending,
    })

    return NextResponse.json(
      {
        total: parts.allocated,
        assigned: parts.assigned,
        available: parts.available,
        committed: parts.committed,
        pending: parts.pending,
        balance: parts.balance,
        remaining: parts.remaining,
        historical,
        allocated: parts.pending,
      },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  } catch (error) {
    console.error('State allocation remaining error:', error)
    return NextResponse.json(
      { error: 'Failed to compute state allocation remaining' },
      { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  }
}
