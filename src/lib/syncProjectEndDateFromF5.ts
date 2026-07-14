import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Sets err_projects.end_date to max(err_program_reach.end_date) across the project's F5 reports.
 * The DB trigger also maintains this; calling after F5 writes keeps app paths explicit.
 */
export async function syncProjectEndDateFromF5(
  supabase: SupabaseClient,
  projectId: string | null | undefined,
): Promise<{ ok: true; end_date: string | null } | { ok: false; error: string }> {
  if (!projectId) {
    return { ok: false, error: 'project_id required' }
  }

  const { data: reports, error: reportsError } = await supabase
    .from('err_program_report')
    .select('id')
    .eq('project_id', projectId)

  if (reportsError) {
    return { ok: false, error: reportsError.message }
  }

  const reportIds = (reports || []).map((r) => r.id)
  let endDate: string | null = null

  if (reportIds.length > 0) {
    const { data: reachRows, error: reachError } = await supabase
      .from('err_program_reach')
      .select('end_date')
      .in('report_id', reportIds)
      .not('end_date', 'is', null)

    if (reachError) {
      return { ok: false, error: reachError.message }
    }

    for (const row of reachRows || []) {
      const value = row.end_date as string | null
      if (!value) continue
      if (!endDate || value > endDate) endDate = value
    }
  }

  const { error: updateError } = await supabase
    .from('err_projects')
    .update({ end_date: endDate })
    .eq('id', projectId)

  if (updateError) {
    return { ok: false, error: updateError.message }
  }

  return { ok: true, end_date: endDate }
}
