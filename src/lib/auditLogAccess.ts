/** Client-safe Audit Log access check (mirrors is_audit_log_viewer roles). */
export function canViewAuditLogUi(
  role: string | null | undefined,
  status?: string | null
): boolean {
  if (status && status !== 'active') return false
  return role === 'admin' || role === 'superadmin' || role === 'support'
}
