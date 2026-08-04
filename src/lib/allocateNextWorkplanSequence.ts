import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Atomically increments grants_grid_view.max_workplan_sequence and returns the new value.
 * Concurrent callers are serialized by the row lock taken during UPDATE.
 */
export async function allocateNextWorkplanSequence(
  supabase: SupabaseClient,
  grantId: string,
  donorName: string
): Promise<number> {
  const { data, error } = await supabase.rpc('allocate_next_workplan_sequence', {
    p_grant_id: grantId,
    p_donor_name: donorName,
  })

  if (error) {
    throw new Error(error.message || 'Failed to allocate next workplan sequence')
  }

  const nextSeq = typeof data === 'number' ? data : Number(data)
  if (!Number.isFinite(nextSeq) || nextSeq < 1) {
    throw new Error('Invalid workplan sequence returned from database')
  }

  return nextSeq
}
