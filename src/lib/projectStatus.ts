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
  | {
      ok: true
      applied: ReportingStatusChanges & {
        status?: 'completed'
        date_report_completed?: string | null
      }
    }
  | { ok: false; error: string }

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Later of F4/F5 portal upload dates, used as date_report_completed when both are completed.
 */
export async function resolveReportCompletedDate(
  supabase: SupabaseClient,
  projectId: string,
): Promise<string | null> {
  const [{ data: f4Rows }, { data: f5Rows }] = await Promise.all([
    supabase
      .from('err_summary')
      .select('created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('err_program_report')
      .select('created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1),
  ])

  const f4 = f4Rows?.[0]?.created_at ? String(f4Rows[0].created_at).slice(0, 10) : null
  const f5 = f5Rows?.[0]?.created_at ? String(f5Rows[0].created_at).slice(0, 10) : null
  if (f4 && f5) return f4 >= f5 ? f4 : f5
  return f4 || f5 || null
}

/**
 * Applies F4/F5 reporting status changes and auto-completes the project when both are completed.
 * Sets date_report_completed when both statuses become completed; clears it otherwise.
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
    .select('status, f4_status, f5_status, date_report_completed')
    .eq('id', projectId)
    .single()

  if (fetchError || !project) {
    return { ok: false, error: 'Project not found' }
  }

  const nextF4 = changes.f4_status ?? project.f4_status
  const nextF5 = changes.f5_status ?? project.f5_status
  const wasBothCompleted =
    isReportingStatusCompleted(project.f4_status) && isReportingStatusCompleted(project.f5_status)
  const bothCompleted = isReportingStatusCompleted(nextF4) && isReportingStatusCompleted(nextF5)

  const update: Record<string, string | null> = {}
  if (changes.f4_status) update.f4_status = changes.f4_status
  if (changes.f5_status) update.f5_status = changes.f5_status

  if (shouldAutoCompleteProject(project.status, nextF4, nextF5)) {
    update.status = 'completed'
  }

  if (bothCompleted) {
    if (!wasBothCompleted || !project.date_report_completed) {
      update.date_report_completed =
        (await resolveReportCompletedDate(supabase, projectId)) || todayIsoDate()
    }
  } else {
    update.date_report_completed = null
  }

  const { error: updateError } = await supabase
    .from('err_projects')
    .update(update)
    .eq('id', projectId)

  if (updateError) {
    return { ok: false, error: updateError.message }
  }

  return {
    ok: true,
    applied: update as ReportingStatusChanges & {
      status?: 'completed'
      date_report_completed?: string | null
    },
  }
}
