import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { clearUserOverrides } from '@/lib/userOverridesDb'
import {
  isPortalRole,
  roleAssignmentError,
  stateAccessEditError,
} from '@/lib/userAccessRules'

export async function PUT(
  request: Request,
  { params }: { params: { userId: string } }
) {
  try {
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
      .select('role')
      .eq('auth_user_id', session.user.id)
      .single()

    if (userError || !currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
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

    const { data: targetUser, error: targetUserError } = await supabase
      .from('users')
      .select('role, partner_id, status')
      .eq('id', params.userId)
      .single()

    if (targetUserError || !targetUser) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 })
    }

    if (targetUser.status === 'deleted') {
      return NextResponse.json({ error: 'User account has been deleted' }, { status: 410 })
    }

    const body = await request.json()
    const { role, can_see_all_states, visible_states, partner_id } = body

    if (role !== undefined && !isPortalRole(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    const roleChanging =
      role !== undefined && role !== (targetUser.role as string)

    if (role !== undefined) {
      const assignErr = roleAssignmentError(
        currentUser.role as string,
        role,
        targetUser.role as string
      )
      if (assignErr) {
        return NextResponse.json({ error: assignErr }, { status: 403 })
      }
    }

    const effectiveRole: string =
      role !== undefined ? role : (targetUser.role as string)

    if (can_see_all_states !== undefined || visible_states !== undefined) {
      const stateErr = stateAccessEditError(
        currentUser.role as string,
        effectiveRole
      )
      if (stateErr) {
        const status = stateErr.includes('Partner') ? 400 : 403
        return NextResponse.json({ error: stateErr }, { status })
      }
    }

    if (can_see_all_states !== undefined && typeof can_see_all_states !== 'boolean') {
      return NextResponse.json(
        { error: 'can_see_all_states must be a boolean' },
        { status: 400 }
      )
    }

    if (visible_states !== undefined && !Array.isArray(visible_states)) {
      return NextResponse.json(
        { error: 'visible_states must be an array' },
        { status: 400 }
      )
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (role !== undefined) {
      updateData.role = role
      if (role === 'partner') {
        const pid =
          partner_id != null && String(partner_id).trim() !== ''
            ? String(partner_id).trim()
            : null
        if (!pid) {
          return NextResponse.json(
            { error: 'partner_id is required for partner role' },
            { status: 400 }
          )
        }
        updateData.partner_id = pid
        updateData.can_see_all_states = false
        updateData.visible_states = []
        updateData.err_id = null
      } else {
        updateData.partner_id = null
      }
    } else if (partner_id !== undefined) {
      if (effectiveRole !== 'partner') {
        return NextResponse.json(
          { error: 'partner_id can only be set for partner role users' },
          { status: 400 }
        )
      }
      const pid =
        partner_id != null && String(partner_id).trim() !== ''
          ? String(partner_id).trim()
          : null
      if (!pid) {
        return NextResponse.json(
          { error: 'partner_id is required for partner role' },
          { status: 400 }
        )
      }
      updateData.partner_id = pid
    }

    if (
      effectiveRole === 'partner' &&
      (can_see_all_states !== undefined || visible_states !== undefined)
    ) {
      return NextResponse.json(
        { error: 'Partner users do not use state access controls' },
        { status: 400 }
      )
    }

    if (can_see_all_states !== undefined) {
      updateData.can_see_all_states = can_see_all_states
    }

    if (visible_states !== undefined) {
      updateData.visible_states = can_see_all_states === true ? [] : visible_states
    }

    if (typeof updateData.partner_id === 'string') {
      const { data: partnerRow, error: partnerErr } = await supabase
        .from('partners')
        .select('id, status')
        .eq('id', updateData.partner_id)
        .maybeSingle()
      if (partnerErr) throw partnerErr
      if (!partnerRow || partnerRow.status !== 'active') {
        return NextResponse.json(
          { error: 'Invalid or inactive partner organization' },
          { status: 400 }
        )
      }
    }

    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', params.userId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating user access rights:', updateError)
      return NextResponse.json(
        { error: 'Failed to update user access rights' },
        { status: 500 }
      )
    }

    // Role change: drop old overrides so effective perms become the new role defaults.
    if (roleChanging) {
      const { error: clearError } = await clearUserOverrides(supabase, params.userId)
      if (clearError) {
        console.error('Error clearing permission overrides after role change:', clearError)
        return NextResponse.json(
          {
            error:
              'Role updated but failed to clear previous permission overrides. Please clear them manually.',
            user: updatedUser,
          },
          { status: 500 }
        )
      }
    }

    return NextResponse.json(updatedUser)
  } catch (error) {
    console.error('Unexpected error in access-rights update:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
