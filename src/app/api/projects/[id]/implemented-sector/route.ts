import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { assertProjectInGrantAccess } from '@/lib/userGrantAccess'
import { emitF123Audit } from '@/lib/f123Audit'

/**
 * PATCH /api/projects/[id]/implemented-sector
 * Body: { implemented_sector: string | null, activity_shift_note?: string | null }
 * Updates implemented sector + optional note without touching F1 planned_activities/expenses.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabaseRouteClient()
    const { id: projectId } = await params
    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }
    if (projectId.startsWith('historical_')) {
      return NextResponse.json(
        { error: 'Cannot update implemented sector for historical projects.' },
        { status: 400 }
      )
    }

    const scope = await assertProjectInGrantAccess(projectId)
    if (!scope.ok) return scope.response

    const body = await request.json().catch(() => ({}))
    const rawSector = body.implemented_sector
    const implementedSector =
      rawSector === undefined || rawSector === null || String(rawSector).trim() === ''
        ? null
        : String(rawSector).trim()

    const noteProvided = Object.prototype.hasOwnProperty.call(body, 'activity_shift_note')
    const activityShiftNote = noteProvided
      ? body.activity_shift_note == null || String(body.activity_shift_note).trim() === ''
        ? null
        : String(body.activity_shift_note).trim()
      : undefined

    const { data: project, error: fetchError } = await supabase
      .from('err_projects')
      .select('id, implemented_sector, activity_shift_note')
      .eq('id', projectId)
      .single()

    if (fetchError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const patch: Record<string, unknown> = {
      implemented_sector: implementedSector,
      activity_shift_updated_at: new Date().toISOString(),
      activity_shift_updated_by: user?.id ?? null,
    }
    if (noteProvided) {
      patch.activity_shift_note = activityShiftNote
    }

    const { error: updateError } = await supabase
      .from('err_projects')
      .update(patch)
      .eq('id', projectId)

    if (updateError) {
      console.error('Error updating implemented sector:', updateError)
      return NextResponse.json({ error: 'Failed to update implemented sector' }, { status: 500 })
    }

    await emitF123Audit({
      action: 'project.implemented_sector_changed',
      endpoint: 'PATCH /api/projects/[id]/implemented-sector',
      request,
      targetType: 'project',
      targetId: projectId,
      oldValues: {
        implemented_sector: project.implemented_sector ?? null,
        ...(noteProvided
          ? { activity_shift_note: project.activity_shift_note ?? null }
          : {}),
      },
      newValues: {
        implemented_sector: implementedSector,
        ...(noteProvided ? { activity_shift_note: activityShiftNote ?? null } : {}),
      },
      metadata: {
        project_id: projectId,
      },
    })

    return NextResponse.json({
      success: true,
      implemented_sector: implementedSector,
      activity_shift_note: noteProvided ? activityShiftNote : undefined,
    })
  } catch (e) {
    console.error('PATCH /api/projects/[id]/implemented-sector:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
