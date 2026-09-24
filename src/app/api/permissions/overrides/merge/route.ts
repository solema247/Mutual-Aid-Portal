import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { getFunctionList } from '@/lib/permissions'
import { getOverridesForUser, saveOverrides } from '@/lib/userOverridesDb'
import {
  emitPermissionManagerAudit,
  overridesEqual,
  pickOverrideChanges,
} from '@/lib/permissionManagerAudit'

type Change = {
  userId: string
  /** Codes to add as exceptions (and remove from remove list). */
  grant?: string[]
  /** Codes to revoke as exceptions (and remove from add list). */
  revoke?: string[]
  /** Codes to clear from both add and remove (back to role default). */
  clear?: string[]
}

/**
 * Merge exception changes into existing override rows without wiping unrelated codes.
 */
export async function POST(request: Request) {
  const supabase = getSupabaseRouteClient()
  const {
    data: { session },
    error: sessionError,
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
    currentUser?.role !== 'admin' &&
    currentUser?.role !== 'superadmin' &&
    currentUser?.role !== 'support'
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { changes?: Change[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!Array.isArray(body.changes) || body.changes.length === 0) {
    return NextResponse.json({ error: 'changes must be a non-empty array' }, { status: 400 })
  }

  const validCodes = new Set(getFunctionList().map((f) => f.code))
  const results: { userId: string; ok: boolean; error?: string }[] = []
  const endpoint = 'POST /api/permissions/overrides/merge'

  for (const change of body.changes) {
    if (!change?.userId || typeof change.userId !== 'string') {
      results.push({ userId: String(change?.userId ?? ''), ok: false, error: 'Invalid userId' })
      continue
    }

    const grant = (change.grant ?? []).filter((c) => validCodes.has(c))
    const revoke = (change.revoke ?? []).filter((c) => validCodes.has(c))
    const clear = (change.clear ?? []).filter((c) => validCodes.has(c))

    const current = await getOverridesForUser(supabase, change.userId)
    const add = new Set(current.add)
    const remove = new Set(current.remove)

    for (const c of clear) {
      add.delete(c)
      remove.delete(c)
    }
    for (const c of grant) {
      remove.delete(c)
      add.add(c)
    }
    for (const c of revoke) {
      add.delete(c)
      remove.add(c)
    }

    const after = { add: Array.from(add), remove: Array.from(remove) }

    const { error } = await saveOverrides(
      supabase,
      change.userId,
      after.add,
      after.remove
    )
    if (error) {
      results.push({ userId: change.userId, ok: false, error: error.message })
    } else {
      results.push({ userId: change.userId, ok: true })
      // Merge is a permission edit (not the Permission Manager clear-to-default path).
      // One permission_changed event per successful user with only changed fields.
      if (currentUser && !overridesEqual(current, after)) {
        const diff = pickOverrideChanges(current, after)
        if (diff) {
          await emitPermissionManagerAudit({
            action: 'user.permission_changed',
            actorUserId: currentUser.id,
            endpoint,
            request,
            targetType: 'user',
            targetId: change.userId,
            oldValues: diff.oldValues,
            newValues: diff.newValues,
            metadata: { target_user_id: change.userId, merge: true },
          })
        }
      }
    }
  }

  const failed = results.filter((r) => !r.ok)
  if (failed.length > 0) {
    return NextResponse.json({ ok: false, results }, { status: 500 })
  }
  return NextResponse.json({ ok: true, results })
}
