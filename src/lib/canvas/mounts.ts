/** Nav item → mount code. Home (`/err-portal`) is always shown. */
export const NAV_MOUNT_BY_KEY: Record<string, string> = {
  grant_decisions: 'grant_decisions',
  grant_grants: 'grant_grants',
  grant_allocation: 'grant_allocation',
  f1: 'f1_workplans',
  f2: 'f2_approvals',
  f3: 'f3_mous',
  f4_f5: 'f4_f5_reporting',
  report_tracker: 'report_tracker',
  project_management: 'project_management',
  dashboard: 'dashboard',
  learnings: 'learnings',
  data_archive: 'data_archive',
  rooms: 'room_management',
  states: 'state_management',
  users: 'user_management',
  audit_log: 'audit_log',
  compliance: 'compliance',
  raise_ticket: 'raise_ticket',
  ticket_dashboard: 'ticket_dashboard',
  surveys: 'surveys',
  environment: 'environment_home',
}

export function isModuleMounted(
  mountedModules: string[] | null | undefined,
  mountCode: string
): boolean {
  // Unknown / not yet loaded: fail closed (avoid flashing unmounted modules).
  if (mountedModules == null) return false
  // Explicit empty list = thin environment (only what is listed — usually environment_home)
  return mountedModules.includes(mountCode)
}

/** True when the env has no operational pipeline mounts (catalog / thin home). */
export function isThinEnvironment(mountedModules: string[]): boolean {
  const operational = mountedModules.filter((c) => c !== 'environment_home')
  return operational.length === 0
}
