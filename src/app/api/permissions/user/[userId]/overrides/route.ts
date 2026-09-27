import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { getOverridesForUser, saveOverrides } from '@/lib/userOverridesDb'
import {
  emitPermissionManagerAudit,
  isManualOverrideReset,
  overridesCount,
  overridesEqual,
  pickOverrideChanges,
} from '@/lib/permissionManagerAudit'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params
  const supabase = getSupabaseRouteClient()
  const {
    data: { session },
    error: sessionError
  } = await supabase.auth.getSession()
  if (sessionError || !session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: currentUser } = await supabase
    .from('users')
    .select('id, role')
    .eq('auth_user_id', session.user.id)
    .single()
  if (
    !currentUser ||
    (currentUser.role !== 'admin' &&
      currentUser.role !== 'superadmin' &&
      currentUser.role !== 'support')
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { add?: string[]; remove?: string[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const add = Array.isArray(body.add) ? body.add : []
  const remove = Array.isArray(body.remove) ? body.remove : []

  const before = await getOverridesForUser(supabase, userId)
  const after = { add, remove }

  const { error } = await saveOverrides(supabase, userId, add, remove)
  if (error) {
    console.error('Save overrides error:', error)
    return NextResponse.json({ error: 'Failed to save overrides' }, { status: 500 })
  }

  const endpoint = 'PUT /api/permissions/user/[userId]/overrides'

  if (isManualOverrideReset(add, remove)) {
    // Clear-to-default / empty override save → permissions_reset only (not permission_changed).
    if (overridesCount(before) > 0) {
      await emitPermissionManagerAudit({
        action: 'user.permissions_reset',
        actorUserId: currentUser.id,
        endpoint,
        request,
        targetType: 'user',
        targetId: userId,
        oldValues: {
          overrides_count: overridesCount(before),
          reason: 'manual_reset',
        },
        newValues: {
          overrides_cleared: true,
          reason: 'manual_reset',
        },
        metadata: { target_user_id: userId, reason: 'manual_reset' },
      })
    }
  } else if (!overridesEqual(before, after)) {
    const diff = pickOverrideChanges(before, after)
    if (diff) {
      await emitPermissionManagerAudit({
        action: 'user.permission_changed',
        actorUserId: currentUser.id,
        endpoint,
        request,
        targetType: 'user',
        targetId: userId,
        oldValues: diff.oldValues,
        newValues: diff.newValues,
        metadata: { target_user_id: userId },
      })
    }
  }

  return NextResponse.json({ ok: true })
}
