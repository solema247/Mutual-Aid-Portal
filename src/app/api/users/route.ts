import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/requirePermission'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import {
  isPortalRole,
  normalizeAccessFieldsForRole,
  roleAssignmentError,
  type PortalRole,
} from '@/lib/userAccessRules'
import { emitUserManagementAudits } from '@/lib/userManagementAudit'
import {
  getUserOrgScope,
  sessionOrganizationId,
} from '@/lib/canvas/orgScope'

function generateTemporaryPassword(): string {
  // URL-safe, high entropy; not stored in public.users
  return randomBytes(24).toString('base64url')
}

export async function POST(request: Request) {
  const perm = await requirePermission('users_create')
  if (perm instanceof NextResponse) {
    // Distinguish missing users_create from other permission denials.
    if (perm.status === 403) {
      return NextResponse.json(
        {
          error: 'You do not have permission to create users',
          code: 'USERS_CREATE_REQUIRED',
        },
        { status: 403 }
      )
    }
    return perm
  }

  const callerRole = perm.user.role
  if (
    callerRole !== 'admin' &&
    callerRole !== 'superadmin' &&
    callerRole !== 'support'
  ) {
    return NextResponse.json(
      {
        error: 'Your role is not allowed to create users',
        code: 'ROLE_NOT_ALLOWED_TO_CREATE',
      },
      { status: 403 }
    )
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const email =
    typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const displayName =
    typeof body.display_name === 'string' ? body.display_name.trim() : ''
  const role = body.role

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
  }
  if (!displayName) {
    return NextResponse.json({ error: 'display_name is required' }, { status: 400 })
  }
  if (!isPortalRole(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const assignErr = roleAssignmentError(callerRole, role)
  if (assignErr) {
    return NextResponse.json({ error: assignErr }, { status: 403 })
  }

  const normalized = normalizeAccessFieldsForRole(role as PortalRole, {
    ops_partner_id: body.ops_partner_id,
    err_id: body.err_id,
    can_see_all_states: body.can_see_all_states,
    visible_states: body.visible_states,
    status: body.status ?? 'active',
  })
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error }, { status: 400 })
  }

  const access = normalized.data
  const status = access.status ?? 'active'

  const routeClient = getSupabaseRouteClient()

  if (access.ops_partner_id) {
    const { data: partnerRow, error: partnerErr } = await routeClient
      .from('ops_partners')
      .select('id, is_active')
      .eq('id', access.ops_partner_id)
      .maybeSingle()
    if (partnerErr) {
      console.error('POST /api/users ops_partner lookup:', partnerErr)
      return NextResponse.json({ error: 'Failed to validate ops partner' }, { status: 500 })
    }
    if (!partnerRow || partnerRow.is_active !== true) {
      return NextResponse.json(
        { error: 'Invalid or inactive ops partner' },
        { status: 400 }
      )
    }
  }

  if (access.err_id) {
    const { data: room, error: roomErr } = await routeClient
      .from('emergency_rooms')
      .select('id')
      .eq('id', access.err_id)
      .maybeSingle()
    if (roomErr) {
      console.error('POST /api/users ERR lookup:', roomErr)
      return NextResponse.json({ error: 'Failed to validate ERR' }, { status: 500 })
    }
    if (!room) {
      return NextResponse.json({ error: 'Invalid err_id' }, { status: 400 })
    }
  }

  if (!access.can_see_all_states && access.visible_states.length > 0) {
    const { data: states, error: statesErr } = await routeClient
      .from('states')
      .select('id')
      .in('id', access.visible_states)
    if (statesErr) {
      console.error('POST /api/users states lookup:', statesErr)
      return NextResponse.json({ error: 'Failed to validate states' }, { status: 500 })
    }
    const found = new Set((states || []).map((s) => s.id))
    if (access.visible_states.some((id) => !found.has(id))) {
      return NextResponse.json(
        { error: 'One or more selected states are invalid' },
        { status: 400 }
      )
    }
  }

  const temporaryPassword = generateTemporaryPassword()
  let admin
  try {
    admin = getSupabaseAdmin()
  } catch (e) {
    console.error('POST /api/users admin client:', e)
    return NextResponse.json(
      { error: 'Server is not configured for user creation' },
      { status: 500 }
    )
  }

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      display_name: displayName,
      is_temporary_password: true,
      has_changed_password: false,
    },
  })

  if (authError || !authData.user) {
    console.error('POST /api/users auth create:', authError)
    const message = authError?.message || 'Failed to create auth user'
    const statusCode = /already|registered|exists/i.test(message) ? 409 : 500
    return NextResponse.json({ error: message }, { status: statusCode })
  }

  const authUserId = authData.user.id

  const { data: userRow, error: insertError } = await admin
    .from('users')
    .insert({
      auth_user_id: authUserId,
      display_name: displayName,
      role: access.role,
      status,
      ops_partner_id: access.ops_partner_id,
      err_id: access.err_id,
      can_see_all_states: access.can_see_all_states,
      visible_states: access.visible_states,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select(
      'id, auth_user_id, display_name, role, status, err_id, ops_partner_id, can_see_all_states, visible_states, created_at, updated_at'
    )
    .single()

  if (insertError || !userRow) {
    console.error('POST /api/users profile insert:', insertError)
    const { error: deleteError } = await admin.auth.admin.deleteUser(authUserId)
    if (deleteError) {
      console.error('POST /api/users auth rollback failed:', deleteError)
    }
    return NextResponse.json(
      { error: insertError?.message || 'Failed to create user profile' },
      { status: 500 }
    )
  }

  // Attach new user to the caller's canvas organization (tenant scope)
  const orgScope = await getUserOrgScope(routeClient)
  const orgId = sessionOrganizationId(orgScope)
  if (orgId) {
    const { data: env } = await admin
      .from('environments')
      .select('id')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (env?.id) {
      const { error: memErr } = await admin.from('organization_memberships').upsert(
        {
          user_id: userRow.id,
          organization_id: orgId,
          environment_id: env.id,
          is_default: true,
        },
        { onConflict: 'user_id,environment_id' }
      )
      if (memErr) {
        console.error('POST /api/users membership attach:', memErr)
      }
    }
  }

  await emitUserManagementAudits({
    actorUserId: perm.user.id,
    targetUserId: userRow.id,
    endpoint: 'POST /api/users',
    request,
    events: [
      {
        action: 'user.created',
        newValues: {
          display_name: userRow.display_name,
          role: userRow.role,
          status: userRow.status,
          ops_partner_id: userRow.ops_partner_id,
          err_id: userRow.err_id,
          can_see_all_states: userRow.can_see_all_states,
          visible_states: userRow.visible_states,
        },
      },
    ],
  })

  return NextResponse.json(
    {
      user: userRow,
      temporary_password: temporaryPassword,
    },
    { status: 201 }
  )
}
