import type { SupabaseClient } from '@supabase/supabase-js'

export function isReportingStatusCompleted(status: string | null | undefined): boolean {
  return String(status ?? '').trim().toLowerCase() === 'completed'
}

/** When both F4 and F5 are completed, promote active portal projects to completed. */
export function shouldAutoCompleteProject(
  projectStatus: string | null | undefined,
  f4Status: string | null | undefined,
  f5Status: string | null | undefined,
): boolean {
  return (
    String(projectStatus ?? '').trim().toLowerCase() === 'active' &&
    isReportingStatusCompleted(f4Status) &&
    isReportingStatusCompleted(f5Status)
  )
}

type ReportingStatusChanges = {
  f4_status?: string
  f5_status?: string
}

export type ApplyReportingStatusResult =
  | { ok: true; applied: ReportingStatusChanges & { status?: 'completed' } }
  | { ok: false; error: string }

/**
 * Applies F4/F5 reporting status changes and auto-completes the project when both are completed.
 */
export async function applyReportingStatusUpdates(
  supabase: SupabaseClient,
  projectId: string,
  changes: ReportingStatusChanges,
): Promise<ApplyReportingStatusResult> {
  if (!changes.f4_status && !changes.f5_status) {
    return { ok: false, error: 'No reporting status changes provided.' }
  }

  const { data: project, error: fetchError } = await supabase
    .from('err_projects')
    .select('status, f4_status, f5_status')
    .eq('id', projectId)
    .single()

  if (fetchError || !project) {
    return { ok: false, error: 'Project not found' }
  }

  const nextF4 = changes.f4_status ?? project.f4_status
  const nextF5 = changes.f5_status ?? project.f5_status

  const update: Record<string, string> = {}
  if (changes.f4_status) update.f4_status = changes.f4_status
  if (changes.f5_status) update.f5_status = changes.f5_status

  if (shouldAutoCompleteProject(project.status, nextF4, nextF5)) {
    update.status = 'completed'
  }

  const { error: updateError } = await supabase
    .from('err_projects')
    .update(update)
    .eq('id', projectId)

  if (updateError) {
    return { ok: false, error: updateError.message }
  }

  return { ok: true, applied: update as ReportingStatusChanges & { status?: 'completed' } }
}
