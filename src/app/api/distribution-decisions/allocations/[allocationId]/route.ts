import { NextResponse } from 'next/server'
import { requireGrantEditor } from '@/lib/grantManagement/requireGrantEditor'
import { refreshDecisionAllocationSum } from '@/lib/grantManagement/refreshDecisionSum'

// PUT /api/distribution-decisions/allocations/[allocationId] - Update a specific allocation
export async function PUT(
  request: Request,
  { params }: { params: { allocationId: string } }
) {
  const auth = await requireGrantEditor()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const { state, amount } = body

    if (!state || !amount || Number(amount) <= 0) {
      return NextResponse.json({ error: 'State and valid amount are required' }, { status: 400 })
    }

    const { data: allocationData, error: fetchError } = await auth.ctx.supabase
      .from('allocations_by_date')
      .select('Decision_ID')
      .eq('Allocation_ID', params.allocationId)
      .single()

    if (fetchError || !allocationData) {
      return NextResponse.json({ error: 'Allocation not found' }, { status: 404 })
    }

    const groupKey = allocationData.Decision_ID
    if (!groupKey) {
      return NextResponse.json({ error: 'Allocation has no linked decision' }, { status: 400 })
    }

    const { data: decision, error: decisionError } = await auth.ctx.supabase
      .from('distribution_decision_master_sheet_1')
      .select('decision_amount')
      .eq('decision_id_proposed', groupKey)
      .single()

    if (decisionError || !decision) {
      return NextResponse.json({ error: 'Decision not found' }, { status: 404 })
    }

    const decisionAmount = decision.decision_amount
    const percent = decisionAmount ? (Number(amount) / Number(decisionAmount)) * 100 : null

    const { data, error } = await auth.ctx.supabase
      .from('allocations_by_date')
      .update({
        State: state,
        'Allocation Amount': Number(amount),
        '%_Decision_Amount': percent,
        sync_status: 'pending',
      })
      .eq('Allocation_ID', params.allocationId)
      .select()
      .single()

    if (error) throw error

    await refreshDecisionAllocationSum(auth.ctx.supabase, groupKey)

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error updating allocation:', error)
    return NextResponse.json({ error: 'Failed to update allocation' }, { status: 500 })
  }
}

// DELETE /api/distribution-decisions/allocations/[allocationId] - Delete a specific allocation
export async function DELETE(
  _request: Request,
  { params }: { params: { allocationId: string } }
) {
  const auth = await requireGrantEditor()
  if (!auth.ok) return auth.response

  try {
    const { data: allocationData, error: fetchError } = await auth.ctx.supabase
      .from('allocations_by_date')
      .select('Decision_ID')
      .eq('Allocation_ID', params.allocationId)
      .single()

    if (fetchError || !allocationData) {
      return NextResponse.json({ error: 'Allocation not found' }, { status: 404 })
    }

    const groupKey = allocationData.Decision_ID
    if (!groupKey) {
      return NextResponse.json({ error: 'Allocation has no linked decision' }, { status: 404 })
    }

    const { error } = await auth.ctx.supabase
      .from('allocations_by_date')
      .delete()
      .eq('Allocation_ID', params.allocationId)

    if (error) throw error

    await refreshDecisionAllocationSum(auth.ctx.supabase, groupKey)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting allocation:', error)
    return NextResponse.json({ error: 'Failed to delete allocation' }, { status: 500 })
  }
}
