import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

const ALLOWED_PATCH_FIELDS = new Set([
  'date',
  'state',
  'locality',
  'project_objectives',
  'intended_beneficiaries',
  'estimated_beneficiaries',
  'estimated_timeframe',
  'additional_support',
  'banking_details',
  'program_officer_name',
  'program_officer_phone',
  'reporting_officer_name',
  'reporting_officer_phone',
  'finance_officer_name',
  'finance_officer_phone',
  'planned_activities',
  'expenses',
  'emergency_room_id',
  'project_name',
  'Sector (Primary)',
  'Sector (Secondary)',
])

/**
 * PATCH /api/projects/[id]
 * Update editable err_projects fields (paired write when enabled).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const supabase = getSupabaseRouteClient()
    const resolved = await Promise.resolve(params)
    const projectId = resolved.id

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }
    if (projectId.startsWith('historical_')) {
      return NextResponse.json(
        { error: 'Cannot update historical projects.' },
        { status: 400 }
      )
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const patch: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (ALLOWED_PATCH_FIELDS.has(key)) patch[key] = value
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 })
    }

    const { data: project, error: fetchError } = await supabase
      .from('err_projects')
      .select('id')
      .eq('id', projectId)
      .maybeSingle()

    if (fetchError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (patch.emergency_room_id) {
      const { data: room, error: roomErr } = await supabase
        .from('emergency_rooms')
        .select(
          `
          id,
          state:states!emergency_rooms_state_reference_fkey(
            state_name,
            locality
          )
        `
        )
        .eq('id', patch.emergency_room_id)
        .maybeSingle()

      if (roomErr || !room) {
        return NextResponse.json({ error: 'Emergency room not found' }, { status: 400 })
      }

      const roomState = Array.isArray(room.state) ? room.state[0] : room.state
      if (roomState && typeof roomState === 'object' && 'state_name' in roomState) {
        patch.state = (roomState as { state_name?: string }).state_name ?? patch.state
        if (patch.locality === undefined) {
          patch.locality =
            (roomState as { locality?: string | null }).locality ?? null
        }
      }
    }

    const { error: updateError } = await supabase
      .from('err_projects')
      .update(patch)
      .eq('id', projectId)

    if (updateError) {
      console.error('PATCH /api/projects/[id]:', updateError)
      return NextResponse.json(
        { error: updateError.message || 'Failed to update project' },
        { status: updateError.code === '23503' || updateError.code === '23514' ? 400 : 500 }
      )
    }

    return NextResponse.json({ success: true, id: projectId })
  } catch (e) {
    console.error('PATCH /api/projects/[id]:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/projects/[id]
 * Hard-delete a pending uncommitted F1 (paired). Prefer /api/f2/uncommitted DELETE from F2 UI.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const supabase = getSupabaseRouteClient()
    const resolved = await Promise.resolve(params)
    const projectId = resolved.id

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: project, error: fetchError } = await supabase
      .from('err_projects')
      .select('id, temp_file_key, approval_file_key, status, funding_status')
      .eq('id', projectId)
      .maybeSingle()

    if (fetchError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (project.status !== 'pending' || project.funding_status === 'committed') {
      return NextResponse.json(
        { error: 'Cannot delete committed or non-pending projects' },
        { status: 400 }
      )
    }

    const filesToDelete: string[] = []
    if (project.temp_file_key) filesToDelete.push(project.temp_file_key)
    if (project.approval_file_key) filesToDelete.push(project.approval_file_key)
    if (filesToDelete.length > 0) {
      const { error: deleteFilesError } = await supabase.storage
        .from('images')
        .remove(filesToDelete)
      if (deleteFilesError) {
        console.warn('Error deleting files from storage:', deleteFilesError)
      }
    }

    await supabase.from('compliance_screenings').delete().eq('project_id', projectId)

    const { error: deleteError } = await supabase
      .from('err_projects')
      .delete()
      .eq('id', projectId)

    if (deleteError) {
      console.error('DELETE /api/projects/[id]:', deleteError)
      return NextResponse.json(
        { error: deleteError.message || 'Failed to delete project' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('DELETE /api/projects/[id]:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
