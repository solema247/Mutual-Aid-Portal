import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
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

function isAllowedState(state: string, allowedStateNames: string[] | null): boolean {
  if (allowedStateNames === null || allowedStateNames.length === 0) return true
  const allowed = new Set(allowedStateNames.map((s) => normalizeStateName(s)))
  return allowed.has(state)
}

// GET /api/pool/by-state - Aggregated view using allocations_by_date
export async function GET() {
  try {
    const supabase = getSupabaseRouteClient()

    // Get user's state access rights
    const { getUserStateAccess } = await import('@/lib/userStateAccess')
    const { allowedStateNames } = await getUserStateAccess()

    // 1. Get allocations from allocations_by_date (canonical)
    const allocationsSupabase = getSupabaseAdmin()
    const allocationsData = await fetchAllRows(
      allocationsSupabase,
      'allocations_by_date',
      'State,"Allocation Amount","Decision_ID"'
    )

    const allocatedByState = new Map<string, number>()
    const decisionsByState = new Map<string, Set<string>>()
    const allDecisionIds = new Set<string>()
    for (const row of allocationsData || []) {
      const rawState = row?.State ?? row?.state
      const state = normalizeStateName(rawState)
      if (!isAllowedState(state, allowedStateNames)) continue
      const rawAmount = row?.['Allocation Amount'] ?? row?.allocation_amount
      const amount = rawAmount != null ? Number(rawAmount) : 0
      if (!Number.isNaN(amount) && amount > 0) {
        allocatedByState.set(state, (allocatedByState.get(state) || 0) + amount)
      }
      const decisionId = String(row?.Decision_ID ?? row?.decision_id ?? '').trim()
      if (decisionId) {
        allDecisionIds.add(decisionId)
        const set = decisionsByState.get(state) || new Set<string>()
        set.add(decisionId)
        decisionsByState.set(state, set)
      }
    }

    // 2. Get historical commitments from activities_raw_import
    const historicalData = await fetchAllRows(supabase, 'activities_raw_import', 'State,USD')

    const historicalByState = new Map<string, number>()
    for (const row of historicalData || []) {
      const rawState = row['State'] || row['state'] || row.State
      const state = normalizeStateName(rawState)
      if (!isAllowedState(state, allowedStateNames)) continue
      const rawUSD = row['USD'] || row['usd'] || row.USD
      let usd = 0
      if (rawUSD !== null && rawUSD !== undefined) {
        usd = Number(rawUSD)
        if (!isNaN(usd) && usd > 0) {
          historicalByState.set(state, (historicalByState.get(state) || 0) + usd)
        }
      }
    }

    // 3. Classify portal projects: assigned (has grant), committed (F2-approved, no grant), pending
    const projects = await fetchAllRows(
      supabase,
      'err_projects',
      'expenses, funding_status, status, state, grant_id, grant_grid_id'
    )

    const assignedFromProjectsByState = new Map<string, number>()
    const committedByState = new Map<string, number>()
    const pendingByState = new Map<string, number>()
    for (const p of projects || []) {
      const bucket = classifyPoolProject(p)
      if (!bucket) continue
      const state = normalizeStateName(p.state)
      if (!isAllowedState(state, allowedStateNames)) continue
      const amount = projectExpenseTotal(p.expenses)
      const target =
        bucket === 'assigned'
          ? assignedFromProjectsByState
          : bucket === 'committed'
            ? committedByState
            : pendingByState
      target.set(state, (target.get(state) || 0) + amount)
    }

    const states = Array.from(
      new Set<string>([
        ...Array.from(allocatedByState.keys()),
        ...Array.from(historicalByState.keys()),
        ...Array.from(assignedFromProjectsByState.keys()),
        ...Array.from(committedByState.keys()),
        ...Array.from(pendingByState.keys()),
        ...Array.from(decisionsByState.keys()),
      ])
    )

    const overallDecisionCount = allDecisionIds.size
    const rows = states
      .map((state) => {
        const allocated = allocatedByState.get(state) || 0
        const assigned =
          (historicalByState.get(state) || 0) + (assignedFromProjectsByState.get(state) || 0)
        const committed = committedByState.get(state) || 0
        const pending = pendingByState.get(state) || 0
        const decision_count = decisionsByState.get(state)?.size || 0
        return {
          state_name: state,
          ...poolRowFromParts({ allocated, assigned, committed, pending }),
          decision_count,
          overall_decision_count: overallDecisionCount,
        }
      })
      .sort((a, b) => a.state_name.localeCompare(b.state_name))

    return NextResponse.json(rows, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    })
  } catch (error) {
    console.error('Pool by-state error:', error)
    return NextResponse.json(
      { error: 'Failed to compute by-state' },
      { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  }
}
