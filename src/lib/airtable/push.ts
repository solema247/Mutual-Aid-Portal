import {
  createAirtableRecord,
  deleteAirtableRecords,
  updateAirtableRecord,
} from '@/lib/airtable/client'
import { PORTAL_AIRTABLE_TABLES } from '@/lib/airtable/config'
import {
  allocationToAirtableFields,
  decisionToAirtableFields,
  grantToAirtableFields,
  type AllocationPushRow,
  type DecisionPushRow,
  type GrantPushRow,
} from '@/lib/airtable/fieldMaps'

export type PushResult =
  | { ok: true; recordId: string; action: 'create' | 'update' }
  | { ok: false; error: string }

type SyncMeta = {
  airtable_record_id: string | null
  last_pushed_at: string | null
}

/** True when airtable_record_id refers to a Portal_* row we have pushed before. */
export function hasPortalRawRecord(meta: SyncMeta): boolean {
  return Boolean(meta.airtable_record_id?.startsWith('rec') && meta.last_pushed_at)
}

export async function pushGrant(row: GrantPushRow, meta: SyncMeta): Promise<PushResult> {
  try {
    const fields = grantToAirtableFields(row)
    if (hasPortalRawRecord(meta) && meta.airtable_record_id) {
      await updateAirtableRecord(PORTAL_AIRTABLE_TABLES.GRANTS, meta.airtable_record_id, fields)
      return { ok: true, recordId: meta.airtable_record_id, action: 'update' }
    }
    const recordId = await createAirtableRecord(PORTAL_AIRTABLE_TABLES.GRANTS, fields)
    return { ok: true, recordId, action: 'create' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function pushDecision(row: DecisionPushRow, meta: SyncMeta): Promise<PushResult> {
  try {
    const legacyDisplayId =
      !hasPortalRawRecord(meta) && meta.airtable_record_id?.startsWith('rec')
        ? meta.airtable_record_id
        : null
    const fields = decisionToAirtableFields(row, legacyDisplayId)

    if (hasPortalRawRecord(meta) && meta.airtable_record_id) {
      await updateAirtableRecord(
        PORTAL_AIRTABLE_TABLES.DECISIONS,
        meta.airtable_record_id,
        fields
      )
      return { ok: true, recordId: meta.airtable_record_id, action: 'update' }
    }
    const recordId = await createAirtableRecord(PORTAL_AIRTABLE_TABLES.DECISIONS, fields)
    return { ok: true, recordId, action: 'create' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function pushAllocation(
  row: AllocationPushRow,
  meta: SyncMeta,
  portalDecisionRecordId: string
): Promise<PushResult> {
  try {
    const legacyDisplayId =
      !hasPortalRawRecord(meta) && meta.airtable_record_id?.startsWith('rec')
        ? meta.airtable_record_id
        : null
    const fields = allocationToAirtableFields(row, portalDecisionRecordId, legacyDisplayId)

    if (hasPortalRawRecord(meta) && meta.airtable_record_id) {
      await updateAirtableRecord(
        PORTAL_AIRTABLE_TABLES.ALLOCATIONS,
        meta.airtable_record_id,
        fields
      )
      return { ok: true, recordId: meta.airtable_record_id, action: 'update' }
    }
    const recordId = await createAirtableRecord(PORTAL_AIRTABLE_TABLES.ALLOCATIONS, fields)
    return { ok: true, recordId, action: 'create' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function deleteGrantFromAirtable(recordId: string | null | undefined): Promise<PushResult> {
  if (!recordId?.startsWith('rec')) {
    return { ok: true, recordId: '', action: 'update' }
  }
  try {
    await deleteAirtableRecords(PORTAL_AIRTABLE_TABLES.GRANTS, [recordId])
    return { ok: true, recordId, action: 'update' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function deleteDecisionFromAirtable(
  recordId: string | null | undefined
): Promise<PushResult> {
  if (!recordId?.startsWith('rec')) {
    return { ok: true, recordId: '', action: 'update' }
  }
  try {
    await deleteAirtableRecords(PORTAL_AIRTABLE_TABLES.DECISIONS, [recordId])
    return { ok: true, recordId, action: 'update' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function deleteAllocationFromAirtable(
  recordId: string | null | undefined
): Promise<PushResult> {
  if (!recordId?.startsWith('rec')) {
    return { ok: true, recordId: '', action: 'update' }
  }
  try {
    await deleteAirtableRecords(PORTAL_AIRTABLE_TABLES.ALLOCATIONS, [recordId])
    return { ok: true, recordId, action: 'update' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
