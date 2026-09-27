import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

/**
 * Base ERR data scope: users.err_id → emergency_rooms.id only.
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

export function roomAccessCacheKey(roomAccess: UserRoomAccess): string {
  if (roomAccess.mode === 'room') return `base_err:${roomAccess.emergencyRoomId}`
  if (roomAccess.mode === 'none') return 'base_err:none'
  return 'base_err:n/a'
}

/** Apply `.eq('emergency_room_id', …)` for Base ERR room mode. */
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
  if (roomAccess.mode !== 'room') return true
  if (emergencyRoomId == null || String(emergencyRoomId).trim() === '') return false
  return String(emergencyRoomId) === roomAccess.emergencyRoomId
}
