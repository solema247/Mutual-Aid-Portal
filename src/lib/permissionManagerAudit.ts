/**
 * Permission Manager Phase 4 audit helpers.
 * Server-side only. Failures never throw to callers.
 */

import { logAuditEvent, type AuditAction, type AuditTargetType } from '@/lib/auditLog'
import { auditFieldEqual, pickChangedAuditFields } from '@/lib/userManagementAudit'
import type { UserOverride } from '@/lib/userOverridesDb'

export function sortedCodes(codes: string[]): string[] {
  return [...codes].map(String).sort()
}

export function overridesEqual(a: UserOverride, b: UserOverride): boolean {
  return (
    auditFieldEqual(a.add, b.add) && auditFieldEqual(a.remove, b.remove)
  )
}

export function overridesCount(o: UserOverride): number {
  return (o.add?.length ?? 0) + (o.remove?.length ?? 0)
}

/** UI reset / clear-to-default sends empty add + remove. */
export function isManualOverrideReset(add: string[], remove: string[]): boolean {
  return add.length === 0 && remove.length === 0
}

export function pickOverrideChanges(
  before: UserOverride,
  after: UserOverride
): { oldValues: Record<string, unknown>; newValues: Record<string, unknown> } | null {
  return pickChangedAuditFields(
    { add_functions: before.add, remove_functions: before.remove },
    { add_functions: after.add, remove_functions: after.remove },
    ['add_functions', 'remove_functions']
  )
}

export async function emitPermissionManagerAudit(args: {
  action: AuditAction
  actorUserId: string
  endpoint: string
  request?: Request | null
  targetType: AuditTargetType
  targetId?: string | null
  oldValues?: Record<string, unknown> | null
  newValues?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}): Promise<void> {
  try {
    const result = await logAuditEvent({
      action: args.action,
      actorUserId: args.actorUserId,
      resolveActor: false,
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
      console.error('Permission manager audit event failed', {
        action: args.action,
        endpoint: args.endpoint,
        error: result.error,
      })
    }
  } catch (e) {
    console.error('Permission manager audit unexpected error', {
      action: args.action,
      endpoint: args.endpoint,
      error: e,
    })
  }
}
