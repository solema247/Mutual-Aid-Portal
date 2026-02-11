import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { requirePermission } from '@/lib/requirePermission'

// PUT /api/cycles/[id]/allocations/[allocationId] - Update a specific allocation
export async function PUT(
  request: Request,
  { params }: { params: { id: string; allocationId: string } }
) {
  try {
    const auth = await requirePermission('grant_edit_state_allocation')
    if (auth instanceof NextResponse) return auth
    const supabase = getSupabaseRouteClient()
    const body = await request.json()
    const { amount } = body

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('cycle_state_allocations')
      .update({ amount })
      .eq('id', params.allocationId)
      .eq('cycle_id', params.id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error updating allocation:', error)
    return NextResponse.json({ error: 'Failed to update allocation' }, { status: 500 })
  }
}

// DELETE /api/cycles/[id]/allocations/[allocationId] - Delete a specific allocation
export async function DELETE(
  request: Request,
  { params }: { params: { id: string; allocationId: string } }
) {
  try {
    const auth = await requirePermission('grant_delete_state_allocation')
    if (auth instanceof NextResponse) return auth
    const supabase = getSupabaseRouteClient()
    // Check if allocation has any committed or pending projects
    const { data: projects, error: projectsError } = await supabase
      .from('err_projects')
      .select('id, status, funding_status')
      .eq('cycle_state_allocation_id', params.allocationId)

    if (projectsError) throw projectsError

    const hasCommittedProjects = projects.some(p => 
      p.status === 'approved' && p.funding_status === 'committed'
    )

    if (hasCommittedProjects) {
      return NextResponse.json({ 
        error: 'Cannot delete allocation with committed projects' 
      }, { status: 400 })
    }

    const { error } = await supabase
      .from('cycle_state_allocations')
      .delete()
      .eq('id', params.allocationId)
      .eq('cycle_id', params.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting allocation:', error)
    return NextResponse.json({ error: 'Failed to delete allocation' }, { status: 500 })
  }
}
