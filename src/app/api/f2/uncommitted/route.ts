import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

// GET /api/f2/uncommitted - Get all uncommitted F1s
export async function GET() {
  try {
    const supabase = getSupabaseRouteClient()
    const { data, error } = await supabase
      .from('err_projects')
      .select(`
        id,
        err_id,
        date,
        state,
        locality,
        status,
        funding_status,
        expenses,
        grant_call_id,
        grant_calls (id, name, donors (name)),
        emergency_room_id,
        emergency_rooms (err_code, name_ar, name),
        submitted_at,
        approval_file_key,
        temp_file_key,
        grant_id
      `)
      .eq('status', 'pending')
      .order('submitted_at', { ascending: false })

    if (error) throw error

    const formattedF1s = (data || []).map((f1: any) => ({
      id: f1.id,
      err_id: f1.err_id,
      date: f1.date,
      state: f1.state,
      locality: f1.locality,
      status: f1.status,
      funding_status: f1.funding_status,
      expenses: typeof f1.expenses === 'string' ? JSON.parse(f1.expenses) : f1.expenses || [],
      grant_call_id: f1.grant_call_id,
      grant_call_name: f1.grant_calls?.name || null,
      donor_name: f1.grant_calls?.donors?.name || null,
      emergency_room_id: f1.emergency_room_id,
      err_code: f1.emergency_rooms?.err_code || null,
      err_name: f1.emergency_rooms?.name_ar || f1.emergency_rooms?.name || null,
      submitted_at: f1.submitted_at,
      approval_file_key: f1.approval_file_key || null,
      temp_file_key: f1.temp_file_key || null,
      grant_id: f1.grant_id || null
    }))

    return NextResponse.json(formattedF1s)
  } catch (error) {
    console.error('Error fetching uncommitted F1s:', error)
    return NextResponse.json({ error: 'Failed to fetch uncommitted F1s' }, { status: 500 })
  }
}

// PATCH /api/f2/uncommitted - Update F1 expenses, grant call, or metadata
export async function PATCH(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const { id, expenses, grant_call_id, approval_file_key, donor_id, funding_cycle_id, grant_serial_id, workplan_number, cycle_state_allocation_id } = await request.json()
    
    if (!id) {
      return NextResponse.json({ error: 'F1 ID is required' }, { status: 400 })
    }

    const updateData: any = {}
    if (expenses !== undefined) updateData.expenses = expenses
    if (grant_call_id !== undefined) updateData.grant_call_id = grant_call_id
    if (approval_file_key !== undefined) updateData.approval_file_key = approval_file_key
    if (donor_id !== undefined) updateData.donor_id = donor_id
    if (funding_cycle_id !== undefined) updateData.funding_cycle_id = funding_cycle_id
    if (grant_serial_id !== undefined) updateData.grant_serial_id = grant_serial_id
    if (workplan_number !== undefined) updateData.workplan_number = workplan_number
    if (cycle_state_allocation_id !== undefined) updateData.cycle_state_allocation_id = cycle_state_allocation_id

    const { error } = await supabase
      .from('err_projects')
      .update(updateData)
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating F1:', error)
    return NextResponse.json({ error: 'Failed to update F1' }, { status: 500 })
  }
}

// POST /api/f2/uncommitted/commit - Commit selected F1s
export async function POST(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const { f1_ids } = await request.json()
    
    if (!f1_ids || !Array.isArray(f1_ids) || f1_ids.length === 0) {
      return NextResponse.json({ error: 'F1 IDs array is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('err_projects')
      .update({ funding_status: 'committed' })
      .in('id', f1_ids)

    if (error) throw error

    return NextResponse.json({ 
      success: true, 
      committed_count: f1_ids.length 
    })
  } catch (error) {
    console.error('Error committing F1s:', error)
    return NextResponse.json({ error: 'Failed to commit F1s' }, { status: 500 })
  }
}

// DELETE /api/f2/uncommitted - Delete an F1 project
export async function DELETE(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const { id } = await request.json()
    
    if (!id) {
      return NextResponse.json({ error: 'F1 ID is required' }, { status: 400 })
    }

    // First, fetch the project to get file keys for cleanup
    const { data: project, error: fetchError } = await supabase
      .from('err_projects')
      .select('temp_file_key, approval_file_key, status, funding_status')
      .eq('id', id)
      .single()

    if (fetchError) throw fetchError

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Only allow deletion of uncommitted (pending status) projects
    if (project.status !== 'pending' || project.funding_status === 'committed') {
      return NextResponse.json({ 
        error: 'Cannot delete committed or non-pending projects' 
      }, { status: 400 })
    }

    // Delete files from storage if they exist
    const filesToDelete: string[] = []
    if (project.temp_file_key) filesToDelete.push(project.temp_file_key)
    if (project.approval_file_key) filesToDelete.push(project.approval_file_key)

    if (filesToDelete.length > 0) {
      const { error: deleteFilesError } = await supabase
        .storage
        .from('images')
        .remove(filesToDelete)

      // Log but don't fail if file deletion fails (file might not exist)
      if (deleteFilesError) {
        console.warn('Error deleting files from storage:', deleteFilesError)
      }
    }

    // Delete the project from database
    const { error: deleteError } = await supabase
      .from('err_projects')
      .delete()
      .eq('id', id)

    if (deleteError) throw deleteError

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting F1:', error)
    return NextResponse.json({ error: 'Failed to delete F1' }, { status: 500 })
  }
}