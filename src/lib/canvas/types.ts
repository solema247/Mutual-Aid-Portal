export type OrgType = 'processor' | 'coordinator' | 'demo'

export type CanvasOrganization = {
  id: string
  slug: string
  name: string
  org_type: OrgType
}

export type CanvasEnvironment = {
  id: string
  slug: string
  display_name: string
  logo_url: string | null
  header_title: string | null
  organization_id: string
}

export type ResolvedCanvasContext = {
  organization: CanvasOrganization
  environment: CanvasEnvironment
  mounted_modules: string[]
  /** True when canvas tables are missing or membership cannot be resolved. */
  is_fallback: boolean
}

/**
 * Built-in mount codes matching the current err-portal nav.
 * Not tied to any organization — used only when the DB catalog is unavailable.
 */
export const FULL_PORTAL_MOUNT_CODES: readonly string[] = [
  'environment_home',
  'grant_decisions',
  'grant_grants',
  'grant_allocation',
  'f1_workplans',
  'f2_approvals',
  'f3_mous',
  'f4_f5_reporting',
  'report_tracker',
  'project_management',
  'dashboard',
  'learnings',
  'data_archive',
  'room_management',
  'state_management',
  'user_management',
  'audit_log',
  'compliance',
  'raise_ticket',
  'ticket_dashboard',
  'surveys',
] as const

export const CANVAS_MIRROR_SKIP_TABLES: ReadonlySet<string> = new Set([
  'organizations',
  'environments',
  'organization_memberships',
  'mount_catalog',
  'workflow_templates',
  'environment_mounts',
  'workflow_requests',
])

export const CANVAS_ADMIN_ROLES = new Set(['admin', 'superadmin', 'support'])

/** Platform support sees all mounts regardless of environment composition. */
export function roleBypassesMountGating(role: string | null | undefined): boolean {
  return role === 'support'
}
