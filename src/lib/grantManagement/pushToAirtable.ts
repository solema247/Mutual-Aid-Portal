import type { SupabaseClient } from '@supabase/supabase-js'
import { isAirtablePushConfigured } from '@/lib/airtable/config'
import {
  deleteAllocationFromAirtable,
  deleteDecisionFromAirtable,
  deleteGrantFromAirtable,
  hasPortalRawRecord,
  pushAllocation,
  pushDecision,
  pushGrant,
} from '@/lib/airtable/push'
import { resolveSyncTargetFromGrantName, shouldPushToAirtable } from '@/lib/grantManagement/syncTarget'
import { SYNC_STATUS } from '@/lib/grantManagement/syncStatus'
import { syncLogger } from '@/lib/syncLogger'

export type AirtableSyncOutcome = {
  status: 'synced' | 'pending' | 'skipped'
  error?: string
  recordId?: string
}

const GRANT_PUSH_SELECT =
  'id, grant_id, project_name, status, grant_start_date, grant_end_date, donor_name, partner_name, project_id, airtable_record_id, last_pushed_at, sync_status, sync_target'

const DECISION_PUSH_SELECT =
  'id, decision_id_proposed, decision_id, decision_amount, decision_date, restriction, partner, grant_name, notes, file_name, file_link, airtable_record_id, last_pushed_at, sync_status'

const ALLOCATION_PUSH_SELECT =
  'Allocation_ID, Decision_ID, State, "Allocation Amount", Restriction, Decision_Date, airtable_record_id, last_pushed_at, sync_status'

async function markSynced(
  supabase: SupabaseClient,
  table: 'grants_grid_view' | 'distribution_decision_master_sheet_1' | 'allocations_by_date',
  idColumn: string,
  id: string,
  recordId: string
): Promise<void> {
  const { error } = await supabase
    .from(table)
    .update({
      airtable_record_id: recordId,
      sync_status: SYNC_STATUS.SYNCED,
      last_pushed_at: new Date().toISOString(),
    })
    .eq(idColumn, id)
  if (error) throw error
}

async function markPending(
  supabase: SupabaseClient,
  table: 'grants_grid_view' | 'distribution_decision_master_sheet_1' | 'allocations_by_date',
  idColumn: string,
  id: string,
  error: string
): Promise<AirtableSyncOutcome> {
  await supabase.from(table).update({ sync_status: SYNC_STATUS.PENDING }).eq(idColumn, id)
  syncLogger.warn('Airtable push failed', { table, id, error })
  return { status: 'pending', error }
}

export async function syncGrantToAirtable(
  supabase: SupabaseClient,
  grantId: string
): Promise<AirtableSyncOutcome> {
  if (!isAirtablePushConfigured()) {
    return { status: 'skipped' }
  }

  const { data, error } = await supabase
    .from('grants_grid_view')
    .select(GRANT_PUSH_SELECT)
    .eq('id', grantId)
    .single()

  if (error || !data) {
    return { status: 'pending', error: error?.message ?? 'Grant not found' }
  }

  if (!shouldPushToAirtable(data.sync_target)) {
    syncLogger.info('Grant push skipped (sync_target)', { grantId, sync_target: data.sync_target })
    return { status: 'skipped' }
  }

  const result = await pushGrant(data, {
    airtable_record_id: data.airtable_record_id,
    last_pushed_at: data.last_pushed_at,
  })

  if (!result.ok) {
    return markPending(supabase, 'grants_grid_view', 'id', grantId, result.error)
  }

  await markSynced(supabase, 'grants_grid_view', 'id', grantId, result.recordId)
  syncLogger.info('Grant pushed to Portal_Grants', { grantId, recordId: result.recordId, action: result.action })
  return { status: 'synced', recordId: result.recordId }
}

export async function syncDecisionToAirtable(
  supabase: SupabaseClient,
  decisionUuid: string
): Promise<AirtableSyncOutcome> {
  if (!isAirtablePushConfigured()) {
    return { status: 'skipped' }
  }

  const { data, error } = await supabase
    .from('distribution_decision_master_sheet_1')
    .select(DECISION_PUSH_SELECT)
    .eq('id', decisionUuid)
    .single()

  if (error || !data) {
    return { status: 'pending', error: error?.message ?? 'Decision not found' }
  }

  const syncTarget = await resolveSyncTargetFromGrantName(supabase, data.grant_name)
  if (!shouldPushToAirtable(syncTarget)) {
    syncLogger.info('Decision push skipped (sync_target)', {
      decisionUuid,
      grant_name: data.grant_name,
      sync_target: syncTarget,
    })
    return { status: 'skipped' }
  }

  const result = await pushDecision(data, {
    airtable_record_id: data.airtable_record_id,
    last_pushed_at: data.last_pushed_at,
  })

  if (!result.ok) {
    return markPending(supabase, 'distribution_decision_master_sheet_1', 'id', decisionUuid, result.error)
  }

  await markSynced(supabase, 'distribution_decision_master_sheet_1', 'id', decisionUuid, result.recordId)
  syncLogger.info('Decision pushed to Portal_Decisions', {
    decisionUuid,
    recordId: result.recordId,
    action: result.action,
  })
  return { status: 'synced', recordId: result.recordId }
}

export async function syncDecisionToAirtableByGroupKey(
  supabase: SupabaseClient,
  groupKey: string
): Promise<AirtableSyncOutcome> {
  const { data, error } = await supabase
    .from('distribution_decision_master_sheet_1')
    .select('id')
    .eq('decision_id_proposed', groupKey)
    .maybeSingle()

  if (error || !data?.id) {
    return { status: 'pending', error: error?.message ?? 'Decision not found for group key' }
  }
  return syncDecisionToAirtable(supabase, data.id)
}

/** Ensure parent decision exists in Portal_Decisions; returns raw record id. */
export async function ensureDecisionPortalRecord(
  supabase: SupabaseClient,
  groupKey: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('distribution_decision_master_sheet_1')
    .select('id, airtable_record_id, last_pushed_at, sync_status')
    .eq('decision_id_proposed', groupKey)
    .single()

  if (error || !data) return null

  if (hasPortalRawRecord(data)) {
    return data.airtable_record_id
  }

  const outcome = await syncDecisionToAirtable(supabase, data.id)
  if (outcome.status !== 'synced' || !outcome.recordId) return null
  return outcome.recordId
}

export async function syncAllocationToAirtable(
  supabase: SupabaseClient,
  allocationId: string
): Promise<AirtableSyncOutcome> {
  if (!isAirtablePushConfigured()) {
    return { status: 'skipped' }
  }

  const { data, error } = await supabase
    .from('allocations_by_date')
    .select(ALLOCATION_PUSH_SELECT)
    .eq('Allocation_ID', allocationId)
    .single()

  if (error || !data) {
    return { status: 'pending', error: error?.message ?? 'Allocation not found' }
  }

  const groupKey = data.Decision_ID
  if (!groupKey) {
    return { status: 'pending', error: 'Allocation has no Decision_ID' }
  }

  const { data: decisionRow } = await supabase
    .from('distribution_decision_master_sheet_1')
    .select('grant_name')
    .eq('decision_id_proposed', groupKey)
    .maybeSingle()

  const syncTarget = await resolveSyncTargetFromGrantName(supabase, decisionRow?.grant_name)
  if (!shouldPushToAirtable(syncTarget)) {
    syncLogger.info('Allocation push skipped (sync_target)', {
      allocationId,
      grant_name: decisionRow?.grant_name,
      sync_target: syncTarget,
    })
    return { status: 'skipped' }
  }

  const portalDecisionId = await ensureDecisionPortalRecord(supabase, groupKey)
  if (!portalDecisionId) {
    return { status: 'pending', error: 'Could not push parent decision to Airtable' }
  }

  const result = await pushAllocation(
    data,
    { airtable_record_id: data.airtable_record_id, last_pushed_at: data.last_pushed_at },
    portalDecisionId
  )

  if (!result.ok) {
    return markPending(supabase, 'allocations_by_date', 'Allocation_ID', allocationId, result.error)
  }

  await markSynced(supabase, 'allocations_by_date', 'Allocation_ID', allocationId, result.recordId)
  syncLogger.info('Allocation pushed to Portal_Allocations', {
    allocationId,
    recordId: result.recordId,
    action: result.action,
  })
  return { status: 'synced', recordId: result.recordId }
}

export async function removeGrantFromAirtable(
  airtableRecordId: string | null,
  lastPushedAt: string | null
): Promise<AirtableSyncOutcome> {
  if (!isAirtablePushConfigured()) {
    return { status: 'skipped' }
  }
  if (!hasPortalRawRecord({ airtable_record_id: airtableRecordId, last_pushed_at: lastPushedAt })) {
    return { status: 'skipped' }
  }
  const result = await deleteGrantFromAirtable(airtableRecordId)
  if (!result.ok) {
    syncLogger.warn('Airtable grant delete failed', { error: result.error })
    return { status: 'pending', error: result.error }
  }
  return { status: 'synced' }
}

export async function removeDecisionFromAirtable(
  supabase: SupabaseClient,
  decisionIdProposed: string,
  airtableRecordId: string | null,
  lastPushedAt: string | null
): Promise<AirtableSyncOutcome> {
  if (!isAirtablePushConfigured()) {
    return { status: 'skipped' }
  }

  const { data: allocRows } = await supabase
    .from('allocations_by_date')
    .select('Allocation_ID, airtable_record_id, last_pushed_at')
    .eq('Decision_ID', decisionIdProposed)

  for (const alloc of allocRows ?? []) {
    if (hasPortalRawRecord(alloc)) {
      await deleteAllocationFromAirtable(alloc.airtable_record_id)
    }
  }

  if (!hasPortalRawRecord({ airtable_record_id: airtableRecordId, last_pushed_at: lastPushedAt })) {
    return { status: 'skipped' }
  }

  const result = await deleteDecisionFromAirtable(airtableRecordId)
  if (!result.ok) {
    return { status: 'pending', error: result.error }
  }
  return { status: 'synced' }
}

export async function removeAllocationFromAirtable(
  airtableRecordId: string | null,
  lastPushedAt: string | null
): Promise<AirtableSyncOutcome> {
  if (!isAirtablePushConfigured()) {
    return { status: 'skipped' }
  }
  if (!hasPortalRawRecord({ airtable_record_id: airtableRecordId, last_pushed_at: lastPushedAt })) {
    return { status: 'skipped' }
  }
  const result = await deleteAllocationFromAirtable(airtableRecordId)
  if (!result.ok) {
    return { status: 'pending', error: result.error }
  }
  return { status: 'synced' }
}

export function airtableMeta(outcome: AirtableSyncOutcome) {
  return {
    airtable_sync: outcome.status,
    ...(outcome.error ? { airtable_sync_error: outcome.error } : {}),
  }
}
