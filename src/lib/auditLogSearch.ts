/**
 * Audit Log list search — term classification and PostgREST OR predicate building.
 * Server-only (used by GET /api/audit-logs).
 */

import { isPortalRole } from '@/lib/userAccessRules'

export type AuditSearchKind = 'uuid' | 'numeric' | 'email' | 'action_like' | 'general'

/** Common audit/business tokens — never trigger Auth email scan without `@`. */
export const AUDIT_NON_EMAIL_SEARCH_TERMS = new Set([
  'report',
  'payment',
  'project',
  'user',
  'admin',
  'permission',
  'permissions',
  'mou',
  'grant',
  'partner',
  'role',
  'status',
  'scope',
  'serial',
  'activity',
  'audit',
  'endpoint',
  'system',
  'created',
  'updated',
  'deleted',
  'confirmation',
  'workplan',
  'f1',
  'f2',
  'f3',
  'f4',
  'f5',
])

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isAuditSearchUuid(value: string): boolean {
  return UUID_RE.test(value)
}

/** Strip PostgREST / ILIKE metachar risk from user input (general search). Removes `_` (SQL single-char wildcard). */
export function escapeAuditSearchTerm(raw: string): string {
  return raw.replace(/[%_,]/g, '')
}

/**
 * PostgREST-safe fragment for audit action identifiers — keeps `.` and `_`.
 * Used only for action_like searches (e.g. f4.report_created).
 */
export function escapeAuditActionSearchTerm(raw: string): string {
  return raw.replace(/[%,]/g, '')
}

export function parseAuditSearchTerm(raw: string): {
  trimmed: string
  escaped: string
  kind: AuditSearchKind
} {
  const trimmed = raw.trim()
  const classifyEsc = escapeAuditSearchTerm(trimmed)
  const kind = classifyAuditSearchTerm(trimmed, classifyEsc)
  const escaped =
    kind === 'action_like' ? escapeAuditActionSearchTerm(trimmed) : classifyEsc
  return {
    trimmed,
    escaped,
    kind,
  }
}

/**
 * Conservative partial-email detection (Auth scan) without treating all 3+ char text as email.
 * Full email, local-part (hamza), hamza@, @example.com; excludes grant codes like LCC.
 */
export function isEmailLikeAuditSearch(trimmed: string, escaped: string): boolean {
  if (!escaped) return false
  if (trimmed.includes('@')) return true
  if (AUDIT_NON_EMAIL_SEARCH_TERMS.has(escaped.toLowerCase())) return false
  if (isGrantBusinessIdentifierToken(escaped)) return false
  if (isActionLikeAuditSearchTerm(escaped)) return false
  if (/^\d+$/.test(escaped)) return false
  if (!/^[a-z0-9._+-]{2,64}$/i.test(escaped)) return false
  if (!/[a-zA-Z]/.test(escaped)) return false
  // Short all-caps tokens (LCC, KF) are grant/business codes, not email local-parts.
  if (/^[A-Z]{2,4}$/.test(escaped)) return false
  // Local-part without `@` must be a single token (no dots).
  if (escaped.includes('.')) return false
  return true
}

/** Grant serial / business id token (e.g. LCC, LCC-KF-CB-0626-0009) — not email-like. */
export function isGrantBusinessIdentifierToken(escaped: string): boolean {
  if (/^[A-Z]{2,4}$/.test(escaped)) return true
  if (escaped.includes('-') && /^[a-z0-9-]+$/i.test(escaped) && /[a-z]/i.test(escaped)) {
    return true
  }
  return false
}

export function classifyAuditSearchTerm(trimmed: string, escaped: string): AuditSearchKind {
  if (!escaped) return 'general'
  if (isAuditSearchUuid(escaped)) return 'uuid'
  if (isEmailLikeAuditSearch(trimmed, escaped)) return 'email'
  if (/^\d+$/.test(escaped)) return 'numeric'
  if (isActionLikeAuditSearchTerm(escaped)) return 'action_like'
  return 'general'
}

/** Dotted audit action namespace (f1.*, user.*, f4.report_created, etc.). */
export function isActionLikeAuditSearchTerm(escaped: string): boolean {
  if (!escaped.includes('.')) return false
  if (/^(f[1-5]|user|project)\./i.test(escaped)) return true
  return /^[a-z0-9]+(\.[a-z0-9_]+)+$/i.test(escaped)
}

export type AuditSearchPreQueryPlan = {
  usersDisplayName: boolean
  authEmail: boolean
  projectGrantId: boolean
}

export function auditSearchPreQueryPlan(kind: AuditSearchKind, escaped: string): AuditSearchPreQueryPlan {
  switch (kind) {
    case 'uuid':
      return { usersDisplayName: false, authEmail: false, projectGrantId: false }
    case 'numeric':
      return { usersDisplayName: false, authEmail: false, projectGrantId: false }
    case 'email':
      return { usersDisplayName: true, authEmail: true, projectGrantId: false }
    case 'action_like':
      return { usersDisplayName: false, authEmail: false, projectGrantId: false }
    case 'general':
    default:
      return {
        usersDisplayName: true,
        authEmail: false,
        projectGrantId: escaped.length >= 2,
      }
  }
}

/** Staging/local B′ search (Phase 8B). Requires `grant_search_text` column on `audit_logs`. Never enable in production without migration. */
export function auditLogSearchBprimeEnabled(): boolean {
  return process.env.AUDIT_LOG_SEARCH_BPRIME === '1'
}

function pushActionAndEndpointIlike(orParts: string[], escaped: string): void {
  orParts.push(`action.ilike.%${escaped}%`)
  orParts.push(`metadata->>endpoint.ilike.%${escaped}%`)
}

/** B′ consolidated ILIKE arms (action, endpoint, grant_search_text). */
function pushBprimeCoreSearchIlike(orParts: string[], escaped: string): void {
  orParts.push(`action.ilike.%${escaped}%`)
  orParts.push(`metadata->>endpoint.ilike.%${escaped}%`)
  orParts.push(`grant_search_text.ilike.%${escaped}%`)
}

function pushCoreSearchIlike(orParts: string[], escaped: string): void {
  if (auditLogSearchBprimeEnabled()) {
    pushBprimeCoreSearchIlike(orParts, escaped)
  } else {
    pushActionAndEndpointIlike(orParts, escaped)
  }
}

function pushRoleIlikeBranches(orParts: string[], trimmed: string, escaped: string): void {
  if (isPortalRole(trimmed) || trimmed.includes('_')) {
    orParts.push(`metadata->>role.ilike.%${escaped}%`)
    orParts.push(`new_values->>role.ilike.%${escaped}%`)
    orParts.push(`old_values->>role.ilike.%${escaped}%`)
  }
}

function pushUserActorBranches(orParts: string[], searchUserIds: string[]): void {
  if (searchUserIds.length === 0) return
  orParts.push(`actor_user_id.in.(${searchUserIds.join(',')})`)
  orParts.push(`and(target_type.eq.user,target_id.in.(${searchUserIds.join(',')}))`)
}

function pushProjectBranches(orParts: string[], searchProjectIds: string[]): void {
  if (searchProjectIds.length === 0) return
  orParts.push(`target_id.in.(${searchProjectIds.join(',')})`)
  for (const pid of searchProjectIds.slice(0, 15)) {
    orParts.push(`metadata->>project_id.eq.${pid}`)
  }
}

function pushUuidEqualityBranches(orParts: string[], escaped: string): void {
  orParts.push(`target_id.eq.${escaped}`)
  orParts.push(`metadata->>report_id.eq.${escaped}`)
  orParts.push(`metadata->>project_id.eq.${escaped}`)
}

/** Grant serial / grant_id stored on audit rows (F1 assign/create-serial, F2 commit, MOU metadata, etc.). */
export function pushGrantIdentifierSearchBranches(orParts: string[], escaped: string): void {
  orParts.push(`metadata->>grant_serial.ilike.%${escaped}%`)
  orParts.push(`metadata->>grant_id.ilike.%${escaped}%`)
  orParts.push(`new_values->>grant_serial_id.ilike.%${escaped}%`)
  orParts.push(`new_values->>grant_id.ilike.%${escaped}%`)
  orParts.push(`old_values->>grant_serial_id.ilike.%${escaped}%`)
  orParts.push(`old_values->>grant_id.ilike.%${escaped}%`)
}

/**
 * Build PostgREST `.or()` filter segments for audit_logs search.
 * Pre-query results (user IDs, project IDs) must be resolved separately per plan.
 */
export function buildAuditLogSearchOrParts(args: {
  trimmed: string
  escaped: string
  kind: AuditSearchKind
  searchUserIds: string[]
  searchProjectIds: string[]
}): string[] {
  const { trimmed, escaped, kind, searchUserIds, searchProjectIds } = args
  const orParts: string[] = []

  switch (kind) {
    case 'uuid':
      pushUuidEqualityBranches(orParts, escaped)
      break

    case 'numeric':
      pushCoreSearchIlike(orParts, escaped)
      orParts.push(`metadata->>summary_id.eq.${escaped}`)
      break

    case 'email':
      pushCoreSearchIlike(orParts, escaped)
      pushUserActorBranches(orParts, searchUserIds)
      pushRoleIlikeBranches(orParts, trimmed, escaped)
      break

    case 'action_like':
      pushCoreSearchIlike(orParts, escaped)
      pushRoleIlikeBranches(orParts, trimmed, escaped)
      break

    case 'general':
    default:
      pushCoreSearchIlike(orParts, escaped)
      pushUserActorBranches(orParts, searchUserIds)
      pushRoleIlikeBranches(orParts, trimmed, escaped)
      pushProjectBranches(orParts, searchProjectIds)
      if (!auditLogSearchBprimeEnabled()) {
        pushGrantIdentifierSearchBranches(orParts, escaped)
      }
      if (/^\d+$/.test(escaped)) {
        orParts.push(`metadata->>summary_id.eq.${escaped}`)
      }
      if (isAuditSearchUuid(escaped)) {
        pushUuidEqualityBranches(orParts, escaped)
      }
      break
  }

  return orParts
}
