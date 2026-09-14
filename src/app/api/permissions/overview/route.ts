import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import {
  getFunctionList,
  getFunctionsByModule,
  getRoleBase,
  hasExceptionOverrides,
  rolesVisibleToViewer,
} from '@/lib/permissions'
import { getOverridesMap } from '@/lib/userOverridesDb'
import {
  EDITABLE_ROLE_DEFAULTS,
  ensureRoleDefaultsSeeded,
  getJsonRoleDefaults,
  mergeRoleDefaultsMaps,
} from '@/lib/roleDefaultsDb'

const FULL_ACCESS_ROLES = new Set(['superadmin', 'support'])

export async function GET() {
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

  const visibleRoles = new Set(rolesVisibleToViewer(currentUser.role))

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select(`
      id,
      display_name,
      role,
      emergency_rooms(
        name,
        state:states!emergency_rooms_state_reference_fkey(
          state_name
        )
      )
    `)
    .eq('status', 'active')
    .order('display_name', { ascending: true })
    .limit(500)

  if (usersError) {
    console.error('permissions overview users error:', usersError)
    return NextResponse.json({ error: 'Failed to load users' }, { status: 500 })
  }

  const list = (users ?? []).filter((u) => visibleRoles.has(u.role))

  const overridesMap = await getOverridesMap(
    supabase,
    list.map((u) => u.id)
  )
  const dbDefaults = await ensureRoleDefaultsSeeded(supabase)
  const roleDefaultsMap = mergeRoleDefaultsMaps(getJsonRoleDefaults(), dbDefaults)

  function errInfoFromUser(u: (typeof list)[number]): {
    err_name: string | null
    state_name: string | null
  } {
    const er = u.emergency_rooms as
      | {
          name?: string | null
          state?: { state_name?: string } | { state_name?: string }[] | null
        }
      | {
          name?: string | null
          state?: { state_name?: string } | { state_name?: string }[] | null
        }[]
      | null
      | undefined
    if (!er) return { err_name: null, state_name: null }
    const room = Array.isArray(er) ? er[0] : er
    if (!room) return { err_name: null, state_name: null }
    const state = room.state
    const s = Array.isArray(state) ? state[0] : state
    return {
      err_name: room.name ?? null,
      state_name: s?.state_name ?? null,
    }
  }

  const roleCounts: Record<string, number> = {}
  for (const role of visibleRoles) {
    roleCounts[role] = 0
  }
  const usersPayload = list.map((u) => {
    roleCounts[u.role] = (roleCounts[u.role] ?? 0) + 1
    const ov = overridesMap[u.id] ?? { add: [], remove: [] }
    const { err_name, state_name } = errInfoFromUser(u)
    return {
      id: u.id,
      display_name: u.display_name,
      role: u.role,
      err_name,
      state_name,
      overrides: { add: ov.add, remove: ov.remove },
      hasExceptions: hasExceptionOverrides(ov),
      roleBase: getRoleBase(u.role, roleDefaultsMap),
    }
  })

  const editableDefaults: Record<string, string[]> = {}
  const editableRoles = EDITABLE_ROLE_DEFAULTS.filter((role) => visibleRoles.has(role))
  for (const role of editableRoles) {
    editableDefaults[role] = roleDefaultsMap[role] ?? []
  }

  return NextResponse.json({
    users: usersPayload,
    roleCounts,
    roleDefaults: editableDefaults,
    fullAccessRoles: Array.from(FULL_ACCESS_ROLES),
    editableRoles,
    visibleRoles: rolesVisibleToViewer(currentUser.role),
    viewerRole: currentUser.role,
    functions: getFunctionList(),
    functionsByModule: getFunctionsByModule(),
  })
}
