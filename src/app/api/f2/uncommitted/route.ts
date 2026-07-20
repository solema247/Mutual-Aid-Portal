import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { getUserStateAccess } from '@/lib/userStateAccess'
import { requirePermission } from '@/lib/requirePermission'
import { getComplianceBlockedProjectIds } from '@/lib/compliance'

// GET /api/f2/uncommitted - Get all uncommitted F1s (optional: state, month_year_from, month_year_to as YYYY-MM)
export async function GET(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const { searchParams } = new URL(request.url)
    const state = searchParams.get('state')
    const monthYearFrom = searchParams.get('month_year_from')
    const monthYearTo = searchParams.get('month_year_to')
    let dateFrom: string | null = null
    let dateTo: string | null = null
    if (monthYearFrom && /^\d{4}-\d{2}$/.test(monthYearFrom)) {
      const [y, m] = monthYearFrom.split('-').map(Number)
      dateFrom = `${y}-${String(m).padStart(2, '0')}-01`
    }
    if (monthYearTo && /^\d{4}-\d{2}$/.test(monthYearTo)) {
      const [y, m] = monthYearTo.split('-').map(Number)
      const lastDay = new Date(y, m, 0).getDate()
      dateTo = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    }

    // Get user's state access rights
    const { allowedStateNames } = await getUserStateAccess()

    let query = supabase
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
        grant_id,
        grant_segment
      `)
      .eq('status', 'pending')
      .order('submitted_at', { ascending: false })

    // Apply state filter from user access rights (if not seeing all states)
    if (allowedStateNames !== null && allowedStateNames.length > 0) {
      query = query.in('state', allowedStateNames)
    }

    // Apply explicit state filter if provided
    if (state) {
      query = query.eq('state', state)
    }
    if (dateFrom) {
      query = query.gte('date', dateFrom)
    }
    if (dateTo) {
      query = query.lte('date', dateTo)
    }

    const { data, error } = await query

    if (error) throw error

    // Attach compliance screening status so the UI can badge/block flagged F1s
    const complianceByProject = new Map<
      string,
      { status: string; finance_review_status: string | null; flag_type: string | null }
    >()
    const projectIds = (data || []).map((f1) => f1.id as string)
    for (let i = 0; i < projectIds.length; i += 200) {
      const chunk = projectIds.slice(i, i + 200)
      const { data: screenings, error: screeningsError } = await supabase
        .from('compliance_screenings')
        .select('project_id, status, finance_review_status, flag_type')
        .in('project_id', chunk)
      if (screeningsError) {
        console.error('Error fetching compliance screenings:', screeningsError)
        break
      }
      for (const s of screenings || []) {
        complianceByProject.set(s.project_id, {
          status: s.status,
          finance_review_status: s.finance_review_status,
          flag_type: s.flag_type || null
        })
      }
    }

    const isBlocked = (c: { status: string; finance_review_status: string | null; flag_type: string | null } | undefined) => {
      if (!c || c.status !== 'flagged') return false
      if (c.finance_review_status === 'rejected') return false
      if (c.flag_type === 'sanctions_match') return true
      if (c.flag_type === 'missing_id') return c.finance_review_status !== 'approved'
      return c.finance_review_status !== 'approved'
    }

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
      grant_id: f1.grant_id || null,
      grant_segment: f1.grant_segment || null,
      compliance_status: complianceByProject.get(f1.id)?.status || null,
      compliance_flag_type: complianceByProject.get(f1.id)?.flag_type || null,
      compliance_blocked: isBlocked(complianceByProject.get(f1.id))
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
    const body = await request.json()
    const { id, expenses, grant_call_id, approval_file_key, donor_id, funding_cycle_id, grant_serial_id, workplan_number, cycle_state_allocation_id, grant_id, file_key } = body

    if (!id) {
      return NextResponse.json({ error: 'F1 ID is required' }, { status: 400 })
    }

    // Require f2_upload_approval when updating approval_file_key
    if (approval_file_key !== undefined) {
      const perm = await requirePermission('f2_upload_approval')
      if (perm instanceof NextResponse) return perm
    }
    // Require f2_edit_project when updating expenses or other project fields
    const isEditUpdate = expenses !== undefined || grant_call_id !== undefined || donor_id !== undefined ||
      funding_cycle_id !== undefined || grant_serial_id !== undefined || workplan_number !== undefined ||
      cycle_state_allocation_id !== undefined || grant_id !== undefined || file_key !== undefined
    if (isEditUpdate) {
      const perm = await requirePermission('f2_edit_project')
      if (perm instanceof NextResponse) return perm
    }

    const supabase = getSupabaseRouteClient()
    const updateData: any = {}
    if (expenses !== undefined) updateData.expenses = expenses
    if (grant_call_id !== undefined) updateData.grant_call_id = grant_call_id
    if (approval_file_key !== undefined) updateData.approval_file_key = approval_file_key
    if (donor_id !== undefined) updateData.donor_id = donor_id
    if (funding_cycle_id !== undefined) updateData.funding_cycle_id = funding_cycle_id
    if (grant_serial_id !== undefined) updateData.grant_serial_id = grant_serial_id
    if (workplan_number !== undefined) updateData.workplan_number = workplan_number
    if (cycle_state_allocation_id !== undefined) updateData.cycle_state_allocation_id = cycle_state_allocation_id
    if (grant_id !== undefined) updateData.grant_id = grant_id
    if (file_key !== undefined) updateData.file_key = file_key

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

    // Compliance gate: flagged F1s need finance approval before commit
    const blocked = await getComplianceBlockedProjectIds(supabase, f1_ids)
    if (blocked.length > 0) {
      return NextResponse.json(
        {
          error: 'Some F1s are flagged by compliance screening and pending finance review. They cannot be committed.',
          code: 'COMPLIANCE_BLOCKED',
          blocked_ids: blocked
        },
        { status: 400 }
      )
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
    const perm = await requirePermission('f2_commit')
    if (perm instanceof NextResponse) return perm

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