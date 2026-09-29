import type { SupabaseClient } from '@supabase/supabase-js'
import { getRemoteBAdmin } from '@/lib/supabaseAdmin'
import { hasPairedWrite } from '@/lib/sbEnv'

/**
 * Atomically increments grants_grid_view.max_workplan_sequence and returns the new value.
 * Concurrent callers are serialized by the row lock taken during UPDATE.
 * When dual-write is enabled, mirrors the allocated sequence onto staging (RPC is not paired).
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

  if (hasPairedWrite()) {
    try {
      const staging = getRemoteBAdmin()
      const { data: row, error: readErr } = await staging
        .from('grants_grid_view')
        .select('id, max_workplan_sequence')
        .eq('grant_id', grantId)
        .eq('donor_name', donorName)
        .maybeSingle()

      if (readErr) {
        console.error('[allocateNextWorkplanSequence] staging read failed', readErr.message)
      } else if (row?.id) {
        const current = Number(row.max_workplan_sequence) || 0
        if (nextSeq > current) {
          const { error: upErr } = await staging
            .from('grants_grid_view')
            .update({ max_workplan_sequence: nextSeq })
            .eq('id', row.id)
          if (upErr) {
            console.error('[allocateNextWorkplanSequence] staging update failed', upErr.message)
          }
        }
      } else {
        console.warn(
          '[allocateNextWorkplanSequence] grant missing on staging',
          grantId,
          donorName
        )
      }
    } catch (e) {
      console.error('[allocateNextWorkplanSequence] staging mirror error', e)
    }
  }

  return nextSeq
}
