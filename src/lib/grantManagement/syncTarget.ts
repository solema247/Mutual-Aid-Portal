import type { SupabaseClient } from '@supabase/supabase-js'

/** Airtable push routing targets for grants_grid_view.sync_target */
export const SYNC_TARGET = {
  P2H: 'p2h',
  NONE: 'none',
} as const

export type SyncTarget = (typeof SYNC_TARGET)[keyof typeof SYNC_TARGET]

export function shouldPushToAirtable(syncTarget: string | null | undefined): boolean {
  return syncTarget === SYNC_TARGET.P2H
}

/** Map create-grant request body to sync_target (checkbox: sync_to_p2h_airtable). */
export function parseSyncTargetFromBody(body: Record<string, unknown>): SyncTarget {
  if (body.sync_to_p2h_airtable === false) {
    return SYNC_TARGET.NONE
  }
  if (body.sync_target === SYNC_TARGET.NONE) {
    return SYNC_TARGET.NONE
  }
  return SYNC_TARGET.P2H
}

/** Resolve push target from decision grant_name (business grant_id). Defaults to p2h. */
export async function resolveSyncTargetFromGrantName(
  supabase: SupabaseClient,
  grantName: string | null | undefined
): Promise<SyncTarget> {
  if (!grantName?.trim()) {
    return SYNC_TARGET.P2H
  }

  const { data, error } = await supabase
    .from('grants_grid_view')
    .select('sync_target')
    .eq('grant_id', grantName.trim())
    .maybeSingle()

  if (error || !data?.sync_target) {
    return SYNC_TARGET.P2H
  }

  return data.sync_target === SYNC_TARGET.NONE ? SYNC_TARGET.NONE : SYNC_TARGET.P2H
}
