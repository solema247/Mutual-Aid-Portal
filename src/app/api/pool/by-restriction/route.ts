import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { normalizeStateName } from '@/lib/normalizeStateName'
import {
  classifyPoolProject,
  poolRowFromParts,
  projectExpenseTotal,
} from '@/lib/poolProjectClassification'
import { normalizeRestrictionLabel } from '@/lib/poolRestrictionLabel'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

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
      hasMore = page.length === pageSize
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

function addAmount(map: Map<string, number>, key: string, amount: number) {
  if (!amount || Number.isNaN(amount)) return
  map.set(key, (map.get(key) || 0) + amount)
}

/**
 * GET /api/pool/by-restriction
 * Allocated from allocations_by_date.Restriction.
 * Assigned / committed / pending from F1 grant_segment (portal + historical).
 * WRR and WERR are treated as WRR.
 */
export async function GET() {
  try {
    const supabase = getSupabaseRouteClient()
    const { getUserStateAccess } = await import('@/lib/userStateAccess')
    const { allowedStateNames } = await getUserStateAccess()

    const allocationsData = await fetchAllRows(
      getSupabaseAdmin(),
      'allocations_by_date',
      'State,"Allocation Amount",Restriction'
    )

    const allocatedByRestriction = new Map<string, number>()
    for (const row of allocationsData || []) {
      const state = normalizeStateName(row?.State ?? row?.state)
      if (!isAllowedState(state, allowedStateNames)) continue
      const rawAmount = row?.['Allocation Amount'] ?? row?.allocation_amount
      const amount = rawAmount != null ? Number(rawAmount) : 0
      if (Number.isNaN(amount) || amount <= 0) continue
      const key = normalizeRestrictionLabel(row?.Restriction ?? row?.restriction)
      addAmount(allocatedByRestriction, key, amount)
    }

    const historicalData = await fetchAllRows(
      supabase,
      'activities_raw_import',
      'State,USD,"Grant Segment"'
    )

    const historicalByRestriction = new Map<string, number>()
    for (const row of historicalData || []) {
      const state = normalizeStateName(row['State'] || row['state'] || row.State)
      if (!isAllowedState(state, allowedStateNames)) continue
      const rawUSD = row['USD'] || row['usd'] || row.USD
      const usd = rawUSD != null ? Number(rawUSD) : 0
      if (Number.isNaN(usd) || usd <= 0) continue
      const key = normalizeRestrictionLabel(row['Grant Segment'] ?? row.grant_segment)
      addAmount(historicalByRestriction, key, usd)
    }

    const projects = await fetchAllRows(
      supabase,
      'err_projects',
      'expenses, funding_status, status, state, grant_id, grant_grid_id, grant_segment'
    )

    const assignedFromProjects = new Map<string, number>()
    const committedByRestriction = new Map<string, number>()
    const pendingByRestriction = new Map<string, number>()
    for (const p of projects || []) {
      const bucket = classifyPoolProject(p)
      if (!bucket) continue
      const state = normalizeStateName(p.state)
      if (!isAllowedState(state, allowedStateNames)) continue
      const amount = projectExpenseTotal(p.expenses)
      const key = normalizeRestrictionLabel(p.grant_segment)
      const target =
        bucket === 'assigned'
          ? assignedFromProjects
          : bucket === 'committed'
            ? committedByRestriction
            : pendingByRestriction
      addAmount(target, key, amount)
    }

    const names = Array.from(
      new Set<string>([
        ...allocatedByRestriction.keys(),
        ...historicalByRestriction.keys(),
        ...assignedFromProjects.keys(),
        ...committedByRestriction.keys(),
        ...pendingByRestriction.keys(),
      ])
    )

    const rows = names
      .map((restriction) => {
        const allocated = allocatedByRestriction.get(restriction) || 0
        const assigned =
          (historicalByRestriction.get(restriction) || 0) +
          (assignedFromProjects.get(restriction) || 0)
        const committed = committedByRestriction.get(restriction) || 0
        const pending = pendingByRestriction.get(restriction) || 0
        return {
          restriction,
          ...poolRowFromParts({ allocated, assigned, committed, pending }),
        }
      })
      .filter(
        (r) => r.allocated > 0 || r.assigned > 0 || r.committed > 0 || r.pending > 0
      )
      .sort((a, b) => b.allocated - a.allocated || a.restriction.localeCompare(b.restriction))

    return NextResponse.json(rows, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    })
  } catch (error) {
    console.error('Pool by-restriction error:', error)
    return NextResponse.json(
      { error: 'Failed to compute by-restriction' },
      { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  }
}
