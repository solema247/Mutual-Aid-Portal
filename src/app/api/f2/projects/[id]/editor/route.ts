import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { requirePermission } from '@/lib/requirePermission'
import { assertProjectInGrantAccess } from '@/lib/userGrantAccess'
import { emitF123Audit } from '@/lib/f123Audit'

/**
 * PATCH /api/f2/projects/[id]/editor
 * Full F2 ProjectEditor content update (Uncommitted + Committed).
 * Does not touch funding/assignment/lifecycle fields.
 */

const EDITOR_ALLOWED_KEYS = [
  'date',
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
  'state',
  'locality',
] as const

type EditorKey = (typeof EDITOR_ALLOWED_KEYS)[number]

const EDITOR_SELECT = EDITOR_ALLOWED_KEYS.join(', ')

type RouteContext = { params: { id: string } }

function normalizeJsonField(value: unknown): unknown {
  if (value === undefined) return null
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  return value
}

function editorValuesEqual(a: unknown, b: unknown): boolean {
  const na = normalizeJsonField(a)
  const nb = normalizeJsonField(b)
  if (na === null && nb === null) return true
  if (typeof na === 'object' || typeof nb === 'object') {
    return JSON.stringify(na) === JSON.stringify(nb)
  }
  return na === nb
}

/** Audit payload for a field: redact banking; keep JSON content meaningful. */
function auditFieldValue(key: EditorKey, value: unknown): unknown {
  if (key === 'banking_details') {
    if (value == null || value === '') return null
    return '[PRESENT]'
  }
  if (key === 'expenses' || key === 'planned_activities') {
    return normalizeJsonField(value)
  }
  return value === undefined ? null : value
}

async function resolveRoomStateLocality(
  supabase: ReturnType<typeof getSupabaseRouteClient>,
  emergencyRoomId: string
): Promise<{ state: string | null; locality: string | null } | null> {
  const { data: roomData, error } = await supabase
    .from('emergency_rooms')
    .select(
      `
      state:states!emergency_rooms_state_reference_fkey(
        state_name,
        locality
      )
    `
    )
    .eq('id', emergencyRoomId)
    .single()

  if (error || !roomData?.state) return null

  const roomState = Array.isArray(roomData.state) ? roomData.state[0] : roomData.state
  if (!roomState || typeof roomState !== 'object' || !('state_name' in roomState)) {
    return null
  }

  const stateRow = roomState as { state_name?: string | null; locality?: string | null }
  return {
    state: stateRow.state_name ?? null,
    locality: stateRow.locality || null,
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const perm = await requirePermission('f2_edit_project')
    if (perm instanceof NextResponse) return perm

    const projectId = params.id
    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }

    const scope = await assertProjectInGrantAccess(projectId)
    if (!scope.ok) return scope.response

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const supabase = getSupabaseRouteClient()

    const { data: currentRow, error: fetchError } = await supabase
      .from('err_projects')
      .select(EDITOR_SELECT)
      .eq('id', projectId)
      .maybeSingle()

    if (fetchError) throw fetchError
    if (!currentRow) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const current = currentRow as unknown as Record<string, unknown>
    const updateData: Record<string, unknown> = {}

    for (const key of EDITOR_ALLOWED_KEYS) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        updateData[key] = body[key]
      }
    }

    // Room → state/locality sync (server authority; do not trust client when room is set)
    const roomId =
      typeof updateData.emergency_room_id === 'string' && updateData.emergency_room_id
        ? updateData.emergency_room_id
        : null

    if (roomId) {
      const synced = await resolveRoomStateLocality(supabase, roomId)
      if (synced) {
        updateData.state = synced.state
        updateData.locality = synced.locality
      }
    }

    // Diff: only keep keys that actually change
    const changedKeys: EditorKey[] = []
    const patch: Record<string, unknown> = {}
    for (const key of Object.keys(updateData) as EditorKey[]) {
      if (!EDITOR_ALLOWED_KEYS.includes(key)) continue
      if (!editorValuesEqual(current[key], updateData[key])) {
        changedKeys.push(key)
        patch[key] = updateData[key]
      }
    }

    if (changedKeys.length === 0) {
      return NextResponse.json({ success: true, unchanged: true })
    }

    const { error: updateError } = await supabase
      .from('err_projects')
      .update(patch)
      .eq('id', projectId)

    if (updateError) throw updateError

    const oldValues: Record<string, unknown> = {}
    const newValues: Record<string, unknown> = {}
    for (const key of changedKeys) {
      oldValues[key] = auditFieldValue(key, current[key])
      newValues[key] = auditFieldValue(key, patch[key])
    }

    await emitF123Audit({
      action: 'f2.project_edited',
      actorUserId: perm.user.id,
      endpoint: 'PATCH /api/f2/projects/[id]/editor',
      request,
      targetType: 'project',
      targetId: projectId,
      oldValues,
      newValues,
      metadata: { updated_fields: changedKeys },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating project via editor:', error)
    return NextResponse.json({ error: 'Failed to save project' }, { status: 500 })
  }
}
