/**
 * Interim sync: Airtable FDW `grants` → portal `grants_grid_view`.
 *
 * Field ownership on existing rows:
 * - Airtable-owned (always pulled): total_transferred_amount_usd, sum_activity_amount,
 *   sum_transfer_fee_amount
 * - Portal-owned (never overwritten): project_name, dates, status, donor/partner, etc.
 *
 * New FDW grants (no matching grant_id) are inserted with full FDW payload.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { SYNC_STATUS } from '@/lib/grantManagement/syncStatus'

/** Canonical-only grants — never insert/update from FDW */
export const SKIP_GRANT_IDS = new Set(['Avaaz 2'])

/** Donor short_name for new grant inserts (grant_id → short_name) */
const DONOR_SHORT_NAMES: Record<string, string> = {
  'Skoll Foundation': 'SkF',
  'Silicon Valley Foundation': 'SVF',
  'Crushing Family Foundation': 'CFF',
}

/** Fields Airtable still owns — refreshed on every pull for existing rows */
export const AIRTABLE_OWNED_FIELDS = [
  'total_transferred_amount_usd',
  'sum_activity_amount',
  'sum_transfer_fee_amount',
] as const

export type AirtableOwnedField = (typeof AIRTABLE_OWNED_FIELDS)[number]

type FdwGrant = {
  grant_id: string | null
  donor_name: unknown
  partner_name: unknown
  project_name: string | null
  grant_start_date: string | null
  grant_end_date: string | null
  status: string | null
  project_id: string | null
  total_transferred_amount_usd: number | null
  sum_activity_amount: number | null
  sum_transfer_fee_amount: number | null
}

type CanonicalGrant = {
  id: string
  grant_id: string | null
  total_transferred_amount_usd: number | null
  sum_activity_amount: number | null
  sum_transfer_fee_amount: number | null
}

type DonorRow = { id: string; name: string; short_name: string | null }

type FinancialPayload = {
  total_transferred_amount_usd: number | null
  sum_activity_amount: number | null
  sum_transfer_fee_amount: number | null
  updated_at: string
}

type InsertPlan = {
  grant_id: string
  donor: { name: string; short_name: string; exists: boolean; id?: string }
  payload: FinancialPayload & {
    grant_id: string
    project_id: string | null
    project_name: string | null
    grant_start_date: string | null
    grant_end_date: string | null
    status: string | null
    donor_name: string
    partner_name: string
    sync_status: string
  }
}

export type FieldChange = { from: unknown; to: unknown }

export type PullGrantsFromFdwResult = {
  dryRun: boolean
  fdwCount: number
  canonicalCount: number
  inserted: number
  updated: number
  unchanged: number
  skipped: string[]
  insertPlans: Array<{ grant_id: string; donor: string; newDonor: boolean }>
  updatePlans: Array<{
    grant_id: string
    id: string
    changes: Record<string, FieldChange>
  }>
  errors: string[]
}

export type PullGrantsFromFdwOptions = {
  supabase: SupabaseClient
  dryRun?: boolean
}

function normGrantId(id: string | null | undefined): string {
  return (id ?? '').trim()
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function eq(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null && b == null) return true
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) < 0.01
  }
  return String(a ?? '') === String(b ?? '')
}

function financialFromFdw(row: FdwGrant): Omit<FinancialPayload, 'updated_at'> {
  return {
    total_transferred_amount_usd: num(row.total_transferred_amount_usd),
    sum_activity_amount: num(row.sum_activity_amount),
    sum_transfer_fee_amount: num(row.sum_transfer_fee_amount),
  }
}

function donorDisplayName(grantId: string, projectName: string | null): string {
  return grantId || normGrantId(projectName) || grantId
}

function donorShortName(grantId: string): string {
  return DONOR_SHORT_NAMES[grantId] ?? grantId.slice(0, 3).toUpperCase()
}

function buildInsertPlan(row: FdwGrant, donorsByName: Map<string, DonorRow>): InsertPlan {
  const grant_id = normGrantId(row.grant_id)
  const donorName = donorDisplayName(grant_id, row.project_name)
  const existingDonor = donorsByName.get(donorName.toLowerCase())
  const now = new Date().toISOString()
  return {
    grant_id,
    donor: {
      name: donorName,
      short_name: donorShortName(grant_id),
      exists: Boolean(existingDonor),
      id: existingDonor?.id,
    },
    payload: {
      grant_id,
      project_id: row.project_id ?? null,
      project_name: row.project_name ?? null,
      grant_start_date: row.grant_start_date ?? null,
      grant_end_date: row.grant_end_date ?? null,
      status: row.status ?? null,
      donor_name: donorName,
      partner_name: 'P2H',
      sync_status: SYNC_STATUS.LEGACY,
      ...financialFromFdw(row),
      updated_at: now,
    },
  }
}

async function fetchAll<T>(
  supabase: SupabaseClient,
  table: string,
  select: string
): Promise<T[]> {
  const rows: T[] = []
  let from = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + pageSize - 1)
    if (error) throw error
    if (!data?.length) break
    rows.push(...(data as T[]))
    if (data.length < pageSize) break
    from += pageSize
  }
  return rows
}

async function ensureDonor(
  supabase: SupabaseClient,
  donor: InsertPlan['donor']
): Promise<string> {
  if (donor.id) return donor.id
  const { data, error } = await supabase
    .from('donors')
    .insert({
      name: donor.name,
      short_name: donor.short_name,
      status: 'active',
    })
    .select('id')
    .single()
  if (error) throw new Error(`Donor insert failed (${donor.name}): ${error.message}`)
  return data.id
}

/**
 * Pull FDW `grants` into `grants_grid_view`.
 * Inserts new grants; updates only Airtable-owned financial fields on existing rows.
 */
export async function pullGrantsFromFdw(
  options: PullGrantsFromFdwOptions
): Promise<PullGrantsFromFdwResult> {
  const { supabase, dryRun = false } = options

  const [fdwRows, canonicalRows, donorRows] = await Promise.all([
    fetchAll<FdwGrant>(
      supabase,
      'grants',
      'grant_id, donor_name, partner_name, project_name, grant_start_date, grant_end_date, status, project_id, total_transferred_amount_usd, sum_activity_amount, sum_transfer_fee_amount'
    ),
    fetchAll<CanonicalGrant>(
      supabase,
      'grants_grid_view',
      'id, grant_id, total_transferred_amount_usd, sum_activity_amount, sum_transfer_fee_amount'
    ),
    fetchAll<DonorRow>(supabase, 'donors', 'id, name, short_name'),
  ])

  const donorsByName = new Map<string, DonorRow>()
  for (const d of donorRows) {
    donorsByName.set(d.name.toLowerCase(), d)
  }

  const canonicalByGrantId = new Map<string, CanonicalGrant>()
  for (const row of canonicalRows) {
    const key = normGrantId(row.grant_id)
    if (key) canonicalByGrantId.set(key, row)
  }

  const toInsert: InsertPlan[] = []
  const toUpdate: Array<{
    grant_id: string
    id: string
    changes: Record<string, FieldChange>
    payload: FinancialPayload
  }> = []
  const skipped: string[] = []
  let unchanged = 0

  for (const fdw of fdwRows) {
    const grantId = normGrantId(fdw.grant_id)
    if (!grantId) continue
    if (SKIP_GRANT_IDS.has(grantId)) {
      skipped.push(`${grantId} (canonical-only)`)
      continue
    }

    const existing = canonicalByGrantId.get(grantId)
    if (!existing) {
      toInsert.push(buildInsertPlan(fdw, donorsByName))
      continue
    }

    const financial = financialFromFdw(fdw)
    const changes: Record<string, FieldChange> = {}
    for (const key of AIRTABLE_OWNED_FIELDS) {
      const from = existing[key]
      const to = financial[key]
      if (!eq(from, to)) changes[key] = { from, to }
    }

    if (Object.keys(changes).length === 0) {
      unchanged++
    } else {
      toUpdate.push({
        grant_id: grantId,
        id: existing.id,
        changes,
        payload: { ...financial, updated_at: new Date().toISOString() },
      })
    }
  }

  const result: PullGrantsFromFdwResult = {
    dryRun,
    fdwCount: fdwRows.length,
    canonicalCount: canonicalRows.length,
    inserted: 0,
    updated: 0,
    unchanged,
    skipped,
    insertPlans: toInsert.map((p) => ({
      grant_id: p.grant_id,
      donor: p.donor.name,
      newDonor: !p.donor.exists,
    })),
    updatePlans: toUpdate.map(({ grant_id, id, changes }) => ({ grant_id, id, changes })),
    errors: [],
  }

  if (dryRun) {
    return result
  }

  for (const plan of toInsert) {
    try {
      const donorId = await ensureDonor(supabase, plan.donor)
      const { error } = await supabase.from('grants_grid_view').insert({
        ...plan.payload,
        donor_id: donorId,
        donor_name: plan.donor.name,
      })
      if (error) {
        result.errors.push(`Insert ${plan.grant_id}: ${error.message}`)
      } else {
        result.inserted++
      }
    } catch (err) {
      result.errors.push(
        `Insert ${plan.grant_id}: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  for (const { grant_id, id, payload } of toUpdate) {
    const { error } = await supabase.from('grants_grid_view').update(payload).eq('id', id)
    if (error) {
      result.errors.push(`Update ${grant_id}: ${error.message}`)
    } else {
      result.updated++
    }
  }

  return result
}
