import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/requirePermission'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { getPendingUsers } from '@/app/api/users/utils/users'
import {
  getUserOrgScope,
  loadSessionOrgMemberUserIds,
  shouldScopeUsersToSessionOrg,
} from '@/lib/canvas/orgScope'

/**
 * GET /api/users/pending
 * Pending users for User Management, scoped to session org membership.
 */
export async function GET() {
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

  try {
    const orgScope = await getUserOrgScope(supabase)
    const orgScoped = shouldScopeUsersToSessionOrg(orgScope, caller.role)
    const memberIds = orgScoped
      ? await loadSessionOrgMemberUserIds(supabase, orgScope)
      : null
    if (orgScoped && (!memberIds || memberIds.length === 0)) {
      return NextResponse.json({ users: [] })
    }

    const users = await getPendingUsers(caller.role, caller.err_id, {
      userIds: memberIds ?? undefined,
      client: supabase,
    })

    const callerRole = caller.role as string
    const visible = users.filter(
      (u) => callerRole === 'support' || u.role !== 'support'
    )

    return NextResponse.json({ users: visible })
  } catch (err) {
    console.error('GET /api/users/pending:', err)
    return NextResponse.json({ error: 'Failed to load pending users' }, { status: 500 })
  }
}
