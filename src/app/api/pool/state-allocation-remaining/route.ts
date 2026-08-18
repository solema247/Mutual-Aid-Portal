import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { normalizeStateName } from '@/lib/normalizeStateName'
import {
  classifyPoolProject,
  poolRowFromParts,
  projectExpenseTotal,
} from '@/lib/poolProjectClassification'

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
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const stateParam = searchParams.get('state')?.trim()
    if (!stateParam) {
      return NextResponse.json({ error: 'state is required' }, { status: 400 })
    }

    const stateNormalized = normalizeState(stateParam)
    if (!stateNormalized) {
      return NextResponse.json({ error: 'Invalid state' }, { status: 400 })
    }

    const adminSupabase = getSupabaseAdmin()

    // allocations_by_date (canonical): sum allocation amount for this state (match normalized)
    const allocRows = await fetchAllRows<{ State?: string | null; 'Allocation Amount'?: number | null }>(
      adminSupabase,
      'allocations_by_date',
      'State,"Allocation Amount"'
    )

    let totalAllocated = 0
    for (const row of allocRows || []) {
      const rowState = normalizeState(row?.State)
      if (rowState !== stateNormalized) continue
      const amt = row?.['Allocation Amount'] != null ? Number(row['Allocation Amount']) : 0
      if (!Number.isNaN(amt) && amt > 0) totalAllocated += amt
    }

    // Historical commitments for this state from activities_raw_import (State, USD)
    const historicalRows = await fetchAllRows<{ State?: string | null; state?: string | null; USD?: number | null; usd?: number | null }>(
      adminSupabase,
      'activities_raw_import',
      'State,USD'
    )
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
    const { data: projects, error: projectsError } = await adminSupabase
      .from('err_projects')
      .select('expenses, funding_status, state, status, grant_id, grant_grid_id')
      .in('state', stateVariants)

    if (projectsError) throw projectsError

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
