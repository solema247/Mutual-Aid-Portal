/**
 * Some mounts are role-of-org specific (not just “who may click Mount”).
 * - oversight: coordinators only (request disclosure from host orgs)
 * - access_inbox: host orgs only (approve/deny requests)
 * DB org_type for hosts remains `processor` (and `demo` shells).
 */
export function mountAllowedForOrgType(
  mountCode: string,
  orgType: string | null | undefined
): boolean {
  if (mountCode === 'oversight') {
    return orgType === 'coordinator'
  }
  if (mountCode === 'access_inbox') {
    return orgType === 'processor' || orgType === 'demo'
  }
  return true
}

export function filterMountCodesForOrgType(
  codes: string[],
  orgType: string | null | undefined
): string[] {
  return codes.filter((code) => mountAllowedForOrgType(code, orgType))
}
