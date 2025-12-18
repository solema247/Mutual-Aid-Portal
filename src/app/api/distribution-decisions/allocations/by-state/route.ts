import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

// GET /api/distribution-decisions/allocations/by-state
// Returns aggregated allocations grouped by state
export async function GET() {
  try {
    const supabase = getSupabaseRouteClient()
    const { data, error } = await supabase
      .from('allocations_by_date')
      .select('"State","Allocation Amount","Decision_ID"')

    if (error) throw error

    const grouped: Record<string, { state: string; total_amount: number; allocation_count: number; decision_ids: Set<string> }> = {}

    for (const row of data || []) {
      const state = row['State'] || 'Unknown'
      const amount = row['Allocation Amount'] ? Number(row['Allocation Amount']) : 0
      const decisionId = row['Decision_ID']
      if (!grouped[state]) {
        grouped[state] = { state, total_amount: 0, allocation_count: 0, decision_ids: new Set<string>() }
      }
      grouped[state].total_amount += amount
      grouped[state].allocation_count += 1
      if (decisionId) grouped[state].decision_ids.add(decisionId)
    }

    const totalAll = Object.values(grouped).reduce((s, g) => s + g.total_amount, 0) || 0

    const result = Object.values(grouped)
      .map(g => ({
        state: g.state,
        total_amount: g.total_amount,
        allocation_count: g.allocation_count,
        decision_count: g.decision_ids.size,
        percent_total: totalAll > 0 ? (g.total_amount / totalAll) * 100 : 0
      }))
      .sort((a, b) => b.total_amount - a.total_amount)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error aggregating allocations by state:', error)
    return NextResponse.json({ error: 'Failed to fetch allocations by state' }, { status: 500 })
  }
}

