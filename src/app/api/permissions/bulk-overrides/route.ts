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

export async function POST(request: Request) {
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

  let body: { user_ids?: string[]; add?: string[]; remove?: string[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const userIds = Array.isArray(body.user_ids) ? body.user_ids : []
  const add = Array.isArray(body.add) ? body.add : []
  const remove = Array.isArray(body.remove) ? body.remove : []

  if (userIds.length === 0) {
    return NextResponse.json({ error: 'Select at least one user' }, { status: 400 })
  }

  const errors: string[] = []
  const after = { add, remove }
  const endpoint = 'POST /api/permissions/bulk-overrides'
  const reset = isManualOverrideReset(add, remove)

  for (const userId of userIds) {
    const before = await getOverridesForUser(supabase, userId)
    const { error } = await saveOverrides(supabase, userId, add, remove)
    if (error) {
      errors.push(`${userId}: ${error.message}`)
      continue
    }

    if (reset) {
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
          metadata: { target_user_id: userId, reason: 'manual_reset', bulk: true },
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
          metadata: { target_user_id: userId, bulk: true },
        })
      }
    }
  }

  if (errors.length > 0) {
    return NextResponse.json(
      { error: 'Failed to save for some users', details: errors },
      { status: 500 }
    )
  }
  return NextResponse.json({ ok: true, count: userIds.length })
}
