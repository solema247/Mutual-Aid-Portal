import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Set funding_status to committed and stamp committed_at / committed_by when
 * those columns exist (sql/add_committed_at_to_err_projects.sql). Falls back
 * gracefully if the migration has not been applied yet.
 */
export async function markProjectsCommitted(
  supabase: SupabaseClient,
  projectIds: string[],
  opts: { status?: string; committedBy?: string | null } = {}
): Promise<{ error: Error | null }> {
  if (projectIds.length === 0) return { error: null }

  const now = new Date().toISOString()
  const withStamp: Record<string, unknown> = {
    funding_status: 'committed',
    committed_at: now,
    committed_by: opts.committedBy ?? null,
  }
  if (opts.status) withStamp.status = opts.status

  const { error } = await supabase
    .from('err_projects')
    .update(withStamp)
    .in('id', projectIds)

  if (!error) return { error: null }

  const msg = error.message || ''
  if (!/committed_at|committed_by/i.test(msg)) {
    return { error: new Error(msg) }
  }

  // Migration not applied yet — commit without stamps so F2 is not blocked.
  const fallback: Record<string, unknown> = { funding_status: 'committed' }
  if (opts.status) fallback.status = opts.status
  const retry = await supabase.from('err_projects').update(fallback).in('id', projectIds)
  if (retry.error) return { error: new Error(retry.error.message) }
  return { error: null }
}

export async function clearProjectCommittedStamp(
  supabase: SupabaseClient,
  projectId: string,
  opts: { status: string; funding_status: string }
): Promise<{ error: Error | null }> {
  const withClear = {
    status: opts.status,
    funding_status: opts.funding_status,
    committed_at: null,
    committed_by: null,
  }
  const { error } = await supabase.from('err_projects').update(withClear).eq('id', projectId)
  if (!error) return { error: null }

  const msg = error.message || ''
  if (!/committed_at|committed_by/i.test(msg)) {
    return { error: new Error(msg) }
  }

  const retry = await supabase
    .from('err_projects')
    .update({ status: opts.status, funding_status: opts.funding_status })
    .eq('id', projectId)
  if (retry.error) return { error: new Error(retry.error.message) }
  return { error: null }
}
