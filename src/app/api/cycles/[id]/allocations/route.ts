import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

// GET /api/cycles/[id]/allocations - Get state allocations for a cycle
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseRouteClient()
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
        .filter((p: any) => (p.status === 'approved' || p.status === 'active') && p.funding_status === 'committed')
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
    const supabase = getSupabaseRouteClient()
    const body = await request.json()
    const { allocations } = body

    if (!allocations || !Array.isArray(allocations)) {
      return NextResponse.json({ error: 'Invalid allocations data' }, { status: 400 })
    }

    // Load tranche caps from cycle_tranches (preferred) or fallback to cycle.tranche_splits
    const { data: tranches, error: tranchesErr } = await supabase
      .from('cycle_tranches')
      .select('tranche_no, planned_cap, status')
      .eq('cycle_id', params.id)
      .order('tranche_no', { ascending: true })
    if (tranchesErr) throw tranchesErr

    // Build caps array from cycle_tranches
    const trancheSplits: number[] = (tranches || []).map(t => Number(t.planned_cap) || 0)

    // Get existing allocations grouped by decision_no
    const { data: maxDecision, error: decisionError } = await supabase
      .from('cycle_state_allocations')
      .select('decision_no')
      .eq('cycle_id', params.id)
      .order('decision_no', { ascending: false })
      .limit(1)

    if (decisionError) throw decisionError

    // Use the lowest open tranche from cycle_tranches if available
    let activeDecision = 1
    const open = (tranches || []).filter(t => t.status === 'open').map(t => t.tranche_no)
    if (open.length > 0) {
      activeDecision = Math.min(...open)
    } else {
      const latestDecision = maxDecision?.[0]?.decision_no ?? 0
      activeDecision = Math.max(1, latestDecision === 0 ? 1 : latestDecision)
    }

    // Enforce cap if a split is defined for this tranche
    if (trancheSplits.length >= activeDecision) {
      // Per-tranche caps
      const perTrancheCaps = trancheSplits
      const cumulativeCapUpToActive = perTrancheCaps
        .slice(0, activeDecision)
        .reduce((s: number, n: number) => s + (Number(n) || 0), 0)

      // Sum allocations in all previous tranches
      const { data: prevAllocs, error: prevErr } = await supabase
        .from('cycle_state_allocations')
        .select('amount, decision_no')
        .eq('cycle_id', params.id)
        .lt('decision_no', activeDecision)
      if (prevErr) throw prevErr
      const allocatedBefore = (prevAllocs || []).reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0)

      // Effective available for the active tranche = cumulative caps - allocations before
      const effectiveAvailableForActive = Math.max(0, cumulativeCapUpToActive - allocatedBefore)

      // Existing allocations in the active tranche
      const { data: existingInTranche, error: sumErr } = await supabase
        .from('cycle_state_allocations')
        .select('amount, decision_no')
        .eq('cycle_id', params.id)
        .eq('decision_no', activeDecision)
      if (sumErr) throw sumErr
      const already = (existingInTranche || []).reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0)

      const toAdd = (allocations || []).reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0)

      if (already + toAdd > effectiveAvailableForActive + 1e-6) {
        return NextResponse.json({ error: 'Allocation exceeds available cap for this tranche' }, { status: 400 })
      }
    }

    // Prepare allocations data
    const allocationsData = allocations.map((allocation: any) => ({
      cycle_id: params.id,
      state_name: allocation.state_name,
      amount: allocation.amount,
      decision_no: activeDecision
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
