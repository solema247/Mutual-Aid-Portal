import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { requirePermission } from '@/lib/requirePermission'

// PUT /api/distribution-decisions/allocations/[allocationId] - Update a specific allocation
export async function PUT(
  request: Request,
  { params }: { params: { allocationId: string } }
) {
  try {
    const auth = await requirePermission('grant_edit_allocation')
    if (auth instanceof NextResponse) return auth
    const supabase = getSupabaseRouteClient()
    const body = await request.json()
    const { state, amount } = body

    if (!state || !amount || Number(amount) <= 0) {
      return NextResponse.json({ error: 'State and valid amount are required' }, { status: 400 })
    }

    // Get decision info to recalculate percent
    const { data: allocationData, error: fetchError } = await supabase
      .from('allocations_by_date')
      .select('Decision_ID')
      .eq('Allocation_ID', params.allocationId)
      .single()

    if (fetchError || !allocationData) {
      return NextResponse.json({ error: 'Allocation not found' }, { status: 404 })
    }

    const decisionId = allocationData.Decision_ID

    const { data: decision, error: decisionError } = await supabase
      .from('distribution_decision_master_sheet_1')
      .select('decision_amount')
      .eq('decision_id', decisionId)
      .single()

    if (decisionError || !decision) {
      return NextResponse.json({ error: 'Decision not found' }, { status: 404 })
    }

    const decisionAmount = decision.decision_amount
    const percent = decisionAmount ? (Number(amount) / Number(decisionAmount)) * 100 : null

    const { data, error } = await supabase
      .from('allocations_by_date')
      .update({ 
        'State': state,
        'Allocation Amount': Number(amount),
        '%_Decision_Amount': percent
      })
      .eq('Allocation_ID', params.allocationId)
      .select()
      .single()

    if (error) throw error

    // Recalculate sum in master sheet
    const { data: sumRows, error: sumError } = await supabase
      .from('allocations_by_date')
      .select('"Allocation Amount"')
      .eq('Decision_ID', decisionId)

    if (sumError) throw sumError

    const totalAllocated = (sumRows || []).reduce((sum, row: any) => {
      const amt = row?.['Allocation Amount']
      return sum + (amt ? Number(amt) : 0)
    }, 0)

    const { error: updateError } = await supabase
      .from('distribution_decision_master_sheet_1')
      .update({ sum_allocation_amount: totalAllocated })
      .eq('decision_id', decisionId)

    if (updateError) throw updateError

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error updating allocation:', error)
    return NextResponse.json({ error: 'Failed to update allocation' }, { status: 500 })
  }
}

// DELETE /api/distribution-decisions/allocations/[allocationId] - Delete a specific allocation
export async function DELETE(
  request: Request,
  { params }: { params: { allocationId: string } }
) {
  try {
    const auth = await requirePermission('grant_delete_allocation')
    if (auth instanceof NextResponse) return auth
    const supabase = getSupabaseRouteClient()

    // Get decision ID before deleting
    const { data: allocationData, error: fetchError } = await supabase
      .from('allocations_by_date')
      .select('Decision_ID')
      .eq('Allocation_ID', params.allocationId)
      .single()

    if (fetchError || !allocationData) {
      return NextResponse.json({ error: 'Allocation not found' }, { status: 404 })
    }

    const decisionId = allocationData.Decision_ID

    const { error } = await supabase
      .from('allocations_by_date')
      .delete()
      .eq('Allocation_ID', params.allocationId)

    if (error) throw error

    // Recalculate sum in master sheet
    const { data: sumRows, error: sumError } = await supabase
      .from('allocations_by_date')
      .select('"Allocation Amount"')
      .eq('Decision_ID', decisionId)

    if (sumError) throw sumError

    const totalAllocated = (sumRows || []).reduce((sum, row: any) => {
      const amt = row?.['Allocation Amount']
      return sum + (amt ? Number(amt) : 0)
    }, 0)

    const { error: updateError } = await supabase
      .from('distribution_decision_master_sheet_1')
      .update({ sum_allocation_amount: totalAllocated })
      .eq('decision_id', decisionId)

    if (updateError) throw updateError

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting allocation:', error)
    return NextResponse.json({ error: 'Failed to delete allocation' }, { status: 500 })
  }
}

