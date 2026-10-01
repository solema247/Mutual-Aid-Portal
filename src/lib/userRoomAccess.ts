import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

/**
 * Base ERR data scope: users.err_id → emergency_rooms.id only.
 * Never expand via state / visible_states / can_see_all_states.
 *
 * Partner grant scope is separate (userGrantAccess) — do not use this for Partner.
 */
export type UserRoomAccess =
  | { applies: true; mode: 'room'; emergencyRoomId: string }
  | { applies: true; mode: 'none'; emergencyRoomId: null }
  | { applies: false; mode: 'n/a'; emergencyRoomId: null }

const N_A: UserRoomAccess = {
  applies: false,
  mode: 'n/a',
  emergencyRoomId: null,
}

const NONE: UserRoomAccess = {
  applies: true,
  mode: 'none',
  emergencyRoomId: null,
}

/**
 * Resolve Base ERR room scope for the current session.
 * Non-base_err → mode 'n/a' (callers keep Partner / state / all logic).
 * base_err without err_id → mode 'none' (fail closed).
 */
export async function getUserRoomAccess(): Promise<UserRoomAccess> {
  const supabase = getSupabaseRouteClient()

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()

  if (sessionError || !session) {
    return NONE
  }

  const { data: userData, error } = await supabase
    .from('users')
    .select('role, err_id')
    .eq('auth_user_id', session.user.id)
    .single()

  if (error || !userData) {
    return NONE
  }

  if (userData.role !== 'base_err') {
    return N_A
  }

  const roomId =
    userData.err_id != null && String(userData.err_id).trim() !== ''
      ? String(userData.err_id).trim()
      : null

  if (!roomId) {
    return NONE
  }

  return {
    applies: true,
    mode: 'room',
    emergencyRoomId: roomId,
  }
}

/** Cache-key segment so Base ERR never shares global/state cache entries. */
export function roomAccessCacheKey(roomAccess: UserRoomAccess): string {
  if (roomAccess.mode === 'room') return `base_err:${roomAccess.emergencyRoomId}`
  if (roomAccess.mode === 'none') return 'base_err:none'
  return 'n/a'
}

/**
 * Apply `.eq('emergency_room_id', …)` for Base ERR room mode.
 * mode 'none' / 'n/a': returns query unchanged — caller must short-circuit on 'none'.
 */
export function applyEmergencyRoomIdFilter<
  T extends { eq: (column: string, value: string) => T },
>(query: T, roomAccess: UserRoomAccess, column: string = 'emergency_room_id'): T {
  if (roomAccess.mode !== 'room') return query
  return query.eq(column, roomAccess.emergencyRoomId)
}

export function isProjectInRoomAccess(
  roomAccess: UserRoomAccess,
  emergencyRoomId: string | null | undefined
): boolean {
  if (roomAccess.mode === 'n/a') return true
  if (roomAccess.mode === 'none') return false
  if (emergencyRoomId == null || String(emergencyRoomId).trim() === '') return false
  return String(emergencyRoomId) === roomAccess.emergencyRoomId
}

/**
 * Assert a portal project belongs to the Base ERR room (when room scope applies).
 * Returns null when room scope does not apply (caller continues with grant/state logic).
 * Historical IDs are out of Base ERR room scope.
 */
export async function assertProjectInRoomAccess(
  projectId: string,
  roomAccess?: UserRoomAccess,
  options?: { notFoundMessage?: string }
): Promise<
  | { handled: false }
  | {
      handled: true
      ok: true
      roomAccess: Extract<UserRoomAccess, { mode: 'room' }>
      project: { id: string; emergency_room_id: string | null; grant_grid_id: string | null }
    }
  | { handled: true; ok: false; response: NextResponse }
> {
  const access = roomAccess ?? (await getUserRoomAccess())
  const notFoundMessage = options?.notFoundMessage ?? 'Project not found'

  if (!access.applies) {
    return { handled: false }
  }

  if (access.mode === 'none') {
    return {
      handled: true,
      ok: false,
      response: NextResponse.json({ error: notFoundMessage }, { status: 404 }),
    }
  }

  if (projectId.startsWith('historical_')) {
    return {
      handled: true,
      ok: false,
      response: NextResponse.json({ error: notFoundMessage }, { status: 404 }),
    }
  }

  const supabase = getSupabaseRouteClient()
  const { data: project, error } = await supabase
    .from('err_projects')
    .select('id, emergency_room_id, grant_grid_id')
    .eq('id', projectId)
    .maybeSingle()

  if (error) {
    console.error('[assertProjectInRoomAccess]', error)
    return {
      handled: true,
      ok: false,
      response: NextResponse.json({ error: 'Failed to load project' }, { status: 500 }),
    }
  }

  if (!project || !isProjectInRoomAccess(access, project.emergency_room_id)) {
    return {
      handled: true,
      ok: false,
      response: NextResponse.json({ error: notFoundMessage }, { status: 404 }),
    }
  }

  return {
    handled: true,
    ok: true,
    roomAccess: access,
    project: {
      id: String(project.id),
      emergency_room_id: project.emergency_room_id ?? null,
      grant_grid_id: project.grant_grid_id ?? null,
    },
  }
}

/** Load portal project ids for a single emergency room (paginated). */
export async function fetchProjectIdsForEmergencyRoom(
  emergencyRoomId: string
): Promise<string[]> {
  const supabase = getSupabaseRouteClient()
  const ids: string[] = []
  const pageSize = 1000
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('err_projects')
      .select('id')
      .eq('emergency_room_id', emergencyRoomId)
      .range(from, from + pageSize - 1)

    if (error) {
      console.error('[fetchProjectIdsForEmergencyRoom]', error)
      return []
    }
    if (!data?.length) break
    for (const row of data) {
      if (row.id) ids.push(String(row.id))
    }
    if (data.length < pageSize) break
    from += pageSize
  }

  return ids
}

/**
 * MOU ids that have at least one project in the given emergency room.
 */
export async function fetchMouIdsForEmergencyRoom(
  emergencyRoomId: string
): Promise<string[]> {
  const supabase = getSupabaseRouteClient()
  const mouIds = new Set<string>()
  const pageSize = 1000
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('err_projects')
      .select('mou_id')
      .eq('emergency_room_id', emergencyRoomId)
      .not('mou_id', 'is', null)
      .range(from, from + pageSize - 1)

    if (error) {
      console.error('[fetchMouIdsForEmergencyRoom]', error)
      return []
    }
    if (!data?.length) break
    for (const row of data) {
      if (row.mou_id) mouIds.add(String(row.mou_id))
    }
    if (data.length < pageSize) break
    from += pageSize
  }

  return Array.from(mouIds)
}

/**
 * Grant grid ids that have at least one project in the given emergency room.
 */
export async function fetchGrantGridIdsForEmergencyRoom(
  emergencyRoomId: string
): Promise<string[]> {
  const supabase = getSupabaseRouteClient()
  const gridIds = new Set<string>()
  const pageSize = 1000
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('err_projects')
      .select('grant_grid_id')
      .eq('emergency_room_id', emergencyRoomId)
      .not('grant_grid_id', 'is', null)
      .range(from, from + pageSize - 1)

    if (error) {
      console.error('[fetchGrantGridIdsForEmergencyRoom]', error)
      return []
    }
    if (!data?.length) break
    for (const row of data) {
      if (row.grant_grid_id) gridIds.add(String(row.grant_grid_id))
    }
    if (data.length < pageSize) break
    from += pageSize
  }

  return Array.from(gridIds)
}
