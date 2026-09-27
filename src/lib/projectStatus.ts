import type { SupabaseClient } from '@supabase/supabase-js'

export function isReportingStatusCompleted(status: string | null | undefined): boolean {
  return String(status ?? '').trim().toLowerCase() === 'completed'
}

/**
 * Status to apply after an F4/F5 upload or re-save.
 * Returns null when already completed so re-edits do not demote finished reports.
 */
export function statusAfterUpload(current: string | null | undefined): 'partial' | null {
  if (isReportingStatusCompleted(current)) return null
  return 'partial'
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

export type ReportingStatusChanges = {
  f4_status?: string
  f5_status?: string
}

export type ReportingStatusProjectRow = {
  status: string | null
  f4_status: string | null
  f5_status: string | null
  date_report_completed: string | null
  completed_at: string | null
}

/** PATCH body with only the F4/F5 fields that actually changed. */
export function diffReportingStatus(
  initial: { f4_status: string; f5_status: string },
  next: { f4_status: string; f5_status: string },
): ReportingStatusChanges {
  const patch: ReportingStatusChanges = {}
  if (next.f4_status !== initial.f4_status) patch.f4_status = next.f4_status
  if (next.f5_status !== initial.f5_status) patch.f5_status = next.f5_status
  return patch
}

export type ApplyReportingStatusResult =
  | {
      ok: true
      applied: ReportingStatusChanges & {
        status?: 'completed'
        completed_at?: string | null
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

function normalizeReportingStatusField(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase()
}

function normalizeDateReportCompletedField(value: string | null | undefined): string | null {
  if (value == null || String(value).trim() === '') return null
  const raw = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  const d = new Date(raw)
  return isNaN(d.getTime()) ? raw : d.toISOString().slice(0, 10)
}

function reportingStatusFieldEqual(
  key: string,
  current: unknown,
  next: string | null
): boolean {
  if (key === 'f4_status' || key === 'f5_status' || key === 'status') {
    return (
      normalizeReportingStatusField(current as string | null) ===
      normalizeReportingStatusField(next)
    )
  }
  if (key === 'date_report_completed') {
    return (
      normalizeDateReportCompletedField(current as string | null) ===
      normalizeDateReportCompletedField(next)
    )
  }
  if (key === 'completed_at') {
    const cur =
      current == null || String(current).trim() === '' ? null : String(current).trim()
    const nxt = next == null || next.trim() === '' ? null : next.trim()
    if (cur == null && nxt == null) return true
    if (cur == null || nxt == null) return false
    const curMs = new Date(cur).getTime()
    const nxtMs = new Date(nxt).getTime()
    if (Number.isNaN(curMs) || Number.isNaN(nxtMs)) return cur === nxt
    return curMs === nxtMs
  }
  return (current ?? null) === next
}

/** True when every key in `update` already matches the stored project row. */
export function reportingStatusUpdateHasEffectiveChange(
  project: ReportingStatusProjectRow,
  update: Record<string, string | null>
): boolean {
  for (const [key, nextVal] of Object.entries(update)) {
    const cur = project[key as keyof ReportingStatusProjectRow]
    if (!reportingStatusFieldEqual(key, cur, nextVal)) return true
  }
  return false
}

/**
 * Builds the same UPDATE payload as applyReportingStatusUpdates (shared business rules).
 */
export async function buildReportingStatusUpdatePayload(
  supabase: SupabaseClient,
  projectId: string,
  project: ReportingStatusProjectRow,
  changes: ReportingStatusChanges
): Promise<Record<string, string | null>> {
  const nextF4 = changes.f4_status ?? project.f4_status
  const nextF5 = changes.f5_status ?? project.f5_status
  const wasBothCompleted =
    isReportingStatusCompleted(project.f4_status) &&
    isReportingStatusCompleted(project.f5_status)
  const bothCompleted =
    isReportingStatusCompleted(nextF4) && isReportingStatusCompleted(nextF5)

  const update: Record<string, string | null> = {}
  if (Object.prototype.hasOwnProperty.call(changes, 'f4_status') && changes.f4_status != null) {
    update.f4_status = changes.f4_status
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'f5_status') && changes.f5_status != null) {
    update.f5_status = changes.f5_status
  }

  if (shouldAutoCompleteProject(project.status, nextF4, nextF5)) {
    update.status = 'completed'
    if (!project.completed_at) {
      update.completed_at = new Date().toISOString()
    }
  }

  if (bothCompleted) {
    if (!wasBothCompleted || !project.date_report_completed) {
      update.date_report_completed =
        (await resolveReportCompletedDate(supabase, projectId)) || todayIsoDate()
    }
  } else {
    update.date_report_completed = null
  }

  return update
}

export type ComputeReportingStatusUpdateResult = {
  update: Record<string, string | null>
  hasEffectiveChange: boolean
}

/** Preview effective DB update for PATCH /reporting-status (no write). */
export async function computeReportingStatusUpdate(
  supabase: SupabaseClient,
  projectId: string,
  project: ReportingStatusProjectRow,
  changes: ReportingStatusChanges
): Promise<ComputeReportingStatusUpdateResult> {
  const update = await buildReportingStatusUpdatePayload(
    supabase,
    projectId,
    project,
    changes
  )
  return {
    update,
    hasEffectiveChange: reportingStatusUpdateHasEffectiveChange(project, update),
  }
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
    .select('status, f4_status, f5_status, date_report_completed, completed_at')
    .eq('id', projectId)
    .single()

  if (fetchError || !project) {
    return { ok: false, error: 'Project not found' }
  }

  const update = await buildReportingStatusUpdatePayload(
    supabase,
    projectId,
    project as ReportingStatusProjectRow,
    changes
  )

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
      completed_at?: string | null
      date_report_completed?: string | null
    },
  }
}

/**
 * After deleting an F4/F5 report: if no portal reports remain for that side, set status to waiting.
 */
export async function resetReportingStatusIfNoReportsRemaining(
  supabase: SupabaseClient,
  projectId: string,
  kind: 'f4' | 'f5',
): Promise<ApplyReportingStatusResult | { ok: true; skipped: true }> {
  if (kind === 'f4') {
    const { count, error } = await supabase
      .from('err_summary')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .is('activities_raw_import_id', null)
    if (error) return { ok: false, error: error.message }
    if ((count ?? 0) > 0) return { ok: true, skipped: true }
    return applyReportingStatusUpdates(supabase, projectId, { f4_status: 'waiting' })
  }

  const { count, error } = await supabase
    .from('err_program_report')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
  if (error) return { ok: false, error: error.message }
  if ((count ?? 0) > 0) return { ok: true, skipped: true }
  return applyReportingStatusUpdates(supabase, projectId, { f5_status: 'waiting' })
}

/**
 * Effective project completion timestamp for archive filtering and display.
 * Prefers completed_at (when marked completed); falls back to date_report_completed for legacy rows.
 */
export function resolveProjectCompletionDate(
  completedAt: string | null | undefined,
  dateReportCompleted: string | null | undefined
): string | null {
  if (completedAt) return completedAt
  if (!dateReportCompleted) return null
  const raw = String(dateReportCompleted).trim()
  if (!raw) return null
  // date_report_completed is stored as YYYY-MM-DD; treat as UTC midnight for month bucketing.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T00:00:00.000Z`
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d.toISOString()
}
