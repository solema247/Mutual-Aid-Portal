import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

// GET /api/f2/grant-calls - Get grant calls with remaining amounts for reassignment
export async function GET() {
  try {
    const supabase = getSupabaseRouteClient()
    const { data, error } = await supabase
      .from('grant_calls')
      .select(`
        id,
        name,
        donors (name),
        cycle_grant_inclusions (amount_included)
      `)
      .eq('status', 'open')

    if (error) throw error

    // Calculate remaining amounts for each grant call
    const grantCallsWithRemaining = await Promise.all(
      (data || []).map(async (gc: any) => {
        const { data: usage } = await supabase
          .from('err_projects')
          .select('expenses, funding_status')
          .eq('grant_call_id', gc.id)

        const totalIncluded = (gc.cycle_grant_inclusions || []).reduce((sum: number, inc: any) => sum + (inc.amount_included || 0), 0)
        const totalCommitted = (usage || []).filter((u: any) => u.funding_status === 'committed')
          .reduce((sum: number, u: any) => {
            const expenses = typeof u.expenses === 'string' ? JSON.parse(u.expenses) : u.expenses || []
            return sum + expenses.reduce((s: number, e: any) => s + (e.total_cost || 0), 0)
          }, 0)
        const totalAllocated = (usage || []).filter((u: any) => u.funding_status === 'allocated')
          .reduce((sum: number, u: any) => {
            const expenses = typeof u.expenses === 'string' ? JSON.parse(u.expenses) : u.expenses || []
            return sum + expenses.reduce((s: number, e: any) => s + (e.total_cost || 0), 0)
          }, 0)

        return {
          id: gc.id,
          name: gc.name,
          donor_name: gc.donors?.name || 'Unknown',
          total_included: totalIncluded,
          total_committed: totalCommitted,
          total_allocated: totalAllocated,
          remaining_amount: totalIncluded - totalCommitted - totalAllocated
        }
      })
    )

    // Only return grant calls with remaining amount > 0
    const availableGrantCalls = grantCallsWithRemaining.filter(gc => gc.remaining_amount > 0)

    return NextResponse.json(availableGrantCalls)
  } catch (error) {
    console.error('Error fetching grant calls:', error)
    return NextResponse.json({ error: 'Failed to fetch grant calls' }, { status: 500 })
  }
}
