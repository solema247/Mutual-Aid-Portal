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
import {
  inDateRange,
  matchesDecisionId,
  matchesMulti,
  parsePoolSliceFilters,
  uniqueSortedStrings,
  type PoolSliceFilters,
} from '@/lib/poolByState'

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

function matchesPoolSlice(
  filters: PoolSliceFilters,
  row: {
    state: string
    partner?: unknown
    restriction?: unknown
    grant?: unknown
    date?: unknown
    decisionId?: unknown
  },
  opts?: { skipDecisionId?: boolean }
): boolean {
  if (!matchesMulti(row.state, filters.states, normalizeStateName)) return false
  if (!matchesMulti(row.partner, filters.partners)) return false
  if (!matchesMulti(row.restriction, filters.restrictions, normalizeRestrictionLabel)) return false
  if (!matchesMulti(row.grant, filters.grants)) return false
  if (!inDateRange(row.date, filters.dateFrom, filters.dateTo)) return false
  if (!opts?.skipDecisionId && !matchesDecisionId(row.decisionId, filters.decisionId)) return false
  return true
}

// GET /api/pool/by-state - Aggregated view using allocations_by_date
export async function GET(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const filters = parsePoolSliceFilters(new URL(request.url).searchParams)

    const { getUserStateAccess } = await import('@/lib/userStateAccess')
    const { allowedStateNames } = await getUserStateAccess()

    const allocationsSupabase = getSupabaseAdmin()
    const allocationsData = await fetchAllRows(
      allocationsSupabase,
      'allocations_by_date',
      'State,"Allocation Amount","Decision_ID",Partner,Restriction,"Grant_ID","Decision_Date"'
    )

    const optionPartners: string[] = []
    const optionRestrictions: string[] = []
    const optionGrants: string[] = []
    const optionStates: string[] = []

    const allocatedByState = new Map<string, number>()
    const decisionsByState = new Map<string, Set<string>>()
    const allDecisionIds = new Set<string>()
    for (const row of allocationsData || []) {
      const state = normalizeStateName(row?.State ?? row?.state)
      if (!isAllowedState(state, allowedStateNames)) continue
      const partner = row?.Partner ?? row?.partner ?? null
      const restriction = normalizeRestrictionLabel(row?.Restriction ?? row?.restriction)
      const grant = row?.Grant_ID ?? row?.grant_id ?? null
      const decisionDate = row?.Decision_Date ?? row?.decision_date ?? null
      const decisionId = String(row?.Decision_ID ?? row?.decision_id ?? '').trim()

      optionStates.push(state)
      if (partner) optionPartners.push(String(partner))
      if (restriction) optionRestrictions.push(restriction)
      if (grant) optionGrants.push(String(grant))

      if (
        !matchesPoolSlice(filters, {
          state,
          partner,
          restriction,
          grant,
          date: decisionDate,
          decisionId,
        })
      ) {
        continue
      }

      const rawAmount = row?.['Allocation Amount'] ?? row?.allocation_amount
      const amount = rawAmount != null ? Number(rawAmount) : 0
      if (!Number.isNaN(amount) && amount > 0) {
        allocatedByState.set(state, (allocatedByState.get(state) || 0) + amount)
      }
      if (decisionId) {
        allDecisionIds.add(decisionId)
        const set = decisionsByState.get(state) || new Set<string>()
        set.add(decisionId)
        decisionsByState.set(state, set)
      }
    }

    const skipUsageByDecision = Boolean(filters.decisionId)

    const historicalData = await fetchAllRows(
      supabase,
      'activities_raw_import',
      'State,USD,Partner,"Project Donor","Grant Segment","Date Transfer","Start Date (Activity)"'
    )

    const historicalByState = new Map<string, number>()
    if (!skipUsageByDecision) {
      for (const row of historicalData || []) {
        const state = normalizeStateName(row['State'] || row['state'] || row.State)
        if (!isAllowedState(state, allowedStateNames)) continue
        const partner = row['Partner'] ?? row.Partner ?? null
        const grant = row['Project Donor'] ?? row['Project_Donor'] ?? null
        const restriction = normalizeRestrictionLabel(row['Grant Segment'] ?? row['Grant_Segment'])
        const date = row['Date Transfer'] || row['Start Date (Activity)'] || null

        optionStates.push(state)
        if (partner) optionPartners.push(String(partner))
        if (grant) optionGrants.push(String(grant))
        if (restriction) optionRestrictions.push(restriction)

        if (
          !matchesPoolSlice(
            filters,
            { state, partner, restriction, grant, date },
            { skipDecisionId: true }
          )
        ) {
          continue
        }

        const rawUSD = row['USD'] || row['usd'] || row.USD
        const usd = rawUSD != null ? Number(rawUSD) : 0
        if (!Number.isNaN(usd) && usd > 0) {
          historicalByState.set(state, (historicalByState.get(state) || 0) + usd)
        }
      }
    }

    const projects = await fetchAllRows(
      supabase,
      'err_projects',
      'expenses, funding_status, status, state, grant_id, grant_grid_id, grant_segment, date, date_transfer'
    )

    const assignedFromProjectsByState = new Map<string, number>()
    const committedByState = new Map<string, number>()
    const pendingByState = new Map<string, number>()
    if (!skipUsageByDecision) {
      for (const p of projects || []) {
        const bucket = classifyPoolProject(p)
        if (!bucket) continue
        const state = normalizeStateName(p.state)
        if (!isAllowedState(state, allowedStateNames)) continue
        const grant = p.grant_id || p.grant_grid_id || null
        const restriction = normalizeRestrictionLabel(p.grant_segment)
        const date = p.date_transfer || p.date || null

        optionStates.push(state)
        if (grant && !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(grant))) {
          optionGrants.push(String(grant))
        }
        if (p.grant_segment) optionRestrictions.push(restriction)

        if (
          !matchesPoolSlice(
            filters,
            {
              state,
              restriction,
              grant,
              date,
            },
            { skipDecisionId: true }
          )
        ) {
          continue
        }
        // Portal projects have no ops-partner field; skip them when a partner slice is active.
        if (filters.partners.length > 0) continue

        const amount = projectExpenseTotal(p.expenses)
        const target =
          bucket === 'assigned'
            ? assignedFromProjectsByState
            : bucket === 'committed'
              ? committedByState
              : pendingByState
        target.set(state, (target.get(state) || 0) + amount)
      }
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

    return NextResponse.json(
      {
        rows,
        filter_options: {
          partnerOptions: uniqueSortedStrings(optionPartners),
          restrictionOptions: uniqueSortedStrings(optionRestrictions),
          grantOptions: uniqueSortedStrings(optionGrants),
          stateOptions: uniqueSortedStrings(optionStates),
        },
      },
      {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
      }
    )
  } catch (error) {
    console.error('Pool by-state error:', error)
    return NextResponse.json(
      { error: 'Failed to compute by-state' },
      { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  }
}
