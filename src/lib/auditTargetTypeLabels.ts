/**
 * Audit target type labels (client-safe). DB values unchanged.
 * Keep in sync with AUDIT_TARGET_TYPES in auditLog.ts.
 */

export const AUDIT_TARGET_TYPE_VALUES = [
  'user',
  'role',
  'role_defaults',
  'system',
  'project',
  'project_document',
  'mou',
  'payment_confirmation',
  'payment_file',
  'f4_summary',
  'f5_report',
] as const

export type AuditTargetTypeValue = (typeof AUDIT_TARGET_TYPE_VALUES)[number]

const FALLBACK_LABELS: Record<string, string> = {
  user: 'User',
  role: 'Role',
  role_defaults: 'Role Defaults',
  system: 'System',
  project: 'Project',
  project_document: 'Project Document',
  mou: 'MOU',
  payment_confirmation: 'Payment Confirmation',
  payment_file: 'Payment File',
  f4_summary: 'F4 Summary',
  f5_report: 'F5 Report',
}

export function auditTargetTypeI18nKey(targetType: string): string {
  return `audit:target_${targetType}`
}

export function getAuditTargetTypeFallback(targetType: string): string {
  return (
    FALLBACK_LABELS[targetType] ??
    targetType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  )
}

export function isKnownAuditTargetType(value: string): value is AuditTargetTypeValue {
  return (AUDIT_TARGET_TYPE_VALUES as readonly string[]).includes(value)
}
