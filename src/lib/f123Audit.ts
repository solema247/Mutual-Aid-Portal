/**
 * F1–F5 audit helpers.
 * Server-side only. Thin wrapper around logAuditEvent — never throws to callers.
 */

import {
  logAuditEvent,
  type AuditAction,
  type AuditTargetType,
  type LogAuditEventResult,
} from '@/lib/auditLog'
import { auditFieldEqual, pickChangedAuditFields } from '@/lib/userManagementAudit'

export { pickChangedAuditFields }

/** MOU PATCH fields that must not store raw content in audit payloads. */
const MOU_REDACTED_AUDIT_KEYS = new Set([
  'banking_details_override',
  'partner_contact_override',
  'err_contact_override',
  'partner_signature',
  'err_signature',
  'signatures',
])

/** Presence-only value for sensitive/large MOU fields. */
export function mouAuditFieldValue(key: string, value: unknown): unknown {
  if (!MOU_REDACTED_AUDIT_KEYS.has(key)) return value === undefined ? null : value
  if (value == null || value === '') return null
  return '[PRESENT]'
}

/** Build old/new maps for MOU updates; sensitive fields become presence markers. */
export function pickMouAuditChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  keys: readonly string[]
): { oldValues: Record<string, unknown>; newValues: Record<string, unknown> } | null {
  // Compare raw values so a content change still appears, but store presence markers.
  const oldValues: Record<string, unknown> = {}
  const newValues: Record<string, unknown> = {}
  for (const key of keys) {
    const prev = before[key]
    const next = after[key]
    if (!auditFieldEqual(prev, next)) {
      oldValues[key] = mouAuditFieldValue(key, prev)
      newValues[key] = mouAuditFieldValue(key, next)
    }
  }
  if (Object.keys(oldValues).length === 0) return null
  return { oldValues, newValues }
}

export async function emitF123Audit(args: {
  action: AuditAction
  /** When omitted, logAuditEvent resolves the actor from the cookie session. */
  actorUserId?: string | null
  endpoint: string
  request?: Request | null
  targetType: AuditTargetType
  targetId?: string | null
  oldValues?: Record<string, unknown> | null
  newValues?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}): Promise<LogAuditEventResult> {
  try {
    const hasActor =
      typeof args.actorUserId === 'string' && args.actorUserId.trim().length > 0
    const result = await logAuditEvent({
      action: args.action,
      actorUserId: hasActor ? args.actorUserId : null,
      resolveActor: !hasActor,
      targetType: args.targetType,
      targetId: args.targetId ?? null,
      oldValues: args.oldValues ?? null,
      newValues: args.newValues ?? null,
      metadata: {
        source: 'user',
        endpoint: args.endpoint,
        ...(args.metadata ?? {}),
      },
      request: args.request ?? null,
      source: 'user',
    })
    if (!result.ok) {
      console.error('F1/F2/F3 audit event failed', {
        action: args.action,
        endpoint: args.endpoint,
        targetType: args.targetType,
        targetId: args.targetId ?? null,
        error: result.error,
      })
    }
    return result
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'emitF123Audit: unexpected error'
    console.error('F1/F2/F3 audit event unexpected error', {
      action: args.action,
      endpoint: args.endpoint,
      error: e,
    })
    return { ok: false, error: msg }
  }
}
