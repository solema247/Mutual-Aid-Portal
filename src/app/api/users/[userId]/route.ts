import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { clearUserOverrides } from '@/lib/userOverridesDb'
import {
  isPortalRole,
  isUserStatus,
  roleAssignmentError,
  statusChangeError,
  userDeleteError,
} from '@/lib/userAccessRules'
import {
  emitUserManagementAudits,
  pickChangedAuditFields,
  USER_SCOPE_AUDIT_KEYS,
  type UserManagementAuditEvent,
} from '@/lib/userManagementAudit'
import {
  getUserOrgScope,
  isUserInSessionOrg,
  shouldScopeUsersToSessionOrg,
} from '@/lib/canvas/orgScope'

type CallerUser = { id: string; role: string }

async function requireAdminCaller(): Promise<
  { supabase: ReturnType<typeof getSupabaseRouteClient>; caller: CallerUser } | NextResponse
> {
  const supabase = getSupabaseRouteClient()
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: currentUser, error: userError } = await supabase
    .from('users')
    .select('id, role, status')
    .eq('auth_user_id', session.user.id)
    .single()

  if (userError || !currentUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (currentUser.status !== 'active') {
    return NextResponse.json({ error: 'Account is not active' }, { status: 403 })
  }

  if (
    currentUser.role !== 'admin' &&
    currentUser.role !== 'superadmin' &&
    currentUser.role !== 'support'
  ) {
    return NextResponse.json(
      { error: 'Forbidden - Admin, Superadmin or Support only' },
      { status: 403 }
    )
  }

  return {
    supabase,
    caller: { id: currentUser.id, role: currentUser.role as string },
  }
}

/**
 * PATCH /api/users/[userId]
 * Edit User fields only: display_name, role, status.
 * Does not accept ops_partner_id / err_id / state access / permission overrides.
 */
export async function PATCH(
  request: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const auth = await requireAdminCaller()
    if (auth instanceof NextResponse) return auth
    const { supabase, caller } = auth

    const userId = params.userId
    if (!userId) {
      return NextResponse.json({ error: 'User id is required' }, { status: 400 })
    }

    const orgScope = await getUserOrgScope(supabase)
    if (
      shouldScopeUsersToSessionOrg(orgScope, caller.role) &&
      !(await isUserInSessionOrg(supabase, orgScope, userId))
    ) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 })
    }

    const { data: targetUser, error: targetError } = await supabase
      .from('users')
      .select(
        'id, display_name, role, status, ops_partner_id, err_id, auth_user_id, can_see_all_states, visible_states'
      )
      .eq('id', userId)
      .single()

    if (targetError || !targetUser) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 })
    }

    if (targetUser.status === 'deleted') {
      return NextResponse.json({ error: 'User account has been deleted' }, { status: 410 })
    }

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    // Reject scope / permission fields â€” those belong to Access Rights.
    const forbiddenKeys = [
      'partner_id',
      'ops_partner_id',
      'err_id',
      'can_see_all_states',
      'visible_states',
      'add_functions',
      'remove_functions',
      'overrides',
    ]
    for (const key of forbiddenKeys) {
      if (key in body) {
        return NextResponse.json(
          {
            error: `${key} cannot be changed via Edit User. Use Access Rights instead.`,
          },
          { status: 400 }
        )
      }
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    let roleChanging = false
    let hasChanges = false

    if (body.display_name !== undefined) {
      if (typeof body.display_name !== 'string' || !body.display_name.trim()) {
        return NextResponse.json(
          { error: 'display_name is required' },
          { status: 400 }
        )
      }
      const nextName = body.display_name.trim()
      if (nextName !== (targetUser.display_name || '')) {
        updateData.display_name = nextName
        hasChanges = true
      }
    }

    if (body.role !== undefined) {
      if (!isPortalRole(body.role)) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
      }
      const newRole = body.role
      if (newRole !== targetUser.role) {
        if (userId === caller.id) {
          return NextResponse.json(
            { error: 'You cannot change your own role' },
            { status: 403 }
          )
        }
        const assignErr = roleAssignmentError(
          caller.role,
          newRole,
          targetUser.role as string
        )
        if (assignErr) {
          return NextResponse.json({ error: assignErr }, { status: 403 })
        }

        // Partner role requires an existing partner org (set via Access Rights / Add User).
        if (newRole === 'partner' && !targetUser.ops_partner_id) {
          return NextResponse.json(
            {
              error:
                'Assign an ops partner in Access Rights before setting the partner role',
            },
            { status: 400 }
          )
        }

        // Base ERR requires an existing room assignment (Access Rights / Add User).
        if (newRole === 'base_err' && !targetUser.err_id) {
          return NextResponse.json(
            {
              error:
                'Assign an ERR / room in Access Rights before setting the base_err role',
            },
            { status: 400 }
          )
        }

        updateData.role = newRole
        roleChanging = true
        hasChanges = true

        // Match established access-rights role-change side effects for partner only.
        if (newRole === 'partner') {
          updateData.ops_partner_id = targetUser.ops_partner_id
          updateData.can_see_all_states = false
          updateData.visible_states = []
          updateData.err_id = null
        } else {
          updateData.ops_partner_id = null
        }
      }
    }

    if (body.status !== undefined) {
      if (!isUserStatus(body.status)) {
        return NextResponse.json(
          { error: 'status must be active or suspended' },
          { status: 400 }
        )
      }
      if (body.status !== targetUser.status) {
        if (userId === caller.id) {
          return NextResponse.json(
            { error: 'You cannot change your own status' },
            { status: 403 }
          )
        }
        const statusErr = statusChangeError(caller.role, targetUser.role as string)
        if (statusErr) {
          return NextResponse.json({ error: statusErr }, { status: 403 })
        }
        updateData.status = body.status
        hasChanges = true
      }
    }

    if (!hasChanges) {
      return NextResponse.json(targetUser)
    }

    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId)
      .select(
        'id, display_name, role, status, err_id, ops_partner_id, can_see_all_states, visible_states, updated_at, auth_user_id'
      )
      .single()

    if (updateError) {
      console.error('PATCH /api/users/[userId] update:', updateError)
      return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
    }

    const before = targetUser as Record<string, unknown>
    const after = updatedUser as Record<string, unknown>
    const events: UserManagementAuditEvent[] = []

    const general = pickChangedAuditFields(before, after, ['display_name'])
    if (general) {
      events.push({
        action: 'user.updated',
        oldValues: general.oldValues,
        newValues: general.newValues,
      })
    }

    const roleDiff = pickChangedAuditFields(before, after, ['role'])
    if (roleDiff) {
      events.push({
        action: 'user.role_changed',
        oldValues: roleDiff.oldValues,
        newValues: roleDiff.newValues,
      })
    }

    const statusDiff = pickChangedAuditFields(before, after, ['status'])
    if (statusDiff) {
      events.push({
        action: 'user.status_changed',
        oldValues: statusDiff.oldValues,
        newValues: statusDiff.newValues,
      })
    }

    const scopeDiff = pickChangedAuditFields(before, after, USER_SCOPE_AUDIT_KEYS)
    if (scopeDiff) {
      events.push({
        action: 'user.scope_changed',
        oldValues: scopeDiff.oldValues,
        newValues: scopeDiff.newValues,
      })
    }

    let overridesCleared = false
    if (roleChanging) {
      const { error: clearError } = await clearUserOverrides(supabase, userId)
      if (clearError) {
        console.error('Error clearing overrides after role change:', clearError)
        if (events.length > 0) {
          await emitUserManagementAudits({
            actorUserId: caller.id,
            targetUserId: userId,
            endpoint: 'PATCH /api/users/[userId]',
            request,
            events,
          })
        }
        return NextResponse.json(
          {
            error:
              'Role updated but failed to clear previous permission overrides. Please clear them manually.',
            user: updatedUser,
          },
          { status: 500 }
        )
      }
      overridesCleared = true
    }

    if (overridesCleared) {
      events.push({
        action: 'user.permissions_reset',
        oldValues: { reason: 'role_changed' },
        newValues: { overrides_cleared: true },
        metadata: { reason: 'role_changed' },
      })
    }

    if (events.length > 0) {
      await emitUserManagementAudits({
        actorUserId: caller.id,
        targetUserId: userId,
        endpoint: 'PATCH /api/users/[userId]',
        request,
        events,
      })
    }

    return NextResponse.json({ user: updatedUser, role_changed: roleChanging })
  } catch (error) {
    console.error('Unexpected error in PATCH /api/users/[userId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/users/[userId]
 *
 * Soft-delete strategy (hard delete is unsafe):
 * Many tables reference public.users via created_by / updated_by / reviewed_by /
 * flagged_by / cleared_by / addressed_by FKs. Hard-deleting the row would break
 * historical records or fail FK checks.
 *
 * Safe behavior:
 * - Set status = 'deleted' (excluded from user lists)
 * - Clear permission overrides
 * - Remove/ban auth.users login and null auth_user_id
 * - Keep public.users row so historical FKs remain valid
 * - Do not change ops_partner_id / err_id / state scope fields (preserves audit context)
 */
export async function DELETE(
  request: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const auth = await requireAdminCaller()
    if (auth instanceof NextResponse) return auth
    const { supabase, caller } = auth

    const userId = params.userId
    if (!userId) {
      return NextResponse.json({ error: 'User id is required' }, { status: 400 })
    }

    if (userId === caller.id) {
      return NextResponse.json(
        { error: 'You cannot delete your own account' },
        { status: 403 }
      )
    }

    const orgScope = await getUserOrgScope(supabase)
    if (
      shouldScopeUsersToSessionOrg(orgScope, caller.role) &&
      !(await isUserInSessionOrg(supabase, orgScope, userId))
    ) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 })
    }

    const { data: targetUser, error: targetError } = await supabase
      .from('users')
      .select('id, role, status, auth_user_id, display_name')
      .eq('id', userId)
      .single()

    if (targetError || !targetUser) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 })
    }

    if (targetUser.status === 'deleted') {
      return NextResponse.json({ error: 'User is already deleted' }, { status: 410 })
    }

    const deleteErr = userDeleteError(caller.role, targetUser.role as string)
    if (deleteErr) {
      return NextResponse.json({ error: deleteErr }, { status: 403 })
    }

    const authUserId = targetUser.auth_user_id as string | null

    const { error: updateError } = await supabase
      .from('users')
      .update({
        status: 'deleted',
        auth_user_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

    if (updateError) {
      console.error('DELETE /api/users/[userId] soft-delete:', updateError)
      // Likely a status check constraint that does not allow 'deleted'
      return NextResponse.json(
        {
          error:
            updateError.message?.includes('check') ||
            updateError.code === '23514'
              ? 'Database status constraint does not allow deleted. Run sql/add_deleted_status_to_users.sql then retry.'
              : 'Failed to delete user account',
          details: updateError.message,
        },
        { status: 500 }
      )
    }

    const { error: clearError } = await clearUserOverrides(supabase, userId)
    if (clearError) {
      console.error('Error clearing overrides after delete:', clearError)
    }

    if (authUserId) {
      try {
        const admin = getSupabaseAdmin()
        const { error: authDeleteError } = await admin.auth.admin.deleteUser(authUserId)
        if (authDeleteError) {
          console.error('Failed to remove auth user after soft-delete:', authDeleteError)
          // Profile is already soft-deleted; login is blocked without auth_user_id.
        }
      } catch (e) {
        console.error('Admin client unavailable during soft-delete auth cleanup:', e)
      }
    }

    await emitUserManagementAudits({
      actorUserId: caller.id,
      targetUserId: userId,
      endpoint: 'DELETE /api/users/[userId]',
      request,
      events: [
        {
          action: 'user.deleted',
          oldValues: {
            display_name: targetUser.display_name,
            role: targetUser.role,
            status: targetUser.status,
          },
          newValues: {
            status: 'deleted',
          },
          metadata: { strategy: 'soft_delete' },
        },
      ],
    })

    return NextResponse.json({
      ok: true,
      strategy: 'soft_delete',
      message:
        'User account deactivated. Historical records that reference this user were preserved.',
    })
  } catch (error) {
    console.error('Unexpected error in DELETE /api/users/[userId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
