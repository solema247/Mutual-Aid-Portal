/**
 * Phase 1 — grants only: sync public.grants (FDW) → grants_grid_view.
 *
 *   npx tsx scripts/cutover/backfill-grants-from-fdw.ts                    # dry-run (default)
 *   npx tsx scripts/cutover/backfill-grants-from-fdw.ts --donors-only      # dry-run donors only
 *   npx tsx scripts/cutover/backfill-grants-from-fdw.ts --donors-only --apply
 *   npx tsx scripts/cutover/backfill-grants-from-fdw.ts --inserts-only --apply
 *   npx tsx scripts/cutover/backfill-grants-from-fdw.ts --updates-only --apply
 *   npx tsx scripts/cutover/backfill-grants-from-fdw.ts --apply            # full write
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'

config({ path: resolve(process.cwd(), '.env.local') })

const APPLY = process.argv.includes('--apply')
const DONORS_ONLY = process.argv.includes('--donors-only')
const INSERTS_ONLY = process.argv.includes('--inserts-only')
const UPDATES_ONLY = process.argv.includes('--updates-only')

/** Canonical-only grants — never insert/update from FDW */
const SKIP_GRANT_IDS = new Set(['Avaaz 2'])

/** Donor short_name for new grant inserts (grant_id → short_name) */
const DONOR_SHORT_NAMES: Record<string, string> = {
  'Skoll Foundation': 'SkF',
  'Silicon Valley Foundation': 'SVF',
  'Crushing Family Foundation': 'CFF',
}

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
  project_name: string | null
  grant_start_date: string | null
  grant_end_date: string | null
  status: string | null
  project_id: string | null
  total_transferred_amount_usd: number | null
  sum_activity_amount: number | null
  sum_transfer_fee_amount: number | null
  activities: string | null
  max_workplan_sequence: number | null
  donor_id: string | null
}

type UpdatablePayload = {
  project_name: string | null
  grant_start_date: string | null
  grant_end_date: string | null
  status: string | null
  total_transferred_amount_usd: number | null
  sum_activity_amount: number | null
  sum_transfer_fee_amount: number | null
  updated_at: string
}

function normGrantId(id: string | null | undefined): string {
  return (id ?? '').trim()
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function payloadFromFdw(row: FdwGrant): UpdatablePayload {
  return {
    project_name: row.project_name ?? null,
    grant_start_date: row.grant_start_date ?? null,
    grant_end_date: row.grant_end_date ?? null,
    status: row.status ?? null,
    total_transferred_amount_usd: num(row.total_transferred_amount_usd),
    sum_activity_amount: num(row.sum_activity_amount),
    sum_transfer_fee_amount: num(row.sum_transfer_fee_amount),
    updated_at: new Date().toISOString(),
  }
}

type DonorRow = { id: string; name: string; short_name: string | null }

type InsertPlan = {
  grant_id: string
  donor: { name: string; short_name: string; exists: boolean; id?: string }
  payload: UpdatablePayload & {
    grant_id: string
    project_id: string | null
    donor_id?: string
    donor_name: string
    partner_name: string
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
  const donor = {
    name: donorName,
    short_name: donorShortName(grant_id),
    exists: Boolean(existingDonor),
    id: existingDonor?.id,
  }
  return {
    grant_id,
    donor,
    payload: {
      grant_id,
      project_id: row.project_id ?? null,
      donor_id: existingDonor?.id,
      donor_name: donorName,
      partner_name: 'P2H',
      ...payloadFromFdw(row),
    },
  }
}

async function ensureDonor(
  supabase: ReturnType<typeof getSupabaseAdmin>,
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

function eq(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null && b == null) return true
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) < 0.01
  }
  return String(a ?? '') === String(b ?? '')
}

async function fetchAll<T>(table: string, select: string): Promise<T[]> {
  const supabase = getSupabaseAdmin()
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

async function main() {
  console.log(APPLY ? '=== APPLY MODE ===' : '=== DRY RUN (no writes) ===\n')

  const [fdwRows, canonicalRows, donorRows] = await Promise.all([
    fetchAll<FdwGrant>(
      'grants',
      'grant_id, donor_name, partner_name, project_name, grant_start_date, grant_end_date, status, project_id, total_transferred_amount_usd, sum_activity_amount, sum_transfer_fee_amount'
    ),
    fetchAll<CanonicalGrant>(
      'grants_grid_view',
      'id, grant_id, project_name, grant_start_date, grant_end_date, status, project_id, total_transferred_amount_usd, sum_activity_amount, sum_transfer_fee_amount, activities, max_workplan_sequence, donor_id'
    ),
    fetchAll<DonorRow>('donors', 'id, name, short_name'),
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
    changes: Record<string, { from: unknown; to: unknown }>
    payload: UpdatablePayload
  }> = []
  const unchanged: string[] = []
  const skipped: string[] = []

  for (const fdw of fdwRows) {
    const grantId = normGrantId(fdw.grant_id)
    if (!grantId) continue
    if (SKIP_GRANT_IDS.has(grantId)) {
      skipped.push(`${grantId} (canonical-only — skipped)`)
      continue
    }

    const existing = canonicalByGrantId.get(grantId)
    const payload = payloadFromFdw(fdw)

    if (!existing) {
      toInsert.push(buildInsertPlan(fdw, donorsByName))
      continue
    }

    const changes: Record<string, { from: unknown; to: unknown }> = {}
    const check: (key: keyof UpdatablePayload) => void = (key) => {
      if (key === 'updated_at') return
      const from = existing[key as keyof CanonicalGrant]
      const to = payload[key]
      if (!eq(from, to)) changes[key] = { from, to }
    }
    check('project_name')
    check('grant_start_date')
    check('grant_end_date')
    check('status')
    check('total_transferred_amount_usd')
    check('sum_activity_amount')
    check('sum_transfer_fee_amount')

    if (Object.keys(changes).length === 0) {
      unchanged.push(grantId)
    } else {
      toUpdate.push({ grant_id: grantId, id: existing.id, changes, payload })
    }
  }

  console.log(`FDW grants: ${fdwRows.length}`)
  console.log(`Canonical grants: ${canonicalRows.length}`)
  console.log(`To insert: ${toInsert.length}`)
  console.log(`To update: ${toUpdate.length}`)
  console.log(`Unchanged: ${unchanged.length}`)
  console.log(`Skipped: ${skipped.length}\n`)

  console.log('Preserved on updates: id, activities, max_workplan_sequence, donor_id, project_id')
  console.log('Deferred on updates (FDW jsonb rec… links): donor_name, partner_name, transfer_segment, allocations')
  console.log('New grants: create donor in public.donors first, then grant with donor_id FK\n')

  const donorsToCreate = toInsert.filter((p) => !p.donor.exists)
  if (donorsToCreate.length) {
    console.log('--- DONORS TO CREATE (before grant insert) ---')
    for (const { grant_id, donor } of donorsToCreate) {
      console.log(`  + donors: "${donor.name}" (short_name: ${donor.short_name}) → for grant ${grant_id}`)
    }
    console.log()
  }

  if (toInsert.length) {
    console.log('--- GRANT INSERT ---')
    for (const { grant_id, donor, payload } of toInsert) {
      console.log(`  + ${grant_id}`)
      console.log(`    donor: ${donor.exists ? `existing uuid ${donor.id}` : `NEW "${donor.name}"`}`)
      console.log(`    ${JSON.stringify(payload, null, 2).split('\n').join('\n    ')}`)
    }
    console.log()
  }

  if (toUpdate.length) {
    console.log('--- UPDATE ---')
    for (const { grant_id, id, changes } of toUpdate) {
      console.log(`  ~ ${grant_id} (uuid ${id})`)
      for (const [field, { from, to }] of Object.entries(changes)) {
        console.log(`      ${field}: ${JSON.stringify(from)} → ${JSON.stringify(to)}`)
      }
    }
    console.log()
  }

  if (skipped.length) {
    console.log('--- SKIPPED ---')
    for (const s of skipped) console.log(`  ${s}`)
    console.log()
  }

  if (!APPLY) {
    console.log('No changes written. Re-run with --apply to execute.')
    return
  }

  const supabase = getSupabaseAdmin()

  if (DONORS_ONLY) {
    let donorsOk = 0
    for (const { grant_id, donor } of donorsToCreate) {
      try {
        const id = await ensureDonor(supabase, donor)
        console.log(`Created/found donor "${donor.name}" → ${id} (for grant ${grant_id})`)
        donorsOk++
      } catch (err) {
        console.error(`Donor failed for ${grant_id}:`, err instanceof Error ? err.message : err)
      }
    }
    console.log(`Applied: ${donorsOk} donor(s)`)
    return
  }

  let insertOk = 0
  let updateOk = 0

  for (const plan of toInsert) {
    if (UPDATES_ONLY) continue
    try {
      const donorId = await ensureDonor(supabase, plan.donor)
      const { error } = await supabase.from('grants_grid_view').insert({
        ...plan.payload,
        donor_id: donorId,
        donor_name: plan.donor.name,
      })
      if (error) {
        console.error(`Insert failed for ${plan.grant_id}:`, error.message)
      } else {
        insertOk++
      }
    } catch (err) {
      console.error(`Insert failed for ${plan.grant_id}:`, err instanceof Error ? err.message : err)
    }
  }

  for (const { grant_id, id, payload } of toUpdate) {
    if (INSERTS_ONLY) continue
    const { error } = await supabase.from('grants_grid_view').update(payload).eq('id', id)
    if (error) {
      console.error(`Update failed for ${grant_id}:`, error.message)
    } else {
      updateOk++
    }
  }

  console.log(
    `Applied: ${UPDATES_ONLY ? 0 : insertOk} inserted, ${INSERTS_ONLY ? 0 : updateOk} updated`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
