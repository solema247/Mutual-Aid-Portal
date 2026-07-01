/**
 * Phase 1 — decisions: sync public.distribution_decision (FDW) → distribution_decision_master_sheet_1.
 *
 *   npx tsx scripts/cutover/backfill-decisions-from-fdw.ts                 # dry-run
 *   npx tsx scripts/cutover/backfill-decisions-from-fdw.ts --inserts-only --apply
 *   npx tsx scripts/cutover/backfill-decisions-from-fdw.ts --updates-only --apply
 *   npx tsx scripts/cutover/backfill-decisions-from-fdw.ts --apply
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'

config({ path: resolve(process.cwd(), '.env.local') })

const APPLY = process.argv.includes('--apply')
const INSERTS_ONLY = process.argv.includes('--inserts-only')
const UPDATES_ONLY = process.argv.includes('--updates-only')

type FdwDecision = {
  id: string | null
  decision_id: string | null
  decision_id_proposed: unknown
  partner: unknown
  grant_name: unknown
  decision_amount: number | null
  sum_allocation_amount: number | null
  decision_date: string | null
  file_name: string | null
  file_link: string | null
  fund_request: unknown
  transfer_segment: unknown
  allocation_id: unknown
  notes: string | null
  restriction: string | null
}

type CanonicalDecision = {
  id: string
  decision_id_proposed: string | null
  decision_id: string | null
  partner: string | null
  grant_name: string | null
  decision_amount: number | null
  sum_allocation_amount: number | null
  decision_date: string | null
  file_name: string | null
  file_link: string | null
  fund_request: string | null
  transfer_segment: string | null
  allocation_id: string | null
  notes: string | null
  restriction: string | null
  airtable_record_id: string | null
}

type DecisionPayload = {
  decision_id_proposed: string
  decision_id: string | null
  partner: string | null
  grant_name: string | null
  decision_amount: number | null
  sum_allocation_amount: number | null
  decision_date: string | null
  file_name: string | null
  file_link: string | null
  fund_request: string | null
  transfer_segment: string | null
  allocation_id: string | null
  notes: string | null
  restriction: string | null
  airtable_record_id: string | null
  updated_at: string
}

function isAirtableRecId(value: string | null | undefined): boolean {
  return !!value && /^rec[A-Za-z0-9]+$/.test(value.trim())
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

function proposedKey(row: FdwDecision): string | null {
  const key = jsonbToText(row.decision_id_proposed)
  return key?.trim() || null
}

function partnerFromProposed(proposed: string): string | null {
  const parts = proposed.split('.')
  if (parts.length >= 2 && parts[0] === 'LCC') return parts[1]
  return null
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** FDW linked-record fields are rec… ids — keep canonical text on updates; derive partner on inserts. */
function linkedText(
  raw: string | null,
  existing: CanonicalDecision | undefined,
  proposed: string,
  field: 'partner' | 'fund_request' | 'transfer_segment' | 'allocation_id'
): string | null {
  if (existing) {
    const current = existing[field]
    if (isAirtableRecId(raw)) return current
    return raw ?? current
  }
  if (field === 'partner' && isAirtableRecId(raw)) return partnerFromProposed(proposed)
  if (isAirtableRecId(raw)) return null
  return raw
}

function findExistingCanonical(
  fdw: FdwDecision,
  proposed: string,
  canonicalByAirtableId: Map<string, CanonicalDecision>,
  canonicalByProposed: Map<string, CanonicalDecision>,
  canonicalByDecisionId: Map<string, CanonicalDecision[]>,
  usedCanonicalIds: Set<string>
): CanonicalDecision | undefined {
  if (fdw.id) {
    const byRec = canonicalByAirtableId.get(fdw.id)
    if (byRec && !usedCanonicalIds.has(byRec.id)) return byRec
  }

  const byProposed = canonicalByProposed.get(proposed)
  if (byProposed && !usedCanonicalIds.has(byProposed.id)) return byProposed

  // FDW duplicate proposed id → canonical suffix row (e.g. Flex-2 where decision_id = Flex)
  for (const row of canonicalByDecisionId.get(proposed) ?? []) {
    if (usedCanonicalIds.has(row.id)) continue
    if (row.decision_id_proposed?.trim() !== proposed) return row
  }

  return undefined
}

function payloadFromFdw(
  row: FdwDecision,
  proposed: string,
  existing?: CanonicalDecision
): DecisionPayload {
  const decisionId = (row.decision_id?.trim() || null) ?? proposed
  const rawGrantName = jsonbToText(row.grant_name)
  const canonicalProposed = existing?.decision_id_proposed?.trim()
  const decisionIdProposed =
    canonicalProposed && canonicalProposed !== proposed ? canonicalProposed : proposed

  return {
    decision_id_proposed: decisionIdProposed,
    decision_id: decisionId,
    partner: linkedText(jsonbToText(row.partner), existing, proposed, 'partner'),
    grant_name:
      existing && (isAirtableRecId(rawGrantName) || !rawGrantName)
        ? existing.grant_name
        : rawGrantName,
    decision_amount: num(row.decision_amount),
    sum_allocation_amount: num(row.sum_allocation_amount),
    decision_date: row.decision_date ?? existing?.decision_date ?? null,
    file_name: row.file_name ?? existing?.file_name ?? null,
    file_link: row.file_link ?? existing?.file_link ?? null,
    fund_request: linkedText(jsonbToText(row.fund_request), existing, proposed, 'fund_request'),
    transfer_segment: linkedText(
      jsonbToText(row.transfer_segment),
      existing,
      proposed,
      'transfer_segment'
    ),
    allocation_id: linkedText(jsonbToText(row.allocation_id), existing, proposed, 'allocation_id'),
    notes: row.notes ?? existing?.notes ?? null,
    restriction: row.restriction ?? existing?.restriction ?? null,
    airtable_record_id: row.id?.trim() || existing?.airtable_record_id || null,
    updated_at: new Date().toISOString(),
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

  const fdwSelect =
    'id, decision_id, decision_id_proposed, partner, grant_name, decision_amount, sum_allocation_amount, decision_date, file_name, file_link, fund_request, transfer_segment, allocation_id, notes, restriction'

  const [fdwRows, canonicalRows] = await Promise.all([
    fetchAll<FdwDecision>('distribution_decision', fdwSelect),
    fetchAll<CanonicalDecision>(
      'distribution_decision_master_sheet_1',
      'id, decision_id_proposed, decision_id, partner, grant_name, decision_amount, sum_allocation_amount, decision_date, file_name, file_link, fund_request, transfer_segment, allocation_id, notes, restriction, airtable_record_id'
    ),
  ])

  const canonicalByProposed = new Map<string, CanonicalDecision>()
  const canonicalByAirtableId = new Map<string, CanonicalDecision>()
  const canonicalByDecisionId = new Map<string, CanonicalDecision[]>()
  for (const row of canonicalRows) {
    const key = row.decision_id_proposed?.trim()
    if (key) canonicalByProposed.set(key, row)
    if (row.airtable_record_id) canonicalByAirtableId.set(row.airtable_record_id, row)
    const decisionId = row.decision_id?.trim()
    if (decisionId) {
      const list = canonicalByDecisionId.get(decisionId) ?? []
      list.push(row)
      canonicalByDecisionId.set(decisionId, list)
    }
  }

  const toInsert: Array<{ proposed: string; fdwRec: string | null; payload: DecisionPayload }> = []
  const toUpdate: Array<{
    proposed: string
    fdwRec: string | null
    id: string
    changes: Record<string, { from: unknown; to: unknown }>
    payload: DecisionPayload
  }> = []
  const unchanged: string[] = []
  const skipped: string[] = []
  const manualReview: string[] = []
  const usedCanonicalIds = new Set<string>()
  const usedProposedForInsert = new Set<string>()

  for (const fdw of fdwRows) {
    const proposed = proposedKey(fdw)
    if (!proposed) {
      skipped.push(`FDW rec ${fdw.id ?? '?'} — missing or #ERROR! decision_id_proposed`)
      continue
    }

    const existing = findExistingCanonical(
      fdw,
      proposed,
      canonicalByAirtableId,
      canonicalByProposed,
      canonicalByDecisionId,
      usedCanonicalIds
    )

    const payload = payloadFromFdw(fdw, proposed, existing)

    if (!existing) {
      if (usedProposedForInsert.has(proposed)) {
        manualReview.push(
          `FDW rec ${fdw.id ?? '?'} (${proposed}) — duplicate FDW proposed id; no canonical suffix row`
        )
        continue
      }
      usedProposedForInsert.add(proposed)
      toInsert.push({ proposed, fdwRec: fdw.id, payload })
      continue
    }

    usedCanonicalIds.add(existing.id)
    const displayKey =
      existing.decision_id_proposed?.trim() !== proposed
        ? `${proposed} → ${existing.decision_id_proposed}`
        : proposed

    const changes: Record<string, { from: unknown; to: unknown }> = {}
    const check = (key: keyof DecisionPayload) => {
      if (key === 'updated_at' || key === 'decision_id_proposed') return
      const from = existing[key as keyof CanonicalDecision]
      const to = payload[key]
      if (!eq(from, to)) changes[key] = { from, to }
    }
    check('decision_id')
    check('partner')
    check('grant_name')
    check('decision_amount')
    check('sum_allocation_amount')
    check('decision_date')
    check('file_name')
    check('file_link')
    check('fund_request')
    check('transfer_segment')
    check('allocation_id')
    check('notes')
    check('restriction')
    check('airtable_record_id')

    if (Object.keys(changes).length === 0) {
      unchanged.push(displayKey)
    } else {
      toUpdate.push({ proposed: displayKey, fdwRec: fdw.id, id: existing.id, changes, payload })
    }
  }

  const canonicalOnly = canonicalRows
    .filter((r) => !usedCanonicalIds.has(r.id))
    .map((r) => `${r.decision_id_proposed?.trim() ?? '—'} (decision_id: ${r.decision_id ?? '—'})`)

  console.log(`FDW decisions: ${fdwRows.length}`)
  console.log(`Canonical decisions: ${canonicalRows.length}`)
  console.log(`To insert: ${toInsert.length}`)
  console.log(`To update: ${toUpdate.length}`)
  console.log(`Unchanged: ${unchanged.length}`)
  console.log(`Skipped (FDW): ${skipped.length}`)
  console.log(`Manual review: ${manualReview.length}`)
  console.log(`Canonical-only (left untouched): ${canonicalOnly.length}\n`)

  console.log('Preserved on updates: id (uuid), partner/fund_request/transfer_segment/allocation_id when FDW has rec… ids')
  console.log('Preserved on updates: file_name/file_link when FDW null')
  console.log('Match key: airtable_record_id → decision_id_proposed → suffix row (decision_id match)\n')

  if (toInsert.length) {
    console.log('--- INSERT ---')
    for (const { proposed, fdwRec, payload } of toInsert) {
      console.log(`  + ${proposed}`)
      console.log(`    airtable_record_id: ${fdwRec}`)
      console.log(`    partner: ${payload.partner} | amount: ${payload.decision_amount} | sum_alloc: ${payload.sum_allocation_amount}`)
    }
    console.log()
  }

  if (toUpdate.length) {
    console.log('--- UPDATE ---')
    for (const { proposed, fdwRec, id, changes } of toUpdate) {
      console.log(`  ~ ${proposed} (uuid ${id}, rec ${fdwRec})`)
      for (const [field, { from, to }] of Object.entries(changes)) {
        console.log(`      ${field}: ${JSON.stringify(from)} → ${JSON.stringify(to)}`)
      }
    }
    console.log()
  }

  if (skipped.length) {
    console.log('--- SKIPPED (FDW) ---')
    for (const s of skipped) console.log(`  ${s}`)
    console.log()
  }

  if (manualReview.length) {
    console.log('--- MANUAL REVIEW ---')
    for (const s of manualReview) console.log(`  ${s}`)
    console.log()
  }

  if (canonicalOnly.length) {
    console.log('--- CANONICAL ONLY (not deleted) ---')
    for (const p of canonicalOnly) console.log(`  ${p}`)
    console.log()
  }

  if (!APPLY) {
    console.log('No changes written. Re-run with --apply to execute.')
    return
  }

  const supabase = getSupabaseAdmin()
  let insertOk = 0
  let updateOk = 0

  for (const { proposed, payload } of toInsert) {
    if (UPDATES_ONLY) continue
    const { error } = await supabase.from('distribution_decision_master_sheet_1').insert({
      ...payload,
      sync_status: 'pending',
    })
    if (error) console.error(`Insert failed for ${proposed}:`, error.message)
    else insertOk++
  }

  for (const { proposed, id, payload } of toUpdate) {
    if (INSERTS_ONLY) continue
    const { error } = await supabase.from('distribution_decision_master_sheet_1').update(payload).eq('id', id)
    if (error) console.error(`Update failed for ${proposed}:`, error.message)
    else updateOk++
  }

  console.log(`Applied: ${UPDATES_ONLY ? 0 : insertOk} inserted, ${INSERTS_ONLY ? 0 : updateOk} updated`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
