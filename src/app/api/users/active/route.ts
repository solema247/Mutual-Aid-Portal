import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/requirePermission'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { getActiveUsers } from '@/app/api/users/utils/users'
import {
  findAuthUserIdsByEmailSearch,
  getEmailsByAuthUserIds,
} from '@/app/api/users/utils/authEmails'
import type { PortalRole } from '@/lib/userAccessRules'
import {
  getUserOrgScope,
  loadSessionOrgMemberUserIds,
  shouldScopeUsersToSessionOrg,
} from '@/lib/canvas/orgScope'

const PORTAL_ROLES = new Set([
  'support',
  'superadmin',
  'admin',
  'state_err',
  'base_err',
  'partner',
])

const STATUSES = new Set(['active', 'suspended'])

function parseCsv(param: string | null): string[] {
  if (!param) return []
  return param
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function parsePositiveInt(value: string | null, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.floor(n)
}

/**
 * GET /api/users/active
 * Server-side active-user list with optional email enrichment from auth.users.
 * Authorization mirrors the User Management page (users_view_permissions_page).
 */
export async function GET(request: Request) {
  const perm = await requirePermission('users_view_permissions_page')
  if (perm instanceof NextResponse) return perm

  const supabase = getSupabaseRouteClient()
  const { data: caller, error: callerError } = await supabase
    .from('users')
    .select('id, role, err_id')
    .eq('id', perm.user.id)
    .single()

  if (callerError || !caller) {
    return NextResponse.json({ error: 'Caller profile not found' }, { status: 404 })
  }

  const url = new URL(request.url)
  const page = parsePositiveInt(url.searchParams.get('page'), 1)
  const pageSizeRaw = parsePositiveInt(url.searchParams.get('pageSize'), 25)
  const pageSize = [25, 50, 100].includes(pageSizeRaw) ? pageSizeRaw : 25
  const search = url.searchParams.get('search')?.trim() || null

  const roles = parseCsv(url.searchParams.get('roles')).filter((r) =>
    PORTAL_ROLES.has(r)
  ) as Array<
    'support' | 'superadmin' | 'admin' | 'state_err' | 'base_err' | 'partner'
  >
  const statuses = parseCsv(url.searchParams.get('statuses')).filter((s) =>
    STATUSES.has(s)
  ) as Array<'active' | 'suspended'>
  const scopes = parseCsv(url.searchParams.get('scopes'))
  const stateFilters = parseCsv(url.searchParams.get('stateFilters'))
  const errIds = parseCsv(url.searchParams.get('errIds'))
  const partnerIds = parseCsv(url.searchParams.get('partnerIds'))

  let emailMatchedAuthIds: string[] = []
  if (search) {
    try {
      emailMatchedAuthIds = await findAuthUserIdsByEmailSearch(search)
    } catch (err) {
      console.error('Email search failed:', err)
      emailMatchedAuthIds = []
    }
  }

  try {
    const orgScope = await getUserOrgScope(supabase)
    const orgScoped = shouldScopeUsersToSessionOrg(orgScope, caller.role)
    const memberIds = orgScoped
      ? await loadSessionOrgMemberUserIds(supabase, orgScope)
      : null
    if (orgScoped && (!memberIds || memberIds.length === 0)) {
      return NextResponse.json({
        users: [],
        total: 0,
        page,
        pageSize,
        supportHidden: 0,
      })
    }

    const { users, total } = await getActiveUsers({
      page,
      pageSize,
      roles: roles.length > 0 ? roles : undefined,
      statuses: statuses.length > 0 ? statuses : undefined,
      status: 'all',
      sortOrder: 'desc',
      currentUserRole: caller.role,
      currentUserErrId: caller.err_id,
      stateFilters: stateFilters.length > 0 ? stateFilters : undefined,
      search,
      emailMatchedAuthIds,
      scopes: scopes.length > 0 ? scopes : undefined,
      errIds: errIds.length > 0 ? errIds : undefined,
      partnerIds: partnerIds.length > 0 ? partnerIds : undefined,
      userIds: memberIds ?? undefined,
      client: supabase,
    })

    const emailByAuthId = await getEmailsByAuthUserIds(
      users.map((u) => u.auth_user_id)
    )

    const callerRole = caller.role as string
    const visible = users.filter(
      (u) => callerRole === 'support' || u.role !== 'support'
    )
    const supportHidden =
      callerRole === 'support'
        ? 0
        : users.filter((u) => u.role === 'support').length

    const payload = visible.map((user) => {
      const authId = user.auth_user_id
      const email =
        authId && emailByAuthId.has(authId) ? emailByAuthId.get(authId)! : null
      return {
        id: user.id,
        err_id: user.err_id,
        ops_partner_id: user.ops_partner_id ?? null,
        display_name: user.display_name,
        email,
        role: user.role as PortalRole,
        status: user.status as 'active' | 'suspended',
        createdAt: user.created_at
          ? new Date(user.created_at).toLocaleDateString()
          : '',
        updatedAt: user.updated_at
          ? new Date(user.updated_at).toLocaleDateString()
          : null,
        err_name: user.emergency_rooms?.name || '-',
        err_code: user.emergency_rooms?.err_code || '-',
        state_name: user.emergency_rooms?.state?.state_name || '-',
        can_see_all_states: user.can_see_all_states ?? true,
        visible_states: user.visible_states || [],
      }
    })

    return NextResponse.json({
      users: payload,
      total: Math.max(0, total - supportHidden),
    })
  } catch (err) {
    console.error('GET /api/users/active error:', err)
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    )
  }
}
