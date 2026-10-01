/**
 * Canonical audit bind for F5 report mutations.
 * err_program_report.id is numeric — use project UUID as target_id; report id in metadata.
 */

import type { LogAuditEventResult } from '@/lib/auditLog'
import { validateAuditLogTargetId } from '@/lib/auditLog'

export const F5_REPORT_AUDIT_TARGET_TYPE = 'f5_report' as const

export function f5ReportAuditTarget(projectId: string): {
  targetType: typeof F5_REPORT_AUDIT_TARGET_TYPE
  targetId: string
} {
  return {
    targetType: F5_REPORT_AUDIT_TARGET_TYPE,
    targetId: String(projectId),
  }
}

/** Ensures project UUID is valid for audit_logs.target_id (tests + offline checks). */
export function validateF5ReportAuditBind(projectId: string): { ok: true } | { ok: false; error: string } {
  const projectCheck = validateAuditLogTargetId(String(projectId))
  if (!projectCheck.ok) {
    return { ok: false, error: projectCheck.error }
  }
  return { ok: true }
}

export function reportF5AuditInsertFailure(
  context: {
    action: string
    endpoint: string
    projectId: string
    reportId: number | string
  },
  result: LogAuditEventResult
): void {
  if (result.ok) return
  console.error('F5 report audit event failed to persist', {
    ...context,
    error: result.error,
  })
}
