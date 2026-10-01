import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

const ALLOWED_ROLES = [
  'support',
  'superadmin',
  'admin',
  'state_err',
  'base_err',
  'partner',
] as const

type AllowedRole = (typeof ALLOWED_ROLES)[number]

function isAllowedRole(role: unknown): role is AllowedRole {
  return typeof role === 'string' && (ALLOWED_ROLES as readonly string[]).includes(role)
}

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
      .select('role, ops_partner_id')
      .eq('id', params.userId)
      .single()

    if (targetUserError || !targetUser) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 })
    }

    const body = await request.json()
    const { role, can_see_all_states, visible_states, ops_partner_id } = body

    if (role !== undefined && !isAllowedRole(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    if (
      targetUser.role === 'superadmin' &&
      role &&
      role !== 'superadmin' &&
      currentUser.role !== 'support'
    ) {
      return NextResponse.json(
        { error: 'Only support can change superadmin role' },
        { status: 403 }
      )
    }
    if (role === 'superadmin' && currentUser.role !== 'support') {
      return NextResponse.json(
        { error: 'Only support can assign superadmin role' },
        { status: 403 }
      )
    }

    if (
      role === 'admin' &&
      currentUser.role !== 'superadmin' &&
      currentUser.role !== 'support'
    ) {
      return NextResponse.json(
        { error: 'Only superadmin or support can set admin role' },
        { status: 403 }
      )
    }

    if (
      targetUser.role === 'admin' &&
      role &&
      role !== 'admin' &&
      currentUser.role !== 'superadmin' &&
      currentUser.role !== 'support'
    ) {
      return NextResponse.json(
        { error: 'Only superadmin or support can change admin role' },
        { status: 403 }
      )
    }

    if (
      targetUser.role === 'superadmin' &&
      (can_see_all_states !== undefined || visible_states !== undefined) &&
      currentUser.role !== 'support'
    ) {
      return NextResponse.json(
        { error: 'Only support can change state access for superadmin users' },
        { status: 403 }
      )
    }
    if (
      targetUser.role === 'admin' &&
      (can_see_all_states !== undefined || visible_states !== undefined) &&
      currentUser.role !== 'superadmin' &&
      currentUser.role !== 'support'
    ) {
      return NextResponse.json(
        { error: 'Only superadmin or support can change state access for admin users' },
        { status: 403 }
      )
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

    const effectiveRole: string =
      role !== undefined ? role : (targetUser.role as string)

    if (role !== undefined) {
      updateData.role = role
      if (role === 'partner') {
        const pid =
          ops_partner_id != null && String(ops_partner_id).trim() !== ''
            ? String(ops_partner_id).trim()
            : null
        if (!pid) {
          return NextResponse.json(
            { error: 'ops_partner_id is required for partner role' },
            { status: 400 }
          )
        }
        updateData.ops_partner_id = pid
        // Partner is org-scoped, not state-scoped
        updateData.can_see_all_states = false
        updateData.visible_states = []
      } else {
        updateData.ops_partner_id = null
      }
    } else if (ops_partner_id !== undefined) {
      if (effectiveRole !== 'partner') {
        return NextResponse.json(
          { error: 'ops_partner_id can only be set for partner role users' },
          { status: 400 }
        )
      }
      const pid =
        ops_partner_id != null && String(ops_partner_id).trim() !== ''
          ? String(ops_partner_id).trim()
          : null
      if (!pid) {
        return NextResponse.json(
          { error: 'ops_partner_id is required for partner role' },
          { status: 400 }
        )
      }
      updateData.ops_partner_id = pid
    }

    // Reject state-access updates for partner users (org-scoped only)
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
      updateData.visible_states = visible_states
    }

    // Validate ops partner exists when setting ops_partner_id
    if (typeof updateData.ops_partner_id === 'string') {
      const { data: opsPartnerRow, error: opsPartnerErr } = await supabase
        .from('ops_partners')
        .select('id, is_active')
        .eq('id', updateData.ops_partner_id)
        .maybeSingle()
      if (opsPartnerErr) throw opsPartnerErr
      if (!opsPartnerRow || opsPartnerRow.is_active !== true) {
        return NextResponse.json(
          { error: 'Invalid or inactive ops partner' },
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

    return NextResponse.json(updatedUser)
  } catch (error) {
    console.error('Unexpected error in access-rights update:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
