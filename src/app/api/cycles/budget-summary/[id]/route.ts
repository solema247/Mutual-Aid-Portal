import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

// GET /api/cycles/budget-summary/[id] - Get budget summary for a cycle
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Get cycle details
    const { data: cycle, error: cycleError } = await supabase
      .from('funding_cycles')
      .select('*')
      .eq('id', params.id)
      .single()

    if (cycleError) throw cycleError

    // Get total available funds (sum of grant inclusions)
    const { data: grantInclusions, error: inclusionsError } = await supabase
      .from('cycle_grant_inclusions')
      .select('amount_included')
      .eq('cycle_id', params.id)

    if (inclusionsError) throw inclusionsError

    const totalAvailable = grantInclusions?.reduce((sum, inclusion) => 
      sum + (inclusion.amount_included || 0), 0) || 0

    // Get total allocated to states
    const { data: allocations, error: allocationsError } = await supabase
      .from('cycle_state_allocations')
      .select('amount')
      .eq('cycle_id', params.id)

    if (allocationsError) throw allocationsError

    const totalAllocated = allocations?.reduce((sum, allocation) => 
      sum + (allocation.amount || 0), 0) || 0

    // Get total committed (from approved workplans)
    const { data: committedProjects, error: committedError } = await supabase
      .from('err_projects')
      .select('expenses')
      .eq('funding_cycle_id', params.id)
      .eq('status', 'approved')
      .eq('funding_status', 'committed')

    if (committedError) throw committedError

    const totalCommitted = (committedProjects || []).reduce((sum, project) => {
      try {
        const expenses = typeof project.expenses === 'string' 
          ? JSON.parse(project.expenses) 
          : project.expenses
        return sum + expenses.reduce((expSum: number, exp: any) => 
          expSum + (exp.total_cost || 0), 0)
      } catch {
        return sum
      }
    }, 0)

    // Get total pending (from pending workplans)
    const { data: pendingProjects, error: pendingError } = await supabase
      .from('err_projects')
      .select('expenses')
      .eq('funding_cycle_id', params.id)
      .eq('status', 'pending')
      .eq('funding_status', 'allocated')

    if (pendingError) throw pendingError

    const totalPending = (pendingProjects || []).reduce((sum, project) => {
      try {
        const expenses = typeof project.expenses === 'string' 
          ? JSON.parse(project.expenses) 
          : project.expenses
        return sum + expenses.reduce((expSum: number, exp: any) => 
          expSum + (exp.total_cost || 0), 0)
      } catch {
        return sum
      }
    }, 0)

    // Calculate unused from previous cycles
    const { data: previousCycles, error: prevError } = await supabase
      .from('funding_cycles')
      .select(`
        id,
        cycle_grant_inclusions (amount_included),
        cycle_state_allocations (amount)
      `)
      .eq('year', cycle.year)
      .lt('cycle_number', cycle.cycle_number)
      .eq('status', 'closed')

    if (prevError) throw prevError

    let unusedFromPrevious = 0
    if (previousCycles) {
      previousCycles.forEach(prevCycle => {
        const prevAvailable = prevCycle.cycle_grant_inclusions?.reduce((sum: number, inc: any) => 
          sum + (inc.amount_included || 0), 0) || 0
        const prevAllocated = prevCycle.cycle_state_allocations?.reduce((sum: number, alloc: any) => 
          sum + (alloc.amount || 0), 0) || 0
        unusedFromPrevious += (prevAvailable - prevAllocated)
      })
    }

    const budgetSummary = {
      cycle,
      total_available: totalAvailable,
      total_allocated: totalAllocated,
      total_committed: totalCommitted,
      total_pending: totalPending,
      remaining: totalAvailable - totalCommitted - totalPending,
      unused_from_previous: unusedFromPrevious
    }

    return NextResponse.json(budgetSummary)
  } catch (error) {
    console.error('Error fetching budget summary:', error)
    return NextResponse.json({ error: 'Failed to fetch budget summary' }, { status: 500 })
  }
}
