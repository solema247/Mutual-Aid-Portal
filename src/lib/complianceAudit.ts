import type { SupabaseClient } from '@supabase/supabase-js'

export type ComplianceAuditAction =
  | 'clear'
  | 'flag_missing_id'
  | 'flag_sanctions_match'
  | 'finance_dismiss'
  | 'finance_approve'
  | 'upload_id'
  | 'reopen_pending'

/**
 * Append an immutable compliance audit event.
 * Failures are logged but do not fail the primary action — screening decisions
 * should still succeed even if the audit insert has a transient error.
 */
export async function logComplianceEvent(
  supabase: SupabaseClient,
  input: {
    screeningId: string
    projectId: string
    action: ComplianceAuditAction
    actorId: string
    note?: string | null
    metadata?: Record<string, unknown>
  }
): Promise<void> {
  const { error } = await supabase.from('compliance_screening_events').insert({
    screening_id: input.screeningId,
    project_id: input.projectId,
    action: input.action,
    actor_id: input.actorId,
    note: input.note?.trim() || null,
    metadata: input.metadata || {}
  })
  if (error) {
    console.error('Failed to write compliance audit event:', error)
  }
}
