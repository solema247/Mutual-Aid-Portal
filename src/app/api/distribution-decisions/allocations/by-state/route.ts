import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { normalizeStateName } from '@/lib/normalizeStateName'
import {
  classifyPoolProject,
  poolRowFromParts,
  projectExpenseTotal,
} from '@/lib/poolProjectClassification'

// GET /api/distribution-decisions/allocations/by-state
// Returns aggregated allocations grouped by state
export async function GET() {
  try {
    const supabase = getSupabaseRouteClient()

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
          hasMore = page.length === pageSize
        } else {
          hasMore = false
        }
      }

      return allData
    }

    const allocData = await fetchAllRows('allocations_by_date', 'State,"Allocation Amount"')
    const historicalData = await fetchAllRows('activities_raw_import', 'State,USD')
    const projects = await fetchAllRows(
      'err_projects',
      'expenses, funding_status, status, state, grant_id, grant_grid_id'
    )

    const grouped: Record<
      string,
      {
        state: string
        total_allocated: number
        historical_usd: number
        assigned_from_projects: number
        committed: number
        pending: number
      }
    > = {}

    const ensure = (state: string) => {
      if (!grouped[state]) {
        grouped[state] = {
          state,
          total_allocated: 0,
          historical_usd: 0,
          assigned_from_projects: 0,
          committed: 0,
          pending: 0,
        }
      }
      return grouped[state]
    }

    for (const row of allocData || []) {
      const rawState = row['State'] || row['state'] || row.State
      const rawAmount = row['Allocation Amount'] || row['allocation_amount'] || row['allocation amount']
      const state = normalizeStateName(rawState)
      const amount = rawAmount ? Number(rawAmount) : 0
      ensure(state).total_allocated += amount
    }

    for (const row of historicalData || []) {
      const rawState = row['State'] || row['state'] || row.State
      const rawUSD = row['USD'] || row['usd'] || row.USD
      const state = normalizeStateName(rawState)
      let usd = 0
      if (rawUSD !== null && rawUSD !== undefined) {
        usd = Number(rawUSD)
        if (isNaN(usd) || usd === 0) continue
      } else {
        continue
      }
      ensure(state).historical_usd += usd
    }

    for (const p of projects || []) {
      const bucket = classifyPoolProject(p)
      if (!bucket) continue
      const state = normalizeStateName(p.state)
      const amount = projectExpenseTotal(p.expenses)
      const row = ensure(state)
      if (bucket === 'assigned') row.assigned_from_projects += amount
      else if (bucket === 'committed') row.committed += amount
      else row.pending += amount
    }

    const totalAll = Object.values(grouped).reduce((s, g) => s + g.total_allocated, 0) || 0

    const result = Object.values(grouped)
      .map((g) => {
        const assigned = g.historical_usd + g.assigned_from_projects
        const parts = poolRowFromParts({
          allocated: g.total_allocated,
          assigned,
          committed: g.committed,
          pending: g.pending,
        })
        return {
          state: g.state,
          total_allocated: parts.allocated,
          assigned: parts.assigned,
          available: parts.available,
          committed: parts.committed,
          pending: parts.pending,
          balance: parts.balance,
          remaining: parts.remaining,
          percent_total: totalAll > 0 ? (g.total_allocated / totalAll) * 100 : 0,
        }
      })
      .sort((a, b) => b.total_allocated - a.total_allocated)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error aggregating allocations by state:', error)
    return NextResponse.json({ error: 'Failed to fetch allocations by state' }, { status: 500 })
  }
}
