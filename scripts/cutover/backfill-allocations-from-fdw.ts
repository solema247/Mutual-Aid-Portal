/**
 * Phase 1 — allocations: sync public.allocations (FDW) → allocations_by_date.
 *
 *   npx tsx scripts/cutover/backfill-allocations-from-fdw.ts                 # dry-run
 *   npx tsx scripts/cutover/backfill-allocations-from-fdw.ts --inserts-only --apply
 *   npx tsx scripts/cutover/backfill-allocations-from-fdw.ts --updates-only --apply
 *   npx tsx scripts/cutover/backfill-allocations-from-fdw.ts --apply
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'

config({ path: resolve(process.cwd(), '.env.local') })

const APPLY = process.argv.includes('--apply')
const INSERTS_ONLY = process.argv.includes('--inserts-only')
const UPDATES_ONLY = process.argv.includes('--updates-only')

/** FDW decisions excluded from backfill — skip allocations linked to these recs */
const SKIP_DECISION_RECS = new Set(['recKhnE6o5ktuEteU', 'recxnYC1Zo9rc2t1y'])

type FdwAllocation = {
  allocation_id: unknown
  decision_id: unknown
  decision_date: unknown
  decision_amount: unknown
  grant_id: unknown
  partner: unknown
  state: string | null
  allocation_amount: number | null
  percent_decision_amount: number | null
  restriction: string | null
  serial: number | null
  notes: string | null
  status: string | null
  flow_oversight: string | null
  decision_maker: string | null
}

type DecisionLookup = {
  decision_id_proposed: string
  decision_amount: number | null
  partner: string | null
  restriction: string | null
}

type CanonicalAllocation = {
  Allocation_ID: string
  Decision_ID: string | null
  Decision_Date: string | null
  State: string | null
  'Allocation Amount': number | null
  '%_Decision_Amount': number | null
  Decision_Amount: number | null
  Grant_ID: string | null
  Partner: string | null
  Restriction: string | null
  Serial: number | null
  Notes: string | null
  Status: string | null
  'Flow Oversight': string | null
  'Decision Maker': string | null
  airtable_record_id: string | null
}

type AllocationPayload = {
  Allocation_ID: string
  Decision_ID: string | null
  Decision_Date: string | null
  State: string | null
  'Allocation Amount': number | null
  '%_Decision_Amount': number | null
  Decision_Amount: number | null
  Grant_ID: string | null
  Partner: string | null
  Restriction: string | null
  Serial: number | null
  Notes: string | null
  Status: string | null
  'Flow Oversight': string | null
  'Decision Maker': string | null
}

function jsonbToText(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') {
    const t = value.trim().replace(/^"|"$/g, '')
    if (!t || t.includes('#ERROR!')) return null
    return t
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return null
    return jsonbToText(value[0])
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if ('error' in obj) return null
    return jsonbToText(Object.values(obj)[0])
  }
  const s = String(value).trim()
  return s && !s.includes('#ERROR!') ? s : null
}

function allocationIdKey(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'object' && !Array.isArray(value) && 'error' in (value as object)) {
    return null
  }
  return jsonbToText(value)
}

function decisionRecId(value: unknown): string | null {
  return jsonbToText(value)
}

function isAirtableRecId(value: string | null | undefined): boolean {
  return !!value && /^rec[A-Za-z0-9]+$/.test(value.trim())
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function normalizeState(state: string | null | undefined): string | null {
  if (state == null) return null
  const trimmed = String(state).trim()
  if (!trimmed) return null
  const mappings: Record<string, string> = {
    'Al Jazeera': 'Al Jazirah',
    Gadarif: 'Gadaref',
    Sinar: 'Sennar',
  }
  if (mappings[trimmed]) return mappings[trimmed]
  const lower = trimmed.toLowerCase()
  for (const [key, value] of Object.entries(mappings)) {
    if (key.toLowerCase() === lower) return value
  }
  return trimmed
}

function percentOfDecision(
  amount: number | null,
  decisionAmount: number | null,
  fdwPercent: number | null
): number | null {
  if (fdwPercent != null && Number.isFinite(fdwPercent)) return fdwPercent
  if (amount != null && decisionAmount != null && decisionAmount !== 0) {
    return (amount / decisionAmount) * 100
  }
  return null
}

function payloadFromFdw(
  row: FdwAllocation,
  allocKey: string,
  decisionId: string | null,
  decision: DecisionLookup | undefined,
  existing?: CanonicalAllocation
): AllocationPayload {
  const amount = num(row.allocation_amount)
  const fdwDecisionAmount = num(jsonbToText(row.decision_amount))
  const decisionAmount =
    fdwDecisionAmount ?? decision?.decision_amount ?? existing?.Decision_Amount ?? null
  const rawPartner = jsonbToText(row.partner)

  return {
    Allocation_ID: allocKey,
    Decision_ID: decisionId,
    Decision_Date: jsonbToText(row.decision_date) ?? existing?.Decision_Date ?? null,
    State: normalizeState(row.state) ?? existing?.State ?? null,
    'Allocation Amount': amount,
    '%_Decision_Amount': percentOfDecision(
      amount,
      decisionAmount,
      num(row.percent_decision_amount)
    ),
    Decision_Amount: decisionAmount,
    Grant_ID: existing?.Grant_ID ?? jsonbToText(row.grant_id),
    Partner:
      existing && isAirtableRecId(rawPartner)
        ? existing.Partner
        : rawPartner ?? existing?.Partner ?? decision?.partner ?? null,
    Restriction: row.restriction ?? existing?.Restriction ?? decision?.restriction ?? null,
    Serial: row.serial ?? existing?.Serial ?? null,
    Notes: row.notes ?? existing?.Notes ?? null,
    Status: row.status ?? existing?.Status ?? null,
    'Flow Oversight': row.flow_oversight ?? existing?.['Flow Oversight'] ?? null,
    'Decision Maker': row.decision_maker ?? existing?.['Decision Maker'] ?? null,
  }
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
  while (true) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + 999)
    if (error) throw error
    if (!data?.length) break
    rows.push(...(data as T[]))
    if (data.length < 1000) break
    from += 1000
  }
  return rows
}

async function main() {
  console.log(APPLY ? '=== APPLY MODE ===' : '=== DRY RUN (no writes) ===\n')

  const fdwSelect =
    'allocation_id, decision_id, decision_date, decision_amount, grant_id, partner, state, allocation_amount, percent_decision_amount, restriction, serial, notes, status, flow_oversight, decision_maker'

  const canonSelect =
    'Allocation_ID, Decision_ID, Decision_Date, State, "Allocation Amount", "%_Decision_Amount", Decision_Amount, Grant_ID, Partner, Restriction, Serial, Notes, Status, "Flow Oversight", "Decision Maker", airtable_record_id'

  const [fdwRows, canonRows, decisions] = await Promise.all([
    fetchAll<FdwAllocation>('allocations', fdwSelect),
    fetchAll<CanonicalAllocation>('allocations_by_date', canonSelect),
    fetchAll<{
      airtable_record_id: string | null
      decision_id_proposed: string | null
      decision_amount: number | null
      partner: string | null
      restriction: string | null
    }>(
      'distribution_decision_master_sheet_1',
      'airtable_record_id, decision_id_proposed, decision_amount, partner, restriction'
    ),
  ])

  const decisionByRec = new Map<string, DecisionLookup>()
  for (const d of decisions) {
    if (!d.airtable_record_id || !d.decision_id_proposed) continue
    decisionByRec.set(d.airtable_record_id, {
      decision_id_proposed: d.decision_id_proposed,
      decision_amount: d.decision_amount,
      partner: d.partner,
      restriction: d.restriction,
    })
  }

  const canonByKey = new Map(canonRows.map((r) => [r.Allocation_ID.trim(), r]))

  const toInsert: Array<{ key: string; payload: AllocationPayload }> = []
  const toUpdate: Array<{
    key: string
    changes: Record<string, { from: unknown; to: unknown }>
    payload: AllocationPayload
  }> = []
  const unchanged: string[] = []
  const skipped: string[] = []
  const matchedKeys = new Set<string>()

  for (const fdw of fdwRows) {
    const allocKey = allocationIdKey(fdw.allocation_id)
    if (!allocKey) {
      skipped.push('FDW row — missing, #ERROR!, or invalid allocation_id')
      continue
    }

    matchedKeys.add(allocKey)

    const decisionRec = decisionRecId(fdw.decision_id)
    if (!decisionRec) {
      skipped.push(`${allocKey} — missing decision_id link`)
      continue
    }
    if (SKIP_DECISION_RECS.has(decisionRec)) {
      skipped.push(`${allocKey} — linked to excluded decision ${decisionRec}`)
      continue
    }

    const decision = decisionByRec.get(decisionRec)
    const decisionId = decision?.decision_id_proposed ?? null
    if (!decisionId) {
      skipped.push(`${allocKey} — no canonical decision for ${decisionRec}`)
      continue
    }

    const existing = canonByKey.get(allocKey)
    const payload = payloadFromFdw(fdw, allocKey, decisionId, decision, existing)

    if (!existing) {
      toInsert.push({ key: allocKey, payload })
      continue
    }

    const changes: Record<string, { from: unknown; to: unknown }> = {}
    const check = (field: keyof AllocationPayload) => {
      if (field === 'Allocation_ID') return
      const from = existing[field as keyof CanonicalAllocation]
      const to = payload[field]
      if (!eq(from, to)) changes[field] = { from, to }
    }
    check('Decision_ID')
    check('Decision_Date')
    check('State')
    check('Allocation Amount')
    check('%_Decision_Amount')
    check('Decision_Amount')
    check('Grant_ID')
    check('Partner')
    check('Restriction')
    check('Serial')
    check('Notes')
    check('Status')
    check('Flow Oversight')
    check('Decision Maker')

    if (Object.keys(changes).length === 0) {
      unchanged.push(allocKey)
    } else {
      toUpdate.push({ key: allocKey, changes, payload })
    }
  }

  const canonicalOnly = canonRows
    .filter((r) => !matchedKeys.has(r.Allocation_ID.trim()))
    .map((r) => r.Allocation_ID)

  const fdwTotal = fdwRows.reduce((s, r) => s + (num(r.allocation_amount) ?? 0), 0)
  const insertTotal = toInsert.reduce((s, { payload }) => s + (payload['Allocation Amount'] ?? 0), 0)
  const canonTotal = canonRows.reduce((s, r) => s + (r['Allocation Amount'] ?? 0), 0)

  console.log(`FDW allocations: ${fdwRows.length}`)
  console.log(`Canonical allocations: ${canonRows.length}`)
  console.log(`To insert: ${toInsert.length}`)
  console.log(`To update: ${toUpdate.length}`)
  console.log(`Unchanged: ${unchanged.length}`)
  console.log(`Skipped (FDW): ${skipped.length}`)
  console.log(`Canonical-only (left untouched): ${canonicalOnly.length}`)
  console.log(`FDW sum(allocation_amount): ${fdwTotal.toLocaleString()}`)
  console.log(`Canonical sum today: ${canonTotal.toLocaleString()}`)
  console.log(`Insert amount total: ${insertTotal.toLocaleString()}\n`)

  console.log('Match key: Allocation_ID')
  console.log('Decision link: FDW decision_id rec… → decision_id_proposed via airtable_record_id')
  console.log('State normalization: Sinar→Sennar, Gadarif→Gadaref, Al Jazeera→Al Jazirah\n')

  if (toInsert.length) {
    console.log('--- INSERT (first 20) ---')
    for (const { key, payload } of toInsert.slice(0, 20)) {
      console.log(
        `  + ${key} | Decision_ID=${payload.Decision_ID} | ${payload.State} | $${payload['Allocation Amount']}`
      )
    }
    if (toInsert.length > 20) console.log(`  ... and ${toInsert.length - 20} more`)
    console.log()
  }

  if (toUpdate.length) {
    console.log('--- UPDATE (first 20) ---')
    for (const { key, changes } of toUpdate.slice(0, 20)) {
      console.log(`  ~ ${key}`)
      for (const [field, { from, to }] of Object.entries(changes)) {
        console.log(`      ${field}: ${JSON.stringify(from)} → ${JSON.stringify(to)}`)
      }
    }
    if (toUpdate.length > 20) console.log(`  ... and ${toUpdate.length - 20} more`)
    console.log()
  }

  if (skipped.length) {
    console.log('--- SKIPPED (FDW) ---')
    for (const s of skipped) console.log(`  ${s}`)
    console.log()
  }

  if (canonicalOnly.length) {
    console.log('--- CANONICAL ONLY (not deleted) ---')
    for (const k of canonicalOnly.slice(0, 20)) console.log(`  ${k}`)
    if (canonicalOnly.length > 20) console.log(`  ... and ${canonicalOnly.length - 20} more`)
    console.log()
  }

  if (!APPLY) {
    console.log('No changes written. Re-run with --apply to execute.')
    return
  }

  const supabase = getSupabaseAdmin()
  let insertOk = 0
  let updateOk = 0

  for (const { key, payload } of toInsert) {
    if (UPDATES_ONLY) continue
    const { error } = await supabase.from('allocations_by_date').insert({
      ...payload,
      sync_status: 'pending',
    })
    if (error) console.error(`Insert failed for ${key}:`, error.message)
    else insertOk++
  }

  for (const { key, payload } of toUpdate) {
    if (INSERTS_ONLY) continue
    const { error } = await supabase
      .from('allocations_by_date')
      .update(payload)
      .eq('Allocation_ID', key)
    if (error) console.error(`Update failed for ${key}:`, error.message)
    else updateOk++
  }

  console.log(`Applied: ${UPDATES_ONLY ? 0 : insertOk} inserted, ${INSERTS_ONLY ? 0 : updateOk} updated`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
