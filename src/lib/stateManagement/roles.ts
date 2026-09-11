export const STATE_MANAGEMENT_ROLES = new Set(['support', 'admin', 'superadmin'])

export function isStateManagementRole (role: string | null | undefined): boolean {
  return !!role && STATE_MANAGEMENT_ROLES.has(role)
}
