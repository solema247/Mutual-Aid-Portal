/**
 * Shared portal user access / role-assignment rules used by
 * PUT /api/users/[userId]/access-rights and POST /api/users.
 */

export const PORTAL_ROLES = [
  'support',
  'superadmin',
  'admin',
  'state_err',
  'base_err',
  'partner',
] as const

export type PortalRole = (typeof PORTAL_ROLES)[number]

export const USER_STATUSES = ['active', 'suspended'] as const
export type UserStatus = (typeof USER_STATUSES)[number]

export function isPortalRole(role: unknown): role is PortalRole {
  return typeof role === 'string' && (PORTAL_ROLES as readonly string[]).includes(role)
}

export function isUserStatus(status: unknown): status is UserStatus {
  return typeof status === 'string' && (USER_STATUSES as readonly string[]).includes(status)
}

/** Roles the caller may assign when creating or changing a user. */
export function rolesAssignableBy(callerRole: string): PortalRole[] {
  switch (callerRole) {
    case 'support':
      return ['support', 'superadmin', 'admin', 'state_err', 'base_err', 'partner']
    case 'superadmin':
      return ['admin', 'state_err', 'base_err', 'partner']
    case 'admin':
      return ['state_err', 'base_err', 'partner']
    default:
      return []
  }
}

/**
 * Whether the caller may set `newRole` on a user whose current role is `previousRole`.
 * Returns an error message, or null if allowed.
 */
export function roleAssignmentError(
  callerRole: string,
  newRole: string,
  previousRole?: string | null
): string | null {
  if (!isPortalRole(newRole)) {
    return 'Invalid role'
  }

  const allowed = rolesAssignableBy(callerRole)
  if (!allowed.includes(newRole)) {
    return 'Forbidden - You cannot assign this role'
  }

  if (
    previousRole === 'superadmin' &&
    newRole !== 'superadmin' &&
    callerRole !== 'support'
  ) {
    return 'Only support can change superadmin role'
  }

  if (
    previousRole === 'admin' &&
    newRole !== 'admin' &&
    callerRole !== 'superadmin' &&
    callerRole !== 'support'
  ) {
    return 'Only superadmin or support can change admin role'
  }

  return null
}

/** Whether the caller may change status (suspend/activate) for a target role. */
export function statusChangeError(
  callerRole: string,
  targetRole: string
): string | null {
  if (targetRole === 'superadmin' && callerRole !== 'support') {
    return 'Only support can change status for superadmin users'
  }
  if (
    targetRole === 'admin' &&
    callerRole !== 'superadmin' &&
    callerRole !== 'support'
  ) {
    return 'Only superadmin or support can change status for admin users'
  }
  return null
}

/** Whether the caller may delete (soft-delete) a user with the given role. */
export function userDeleteError(
  callerRole: string,
  targetRole: string
): string | null {
  // Same authority matrix as status changes for destructive account removal.
  return statusChangeError(callerRole, targetRole)
}

/** Whether the caller may edit state access for a target with the given role. */
export function stateAccessEditError(
  callerRole: string,
  targetRole: string
): string | null {
  if (targetRole === 'partner') {
    return 'Partner users do not use state access controls'
  }
  if (targetRole === 'superadmin' && callerRole !== 'support') {
    return 'Only support can change state access for superadmin users'
  }
  if (
    targetRole === 'admin' &&
    callerRole !== 'superadmin' &&
    callerRole !== 'support'
  ) {
    return 'Only superadmin or support can change state access for admin users'
  }
  return null
}

export type NormalizedAccessFields = {
  role: PortalRole
  ops_partner_id: string | null
  err_id: string | null
  can_see_all_states: boolean
  visible_states: string[]
  status?: UserStatus
}

/**
 * Normalize create/update access fields for a chosen role.
 * Does not hit the database — callers must validate partner/state/ERR ids separately.
 */
export function normalizeAccessFieldsForRole(
  role: PortalRole,
  input: {
    ops_partner_id?: unknown
    err_id?: unknown
    can_see_all_states?: unknown
    visible_states?: unknown
    status?: unknown
  }
): { ok: true; data: NormalizedAccessFields } | { ok: false; error: string } {
  if (input.status !== undefined && !isUserStatus(input.status)) {
    return { ok: false, error: 'status must be active or suspended' }
  }

  if (role === 'partner') {
    const pid =
      input.ops_partner_id != null && String(input.ops_partner_id).trim() !== ''
        ? String(input.ops_partner_id).trim()
        : null
    if (!pid) {
      return { ok: false, error: 'ops_partner_id is required for partner role' }
    }
    if (
      input.can_see_all_states !== undefined ||
      input.visible_states !== undefined
    ) {
      return { ok: false, error: 'Partner users do not use state access controls' }
    }
    return {
      ok: true,
      data: {
        role,
        ops_partner_id: pid,
        err_id: null,
        can_see_all_states: false,
        visible_states: [],
        status: input.status as UserStatus | undefined,
      },
    }
  }

  if (input.ops_partner_id !== undefined && input.ops_partner_id != null && String(input.ops_partner_id).trim() !== '') {
    return { ok: false, error: 'ops_partner_id can only be set for partner role users' }
  }

  // Base ERR is room-scoped via err_id only. State in the form is a UI filter.
  if (role === 'base_err') {
    if (
      input.can_see_all_states !== undefined ||
      input.visible_states !== undefined
    ) {
      return {
        ok: false,
        error: 'base_err users do not use state access controls',
      }
    }
    const eid =
      input.err_id != null && String(input.err_id).trim() !== ''
        ? String(input.err_id).trim()
        : null
    if (!eid) {
      return { ok: false, error: 'err_id is required for base_err role' }
    }
    return {
      ok: true,
      data: {
        role,
        ops_partner_id: null,
        err_id: eid,
        can_see_all_states: false,
        visible_states: [],
        status: input.status as UserStatus | undefined,
      },
    }
  }

  let canSeeAll = true
  let visible: string[] = []

  if (role === 'state_err') {
    if (input.can_see_all_states !== undefined && typeof input.can_see_all_states !== 'boolean') {
      return { ok: false, error: 'can_see_all_states must be a boolean' }
    }
    if (input.visible_states !== undefined && !Array.isArray(input.visible_states)) {
      return { ok: false, error: 'visible_states must be an array' }
    }
    canSeeAll =
      input.can_see_all_states === undefined ? true : Boolean(input.can_see_all_states)
    if (canSeeAll) {
      visible = []
    } else {
      const raw = Array.isArray(input.visible_states) ? input.visible_states : []
      visible = raw.map((id) => String(id)).filter((id) => id.trim() !== '')
      if (visible.length === 0) {
        return {
          ok: false,
          error: 'Select at least one state, or enable All States',
        }
      }
    }
  } else if (
    input.can_see_all_states !== undefined ||
    input.visible_states !== undefined
  ) {
    if (input.can_see_all_states !== undefined && typeof input.can_see_all_states !== 'boolean') {
      return { ok: false, error: 'can_see_all_states must be a boolean' }
    }
    if (input.visible_states !== undefined && !Array.isArray(input.visible_states)) {
      return { ok: false, error: 'visible_states must be an array' }
    }
    canSeeAll =
      input.can_see_all_states === undefined ? true : Boolean(input.can_see_all_states)
    visible = canSeeAll
      ? []
      : (Array.isArray(input.visible_states) ? input.visible_states : [])
          .map((id) => String(id))
          .filter((id) => id.trim() !== '')
  }

  if (input.err_id != null && String(input.err_id).trim() !== '') {
    return { ok: false, error: 'err_id can only be set for base_err role' }
  }

  return {
    ok: true,
    data: {
      role,
      ops_partner_id: null,
      err_id: null,
      can_see_all_states: canSeeAll,
      visible_states: visible,
      status: input.status as UserStatus | undefined,
    },
  }
}
