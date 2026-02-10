import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

function normalizeState(state: string | null | undefined): string {
  if (!state || typeof state !== 'string') return ''
  let s = state.trim()
  if (!s) return ''
  const map: Record<string, string> = {
    'Al Jazeera': 'Al Jazirah',
    'Gadarif': 'Gadaref',
    'Sinar': 'Sennar'
  }
  return map[s] ?? map[s.toLowerCase()] ?? s
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
 * Returns { total, historical, committed, allocated, remaining } for the state.
 * Total from allocations table; historical from activities_raw_import; committed/allocated from err_projects.
 * Remaining = total - historical - committed - allocated (matches Pool by-state logic).
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

    // Allocations table (foreign): sum allocation_amount for this state (match normalized)
    const { data: allocRows, error: allocError } = await adminSupabase
      .from('allocations')
      .select('state, allocation_amount')

    if (allocError) throw allocError

    let totalAllocated = 0
    for (const row of allocRows || []) {
      const rowState = normalizeState(row?.state)
      if (rowState !== stateNormalized) continue
      const amt = row?.allocation_amount != null ? Number(row.allocation_amount) : 0
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

    // Projects in this state (use admin so we see all projects for accurate committed/allocated)
    const stateVariants = [stateNormalized, stateParam].filter((v, i, a) => v && a.indexOf(v) === i)
    const { data: projects, error: projectsError } = await adminSupabase
      .from('err_projects')
      .select('expenses, funding_status, state, status')
      .in('state', stateVariants)

    if (projectsError) throw projectsError

    const sumExpenses = (exp: unknown): number => {
      try {
        const arr = typeof exp === 'string' ? JSON.parse(exp || '[]') : (exp || [])
        return Array.isArray(arr) ? arr.reduce((s: number, e: any) => s + (e?.total_cost || 0), 0) : 0
      } catch {
        return 0
      }
    }

    let committed = 0
    let allocated = 0
    for (const p of projects || []) {
      const rowState = normalizeState((p as any).state)
      if (rowState !== stateNormalized) continue
      const amt = sumExpenses((p as any).expenses)
      if ((p as any).funding_status === 'committed') committed += amt
      else if ((p as any).funding_status === 'allocated' || ((p as any).funding_status === 'unassigned' && (p as any).status === 'pending')) allocated += amt
    }

    // Remaining = total - historical - committed - allocated (same as Pool by-state)
    const remaining = totalAllocated - historical - committed - allocated

    return NextResponse.json(
      { total: totalAllocated, historical, committed, allocated, remaining },
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
