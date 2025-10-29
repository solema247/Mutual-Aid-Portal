import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

// GET /api/cycles/[id] - Get specific funding cycle
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseRouteClient()
    const { data, error } = await supabase
      .from('funding_cycles')
      .select(`
        *,
        cycle_grant_inclusions (
          id,
          amount_included,
          grant_calls (
            id,
            name,
            shortname,
            amount,
            donor:donors (
              id,
              name,
              short_name
            )
          )
        ),
        cycle_state_allocations (
          id,
          state_name,
          amount,
          decision_no,
          created_at
        )
      `)
      .eq('id', params.id)
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching funding cycle:', error)
    return NextResponse.json({ error: 'Failed to fetch funding cycle' }, { status: 500 })
  }
}

// PUT /api/cycles/[id] - Update funding cycle
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseRouteClient()
    const body = await request.json()
    const { name, start_date, end_date, status, type, tranche_count, tranche_splits } = body

    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (start_date !== undefined) updateData.start_date = start_date
    if (end_date !== undefined) updateData.end_date = end_date
    if (status !== undefined) updateData.status = status
    if (type !== undefined) updateData.type = type
    if (tranche_count !== undefined) updateData.tranche_count = tranche_count
    if (tranche_splits !== undefined) updateData.tranche_splits = tranche_splits

    const { data, error } = await supabase
      .from('funding_cycles')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error updating funding cycle:', error)
    return NextResponse.json({ error: 'Failed to update funding cycle' }, { status: 500 })
  }
}

// DELETE /api/cycles/[id] - Delete funding cycle
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseRouteClient()
    // Check if cycle has any workplans or allocations
    const { data: workplans, error: workplansError } = await supabase
      .from('err_projects')
      .select('id')
      .eq('funding_cycle_id', params.id)
      .limit(1)

    if (workplansError) throw workplansError

    if (workplans && workplans.length > 0) {
      return NextResponse.json({ 
        error: 'Cannot delete cycle with existing workplans' 
      }, { status: 400 })
    }

    const { error } = await supabase
      .from('funding_cycles')
      .delete()
      .eq('id', params.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting funding cycle:', error)
    return NextResponse.json({ error: 'Failed to delete funding cycle' }, { status: 500 })
  }
}
