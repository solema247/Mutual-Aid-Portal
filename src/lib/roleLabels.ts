import { isPortalRole, type PortalRole } from '@/lib/userAccessRules'

type TranslateFn = (
  key: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  opts?: any
) => string

const ROLE_I18N_KEYS: Record<PortalRole, string> = {
  support: 'users:support_role',
  superadmin: 'users:superadmin_role',
  admin: 'users:admin_role',
  state_err: 'users:state_err_role',
  base_err: 'users:base_err_role',
  partner: 'users:partner_role',
}

/** Short display labels (not the old Coordination Committee / Beneficiary Entity names). */
const ROLE_LABEL_FALLBACKS: Record<PortalRole, string> = {
  support: 'Support',
  superadmin: 'Superadmin',
  admin: 'Admin',
  state_err: 'State ERR',
  base_err: 'Base ERR',
  partner: 'Partner',
}

/**
 * Map an internal portal role key to a short localized display label.
 * DB values stay unchanged (`state_err`, etc.).
 */
export function getPortalRoleLabel(
  role: string | null | undefined,
  t: TranslateFn
): string {
  if (!role) return ''
  if (!isPortalRole(role)) return role
  return t(ROLE_I18N_KEYS[role], {
    defaultValue: ROLE_LABEL_FALLBACKS[role],
  })
}
