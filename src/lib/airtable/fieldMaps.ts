import type { AirtableFields } from '@/lib/airtable/client'

export type GrantPushRow = {
  id: string
  grant_id: string | null
  project_name: string | null
  status: string | null
  grant_start_date: string | null
  grant_end_date: string | null
  donor_name: string | null
  partner_name: string | null
  project_id: string | null
}

export type DecisionPushRow = {
  id: string
  decision_id_proposed: string | null
  decision_id: string | null
  decision_amount: number | null
  decision_date: string | null
  restriction: string | null
  partner: string | null
  grant_name: string | null
  notes: string | null
  file_name: string | null
  file_link: string | null
}

export type AllocationPushRow = {
  Allocation_ID: string
  Decision_ID: string | null
  State: string | null
  'Allocation Amount': number | null
  Restriction: string | null
  Decision_Date: string | null
}

function normalizeGrantStatus(status: string | null | undefined): string | null {
  if (!status) return null
  const s = status.trim()
  if (s.toLowerCase() === 'complete') return 'Complete'
  if (s.toLowerCase() === 'active') return 'Active'
  return s
}

function omitEmpty(fields: AirtableFields): AirtableFields {
  const out: AirtableFields = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value !== null && value !== undefined && value !== '') {
      out[key] = value
    }
  }
  return out
}

export function grantToAirtableFields(row: GrantPushRow): AirtableFields {
  return omitEmpty({
    grant_id: row.grant_id,
    project_name: row.project_name,
    status: normalizeGrantStatus(row.status),
    grant_start_date: row.grant_start_date,
    grant_end_date: row.grant_end_date,
    donor: row.donor_name,
    partner: row.partner_name,
    project_id: row.project_id,
    portal_id: row.id,
  })
}

export function decisionToAirtableFields(
  row: DecisionPushRow,
  displayRecordId?: string | null
): AirtableFields {
  return omitEmpty({
    decision_id_proposed: row.decision_id_proposed,
    decision_id: row.decision_id,
    decision_amount: row.decision_amount,
    decision_date: row.decision_date,
    restriction: row.restriction,
    partner: row.partner,
    grant_name: row.grant_name,
    notes: row.notes,
    file_name: row.file_name,
    file_link: row.file_link,
    portal_id: row.id,
    display_record_id: displayRecordId,
  })
}

export function allocationToAirtableFields(
  row: AllocationPushRow,
  portalDecisionRecordId: string,
  displayRecordId?: string | null
): AirtableFields {
  return omitEmpty({
    allocation_id: row.Allocation_ID,
    portal_decision: [portalDecisionRecordId],
    state: row.State,
    allocation_amount: row['Allocation Amount'],
    restriction: row.Restriction,
    decision_date: row.Decision_Date,
    portal_id: row.Allocation_ID,
    display_record_id: displayRecordId,
  })
}
