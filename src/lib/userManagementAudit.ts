/**
 * Shared helpers for User Management Phase 3 audit events.
 * Server-side only. Failures never throw to callers.
 */

import { logAuditEvent, type AuditAction } from '@/lib/auditLog'

export const USER_SCOPE_AUDIT_KEYS = [
  'ops_partner_id',
  'err_id',
  'can_see_all_states',
  'visible_states',
] as const

export type UserScopeAuditKey = (typeof USER_SCOPE_AUDIT_KEYS)[number]

export function auditFieldEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    const aa = Array.isArray(a) ? [...a].map(String).sort() : a == null ? [] : [String(a)]
    const bb = Array.isArray(b) ? [...b].map(String).sort() : b == null ? [] : [String(b)]
    if (aa.length !== bb.length) return false
    return aa.every((v, i) => v === bb[i])
  }
  // Normalize null/undefined for optional ids/booleans
  const na = a === undefined ? null : a
  const nb = b === undefined ? null : b
  return na === nb
}

/** Build old/new maps with only keys whose values actually changed. */
export function pickChangedAuditFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  keys: readonly string[]
): { oldValues: Record<string, unknown>; newValues: Record<string, unknown> } | null {
  const oldValues: Record<string, unknown> = {}
  const newValues: Record<string, unknown> = {}
  for (const key of keys) {
    const prev = before[key]
    const next = after[key]
    if (!auditFieldEqual(prev, next)) {
      oldValues[key] = prev === undefined ? null : prev
      newValues[key] = next === undefined ? null : next
    }
  }
  if (Object.keys(oldValues).length === 0) return null
  return { oldValues, newValues }
}

export type UserManagementAuditEvent = {
  action: AuditAction
  oldValues?: Record<string, unknown> | null
  newValues?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}

/**
 * Emit one or more user-management audit events.
 * Never throws; never affects the HTTP response.
 */
export async function emitUserManagementAudits(args: {
  actorUserId: string
  targetUserId: string
  endpoint: string
  request?: Request | null
  events: UserManagementAuditEvent[]
}): Promise<void> {
  const { actorUserId, targetUserId, endpoint, request, events } = args
  for (const event of events) {
    try {
      const result = await logAuditEvent({
        action: event.action,
        actorUserId,
        resolveActor: false,
        targetType: 'user',
        targetId: targetUserId,
        oldValues: event.oldValues ?? null,
        newValues: event.newValues ?? null,
        metadata: {
          source: 'user',
          endpoint,
          target_user_id: targetUserId,
          ...(event.metadata ?? {}),
        },
        request: request ?? null,
        source: 'user',
      })
      if (!result.ok) {
        console.error('User management audit event failed', {
          action: event.action,
          endpoint,
          targetUserId,
          error: result.error,
        })
      }
    } catch (e) {
      console.error('User management audit event unexpected error', {
        action: event.action,
        endpoint,
        targetUserId,
        error: e,
      })
    }
  }
}
