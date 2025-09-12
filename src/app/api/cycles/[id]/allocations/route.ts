import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

// GET /api/cycles/[id]/allocations - Get state allocations for a cycle
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { data, error } = await supabase
      .from('cycle_state_allocations')
      .select(`
        *,
        err_projects!cycle_state_allocation_id (
          id,
          expenses,
          status,
          funding_status
        )
      `)
      .eq('cycle_id', params.id)
      .order('state_name')

    if (error) throw error

    // Calculate committed and pending amounts for each allocation
    const allocationsWithCalculations = data.map(allocation => {
      const projects = allocation.err_projects || []
      
      const totalCommitted = projects
        .filter((p: any) => p.status === 'approved' && p.funding_status === 'committed')
        .reduce((sum: number, p: any) => {
          try {
            const expenses = typeof p.expenses === 'string' ? JSON.parse(p.expenses) : p.expenses
            return sum + expenses.reduce((expSum: number, exp: any) => 
              expSum + (exp.total_cost || 0), 0)
          } catch {
            return sum
          }
        }, 0)

      const totalPending = projects
        .filter((p: any) => p.status === 'pending' && p.funding_status === 'allocated')
        .reduce((sum: number, p: any) => {
          try {
            const expenses = typeof p.expenses === 'string' ? JSON.parse(p.expenses) : p.expenses
            return sum + expenses.reduce((expSum: number, exp: any) => 
              expSum + (exp.total_cost || 0), 0)
          } catch {
            return sum
          }
        }, 0)

      return {
        ...allocation,
        total_committed: totalCommitted,
        total_pending: totalPending,
        remaining: allocation.amount - totalCommitted - totalPending
      }
    })

    return NextResponse.json(allocationsWithCalculations)
  } catch (error) {
    console.error('Error fetching cycle allocations:', error)
    return NextResponse.json({ error: 'Failed to fetch cycle allocations' }, { status: 500 })
  }
}

// POST /api/cycles/[id]/allocations - Create state allocations for a cycle
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { allocations } = body

    if (!allocations || !Array.isArray(allocations)) {
      return NextResponse.json({ error: 'Invalid allocations data' }, { status: 400 })
    }

    // Get the latest decision number for this cycle
    const { data: maxDecision, error: decisionError } = await supabase
      .from('cycle_state_allocations')
      .select('decision_no')
      .eq('cycle_id', params.id)
      .order('decision_no', { ascending: false })
      .limit(1)

    if (decisionError) throw decisionError

    const nextDecisionNo = (maxDecision?.[0]?.decision_no ?? 0) + 1

    // Prepare allocations data
    const allocationsData = allocations.map((allocation: any) => ({
      cycle_id: params.id,
      state_name: allocation.state_name,
      amount: allocation.amount,
      decision_no: nextDecisionNo
    }))

    const { data, error } = await supabase
      .from('cycle_state_allocations')
      .insert(allocationsData)
      .select()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error creating cycle allocations:', error)
    return NextResponse.json({ error: 'Failed to create cycle allocations' }, { status: 500 })
  }
}
