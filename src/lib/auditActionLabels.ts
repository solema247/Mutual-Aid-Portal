/**
 * Known audit action keys → i18n key / English fallback.
 * Internal DB action strings stay unchanged.
 */

export const AUDIT_ACTION_DEFS = [
  { action: 'user.created', i18nKey: 'audit:action_user_created', fallback: 'User Created' },
  { action: 'user.updated', i18nKey: 'audit:action_user_updated', fallback: 'User Updated' },
  { action: 'user.deleted', i18nKey: 'audit:action_user_deleted', fallback: 'User Deleted' },
  { action: 'user.role_changed', i18nKey: 'audit:action_user_role_changed', fallback: 'Role Changed' },
  { action: 'user.status_changed', i18nKey: 'audit:action_user_status_changed', fallback: 'Status Changed' },
  { action: 'user.scope_changed', i18nKey: 'audit:action_user_scope_changed', fallback: 'Scope Changed' },
  { action: 'user.permission_changed', i18nKey: 'audit:action_user_permission_changed', fallback: 'Permission Changed' },
  { action: 'user.permissions_reset', i18nKey: 'audit:action_user_permissions_reset', fallback: 'Permissions Reset' },
  // F1
  { action: 'f1.workplan_created', i18nKey: 'audit:action_f1_workplan_created', fallback: 'F1 Workplan Created' },
  { action: 'f1.feedback_submitted', i18nKey: 'audit:action_f1_feedback_submitted', fallback: 'F1 Feedback Submitted' },
  { action: 'f1.serial_created', i18nKey: 'audit:action_f1_serial_created', fallback: 'F1 Serial Created' },
  { action: 'f1.serial_assigned', i18nKey: 'audit:action_f1_serial_assigned', fallback: 'F1 Serial Assigned' },
  { action: 'f1.moved_to_f2', i18nKey: 'audit:action_f1_moved_to_f2', fallback: 'F1 Moved to F2' },
  { action: 'f1.pre_assigned', i18nKey: 'audit:action_f1_pre_assigned', fallback: 'F1 Pre-Assigned' },
  { action: 'f1.document_added', i18nKey: 'audit:action_f1_document_added', fallback: 'Project Document Added' },
  { action: 'f1.document_removed', i18nKey: 'audit:action_f1_document_removed', fallback: 'Project Document Removed' },
  // F2
  { action: 'f2.committed', i18nKey: 'audit:action_f2_committed', fallback: 'F2 Committed' },
  { action: 'f2.decommitted', i18nKey: 'audit:action_f2_decommitted', fallback: 'F2 Decommitted' },
  { action: 'f2.project_updated', i18nKey: 'audit:action_f2_project_updated', fallback: 'F2 Project Updated' },
  { action: 'f2.project_edited', i18nKey: 'audit:action_f2_project_edited', fallback: 'F2 Project Edited' },
  { action: 'f2.approval_file_attached', i18nKey: 'audit:action_f2_approval_file_attached', fallback: 'F2 Approval File Attached' },
  { action: 'f2.project_deleted', i18nKey: 'audit:action_f2_project_deleted', fallback: 'F2 Project Deleted' },
  { action: 'f2.assigned', i18nKey: 'audit:action_f2_assigned', fallback: 'F2 Assigned' },
  { action: 'f2.reassigned', i18nKey: 'audit:action_f2_reassigned', fallback: 'F2 Reassigned' },
  // F3
  { action: 'f3.mou_created', i18nKey: 'audit:action_f3_mou_created', fallback: 'MOU Created' },
  { action: 'f3.mou_updated', i18nKey: 'audit:action_f3_mou_updated', fallback: 'MOU Updated' },
  { action: 'f3.mou_assigned', i18nKey: 'audit:action_f3_mou_assigned', fallback: 'MOU Assigned' },
  { action: 'f3.mou_reassigned', i18nKey: 'audit:action_f3_mou_reassigned', fallback: 'MOU Reassigned' },
  { action: 'f3.mou_projects_added', i18nKey: 'audit:action_f3_mou_projects_added', fallback: 'MOU Projects Added' },
  { action: 'f3.mou_projects_removed', i18nKey: 'audit:action_f3_mou_projects_removed', fallback: 'MOU Projects Removed' },
  { action: 'f3.mou_regenerated', i18nKey: 'audit:action_f3_mou_regenerated', fallback: 'MOU Regenerated' },
  { action: 'f3.signed_mou_uploaded', i18nKey: 'audit:action_f3_signed_mou_uploaded', fallback: 'Signed MOU Uploaded' },
  { action: 'f3.payment_confirmation_created', i18nKey: 'audit:action_f3_payment_confirmation_created', fallback: 'Payment Confirmation Created' },
  { action: 'f3.payment_confirmation_updated', i18nKey: 'audit:action_f3_payment_confirmation_updated', fallback: 'Payment Confirmation Updated' },
  { action: 'f3.payment_confirmation_deleted', i18nKey: 'audit:action_f3_payment_confirmation_deleted', fallback: 'Payment Confirmation Deleted' },
  { action: 'f3.payment_file_added', i18nKey: 'audit:action_f3_payment_file_added', fallback: 'Payment File Added' },
  { action: 'f3.payment_file_removed', i18nKey: 'audit:action_f3_payment_file_removed', fallback: 'Payment File Removed' },
  // F4
  { action: 'f4.report_created', i18nKey: 'audit:action_f4_report_created', fallback: 'F4 Report Created' },
  { action: 'f4.report_updated', i18nKey: 'audit:action_f4_report_updated', fallback: 'F4 Report Updated' },
  { action: 'f4.report_deleted', i18nKey: 'audit:action_f4_report_deleted', fallback: 'F4 Report Deleted' },
  { action: 'f4.reviewed', i18nKey: 'audit:action_f4_reviewed', fallback: 'F4 Reviewed' },
  // F5
  { action: 'f5.report_created', i18nKey: 'audit:action_f5_report_created', fallback: 'F5 Report Created' },
  { action: 'f5.report_updated', i18nKey: 'audit:action_f5_report_updated', fallback: 'F5 Report Updated' },
  { action: 'f5.report_deleted', i18nKey: 'audit:action_f5_report_deleted', fallback: 'F5 Report Deleted' },
  // Project reporting / completion
  { action: 'project.reporting_status_changed', i18nKey: 'audit:action_project_reporting_status_changed', fallback: 'Reporting Status Changed' },
  { action: 'project.completed', i18nKey: 'audit:action_project_completed', fallback: 'Project Completed' },
  { action: 'project.implemented_sector_changed', i18nKey: 'audit:action_project_implemented_sector_changed', fallback: 'Implemented Sector Changed' },
] as const

export const KNOWN_AUDIT_ACTIONS = AUDIT_ACTION_DEFS.map((d) => d.action)

export function getAuditActionFallback(action: string): string {
  const found = AUDIT_ACTION_DEFS.find((d) => d.action === action)
  if (found) return found.fallback
  // Humanize unknown dotted keys lightly
  return action
    .split('.')
    .map((part) => part.replace(/_/g, ' '))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' · ')
}
