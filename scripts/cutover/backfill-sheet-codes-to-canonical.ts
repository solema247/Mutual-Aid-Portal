/**
 * Link LoHub Google Sheet rows to AT-shaped canonical allocations, and insert
 * sheet-only groups that have no Airtable match.
 *
 * Reads data/imports/sheet-airtable-allocation-match.csv (regenerate first).
 * Skips CDP rows.
 *
 *   npx tsx scripts/cutover/backfill-sheet-codes-to-canonical.ts          # dry-run
 *   npx tsx scripts/cutover/backfill-sheet-codes-to-canonical.ts --apply  # write
 *
 * Buckets:
 * 1) matched → set google_sheet_code on Airtable Allocation_ID(s)
 * 2) unmatched + likely AT id → set google_sheet_code + review Notes on that AT row
 * 3) unmatched + no likely → create decision grouped by sheet_code + insert
 *    allocations (Allocation_ID = sheet Sequence) with "Please Review: missing a funds request"
 */
import { config } from 'dotenv'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import Papa from 'papaparse'
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'

config({ path: resolve(process.cwd(), '.env.local') })

const APPLY = process.argv.includes('--apply')

const MATCH_CSV = resolve(process.cwd(), 'data/imports/sheet-airtable-allocation-match.csv')

const NOTE_REVIEW =
  'Please Review: Allocation does not match decision document'
const NOTE_MISSING_FUNDS = 'Please Review: missing a funds request'

type MatchRow = {
  match_status: string
  sheet_code: string
  sheet_sequence: string
  airtable_allocation_id: string
  match_method: string
  partner: string
  state: string
  amount: string
  likely_airtable_series: string
  likely_airtable_allocation_id: string
  likely_airtable_state: string
  airtable_amount: string
  amount_mismatch: string
}

type CanonAlloc = {
  Allocation_ID: string
  Decision_ID: string | null
  Decision_Date: string | null
  State: string | null
  'Allocation Amount': number | null
  Decision_Amount: number | null
  Partner: string | null
  Notes: string | null
  google_sheet_code: string | null
  Serial: number | null
  sync_status: string
}

type CanonDecision = {
  decision_id_proposed: string
  decision_amount: number | null
  decision_date: string | null
  partner: string | null
  notes: string | null
  restriction: string | null
  sync_status: string
}

function isCdp(row: MatchRow): boolean {
  const partner = (row.partner || '').trim().toUpperCase()
  const code = (row.sheet_code || '').toUpperCase()
  return partner === 'CDP' || code.includes('.CDP.')
}

function parseAmount(s: string | undefined): number | null {
  if (!s || String(s).trim() === '') return null
  const n = Number(String(s).replace(/[$,]/g, '').trim())
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

function normState(s: string | null | undefined): string | null {
  if (!s) return null
  return s
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/al jazeera/gi, 'Al Jazirah')
    .replace(/gadarif/gi, 'Gadaref')
    .replace(/sinar/gi, 'Sennar')
    .replace(/cross borden/gi, 'Cross Border')
}

function fdwIds(value: string | null | undefined): string[] {
  if (!value) return []
  return value
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** YY-MM-DD → YYYY-MM-DD */
function yyMmDdToIso(yymmdd: string | null): string | null {
  if (!yymmdd || !/^\d{2}-\d{2}-\d{2}$/.test(yymmdd)) return null
  const [yy, mm, dd] = yymmdd.split('-')
  return `20${yy}-${mm}-${dd}`
}

/** Infer decision date from AT series LCC.AD.P2H.25-01-16 or sheet code date token */
function dateFromSeries(series: string | null | undefined): string | null {
  if (!series) return null
  const m = series.match(/(\d{2}-\d{2}-\d{2})$/)
  return m ? yyMmDdToIso(m[1]) : null
}

function dateFromSheetCode(code: string | null | undefined): string | null {
  if (!code) return null
  const patterns = [
    /^LCC\.AD\.[A-Za-z0-9 ]+\.(\d{2}-\d{2}-\d{4})-\d+$/,
    /^LCC\.AD\.[A-Za-z0-9 ]+\.(\d{2}-\d{2}-\d{2})-\d+$/,
    /^MAG\.AD\.[A-Za-z0-9 ]+\.(\d{2}-\d{2}-\d{2})-\d+$/,
  ]
  for (const re of patterns) {
    const m = code.match(re)
    if (!m?.[1]) continue
    const parts = m[1].split('-')
    if (parts.length !== 3) continue
    const [a, b, c] = parts
    if (c.length === 4) return `${c}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`
    if (c.length === 2) return `20${c}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`
  }
  return null
}

function appendNote(existing: string | null | undefined, note: string): string {
  const cur = (existing || '').trim()
  if (!cur) return note
  if (cur.includes(note)) return cur
  return `${cur}\n${note}`
}

function serialFromSequence(sequence: string): number | null {
  const m = sequence.match(/-(\d+)$/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
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

function jsonbToText(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') {
    const t = value.trim().replace(/^"|"$/g, '')
    if (!t || t.includes('#ERROR!')) return null
    return t
  }
  if (Array.isArray(value)) return value.length ? jsonbToText(value[0]) : null
  if (typeof value === 'object') {
    if ('error' in (value as object)) return null
    return jsonbToText(Object.values(value as object)[0])
  }
  const s = String(value).trim()
  return s && !s.includes('#ERROR!') ? s : null
}

function isAirtableRecId(value: string | null | undefined): boolean {
  return !!value && /^rec[A-Za-z0-9]+$/.test(value.trim())
}

/** LCC.P2H.2026-06-24.Flex → P2H */
function partnerFromProposed(proposed: string): string | null {
  const parts = proposed.split('.')
  if (parts.length >= 2 && parts[0] === 'LCC') return parts[1]
  return null
}

function resolvePartner(raw: unknown, proposed: string): string | null {
  const text = jsonbToText(raw)
  if (isAirtableRecId(text)) return partnerFromProposed(proposed)
  return text
}

function allocationIdKey(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'object' && !Array.isArray(value) && 'error' in (value as object)) {
    return null
  }
  return jsonbToText(value)
}

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

/** Pull missing matched AT allocations from FDW into canonical (AT-shaped). */
async function ensureDecisionsForRecs(
  decisionRecs: string[],
  decisionByRec: Map<
    string,
    { decision_id_proposed: string; decision_amount: number | null; partner: string | null; restriction: string | null }
  >,
  decisionByProposed: Map<string, unknown>,
  apply: boolean
): Promise<{ inserted: number; skipped: string[] }> {
  const missing = [...new Set(decisionRecs)].filter((r) => !decisionByRec.has(r))
  if (!missing.length) return { inserted: 0, skipped: [] }

  const fdwDecisions = await fetchAll<{
    id: string | null
    decision_id: string | null
    decision_id_proposed: unknown
    partner: unknown
    grant_name: unknown
    decision_amount: number | null
    sum_allocation_amount: number | null
    decision_date: string | null
    notes: string | null
    restriction: string | null
  }>(
    'distribution_decision',
    'id, decision_id, decision_id_proposed, partner, grant_name, decision_amount, sum_allocation_amount, decision_date, notes, restriction'
  )

  const byId = new Map(fdwDecisions.filter((d) => d.id).map((d) => [d.id!, d]))
  const skipped: string[] = []
  const toInsert: Record<string, unknown>[] = []

  for (const rec of missing) {
    const fdw = byId.get(rec)
    if (!fdw) {
      skipped.push(`${rec} — not on FDW decisions`)
      continue
    }
    let proposed = jsonbToText(fdw.decision_id_proposed)
    if (!proposed) {
      skipped.push(`${rec} — #ERROR!/missing decision_id_proposed`)
      continue
    }
    const baseProposed = proposed
    // Duplicate proposed id → Flex-2 style suffix (same pattern as Phase 1)
    if (decisionByProposed.has(proposed) || toInsert.some((r) => r.decision_id_proposed === proposed)) {
      let n = 2
      let candidate = `${baseProposed}-${n}`
      while (
        decisionByProposed.has(candidate) ||
        toInsert.some((r) => r.decision_id_proposed === candidate)
      ) {
        n++
        candidate = `${baseProposed}-${n}`
      }
      proposed = candidate
    }

    const row = {
      decision_id_proposed: proposed,
      decision_id: fdw.decision_id?.trim() || baseProposed,
      partner: resolvePartner(fdw.partner, proposed),
      grant_name: jsonbToText(fdw.grant_name),
      decision_amount: fdw.decision_amount,
      sum_allocation_amount: fdw.sum_allocation_amount,
      decision_date: fdw.decision_date,
      notes: fdw.notes,
      restriction: fdw.restriction,
      airtable_record_id: rec,
      sync_status: 'legacy',
    }
    toInsert.push(row)
    decisionByRec.set(rec, {
      decision_id_proposed: proposed,
      decision_amount: fdw.decision_amount,
      partner: resolvePartner(fdw.partner, proposed),
      restriction: fdw.restriction,
    })
    decisionByProposed.set(proposed, true)
  }

  if (apply) {
    const supabase = getSupabaseAdmin()
    for (const row of toInsert) {
      const { error } = await supabase.from('distribution_decision_master_sheet_1').insert(row)
      if (error) {
        throw new Error(`Insert decision ${row.decision_id_proposed}: ${error.message}`)
      }
    }
  }

  return { inserted: toInsert.length, skipped }
}

/** Pull missing matched AT allocations from FDW into canonical (AT-shaped). */
async function insertMissingFromFdw(
  missingIds: string[],
  decisionByRec: Map<
    string,
    { decision_id_proposed: string; decision_amount: number | null; partner: string | null; restriction: string | null }
  >,
  decisionByProposed: Map<string, unknown>,
  apply: boolean
): Promise<{ inserted: number; skipped: string[]; decisionsInserted: number }> {
  if (!missingIds.length) return { inserted: 0, skipped: [], decisionsInserted: 0 }

  const need = new Set(missingIds)
  const fdwRows = await fetchAll<FdwAllocation>(
    'allocations',
    'allocation_id, decision_id, decision_date, decision_amount, grant_id, partner, state, allocation_amount, percent_decision_amount, restriction, serial, notes, status, flow_oversight, decision_maker'
  )

  const neededDecisionRecs: string[] = []
  for (const fdw of fdwRows) {
    const id = allocationIdKey(fdw.allocation_id)
    if (!id || !need.has(id)) continue
    const decisionRec = jsonbToText(fdw.decision_id)
    if (decisionRec && !decisionByRec.has(decisionRec)) neededDecisionRecs.push(decisionRec)
  }

  const decResult = await ensureDecisionsForRecs(
    neededDecisionRecs,
    decisionByRec,
    decisionByProposed,
    apply
  )

  const skipped: string[] = [...decResult.skipped]
  const toInsert: Record<string, unknown>[] = []

  for (const fdw of fdwRows) {
    const id = allocationIdKey(fdw.allocation_id)
    if (!id || !need.has(id)) continue
    need.delete(id)

    const decisionRec = jsonbToText(fdw.decision_id)
    const decision = decisionRec ? decisionByRec.get(decisionRec) : undefined
    if (!decision?.decision_id_proposed) {
      skipped.push(`${id} — no canonical decision for ${decisionRec ?? 'null'}`)
      continue
    }

    const amount =
      fdw.allocation_amount != null && Number.isFinite(Number(fdw.allocation_amount))
        ? Number(fdw.allocation_amount)
        : null
    const fdwDecisionAmount = Number(jsonbToText(fdw.decision_amount))
    const decisionAmount = Number.isFinite(fdwDecisionAmount)
      ? fdwDecisionAmount
      : decision.decision_amount

    toInsert.push({
      Allocation_ID: id,
      Decision_ID: decision.decision_id_proposed,
      Decision_Date: jsonbToText(fdw.decision_date),
      State: normState(fdw.state),
      'Allocation Amount': amount,
      '%_Decision_Amount':
        fdw.percent_decision_amount ??
        (amount != null && decisionAmount ? (amount / decisionAmount) * 100 : null),
      Decision_Amount: decisionAmount,
      Grant_ID: jsonbToText(fdw.grant_id),
      Partner: resolvePartner(fdw.partner, decision.decision_id_proposed) ?? decision.partner,
      Restriction: fdw.restriction ?? decision.restriction,
      Serial: fdw.serial,
      Notes: fdw.notes,
      Status: fdw.status,
      'Flow Oversight': fdw.flow_oversight,
      'Decision Maker': fdw.decision_maker,
      sync_status: 'legacy',
    })
  }

  for (const id of need) skipped.push(`${id} — not found on FDW`)

  if (apply) {
    const supabase = getSupabaseAdmin()
    for (const row of toInsert) {
      const { error } = await supabase.from('allocations_by_date').insert(row)
      if (error) throw new Error(`FDW insert ${row.Allocation_ID}: ${error.message}`)
    }
  }

  return {
    inserted: toInsert.length,
    skipped,
    decisionsInserted: decResult.inserted,
  }
}

async function main() {
  console.log(APPLY ? '=== APPLY MODE ===\n' : '=== DRY RUN (no writes) ===\n')

  const raw = readFileSync(MATCH_CSV, 'utf8')
  const parsed = Papa.parse<MatchRow>(raw, { header: true, skipEmptyLines: true })
  if (parsed.errors.length) {
    console.warn('CSV parse warnings:', parsed.errors.slice(0, 3))
  }

  const allRows = parsed.data.filter((r) => r.sheet_sequence || r.sheet_code)
  const cdpRows = allRows.filter(isCdp)
  const rows = allRows.filter((r) => !isCdp(r))

  const matched = rows.filter((r) => r.match_status === 'matched')
  const unmatchedLikely = rows.filter(
    (r) => r.match_status === 'no_airtable_match' && !!r.likely_airtable_allocation_id?.trim()
  )
  const unmatchedMissing = rows.filter(
    (r) => r.match_status === 'no_airtable_match' && !r.likely_airtable_allocation_id?.trim()
  )

  console.log(`Match CSV rows:           ${allRows.length}`)
  console.log(`Skipped CDP:              ${cdpRows.length}`)
  console.log(`In scope:                 ${rows.length}`)
  console.log(`  matched:                ${matched.length}`)
  console.log(`  unmatched + likely AT:  ${unmatchedLikely.length}`)
  console.log(`  unmatched + no likely:  ${unmatchedMissing.length}\n`)

  const [canonAllocs, canonDecisions] = await Promise.all([
    fetchAll<CanonAlloc>(
      'allocations_by_date',
      'Allocation_ID, Decision_ID, Decision_Date, State, "Allocation Amount", Decision_Amount, Partner, Notes, google_sheet_code, Serial, sync_status'
    ),
    fetchAll<
      CanonDecision & {
        airtable_record_id: string | null
      }
    >(
      'distribution_decision_master_sheet_1',
      'decision_id_proposed, decision_amount, decision_date, partner, notes, restriction, sync_status, airtable_record_id'
    ),
  ])

  const allocById = new Map(canonAllocs.map((a) => [a.Allocation_ID.trim(), a]))
  const decisionById = new Map(
    canonDecisions.map((d) => [d.decision_id_proposed.trim(), d])
  )
  const decisionByRec = new Map<
    string,
    {
      decision_id_proposed: string
      decision_amount: number | null
      partner: string | null
      restriction: string | null
    }
  >()
  for (const d of canonDecisions) {
    if (!d.airtable_record_id || !d.decision_id_proposed) continue
    decisionByRec.set(d.airtable_record_id, {
      decision_id_proposed: d.decision_id_proposed,
      decision_amount: d.decision_amount,
      partner: d.partner,
      restriction: d.restriction,
    })
  }

  // Collect AT allocation ids we need to stamp (matched + likely)
  const neededAtIds = new Set<string>()
  for (const r of matched) {
    for (const id of fdwIds(r.airtable_allocation_id)) neededAtIds.add(id)
  }
  for (const r of unmatchedLikely) {
    const id = r.likely_airtable_allocation_id?.trim()
    if (id) neededAtIds.add(id)
  }
  const missingAtIds = [...neededAtIds].filter((id) => !allocById.has(id))

  console.log(`AT ids needed for stamp: ${neededAtIds.size}`)
  console.log(`Missing from canonical:   ${missingAtIds.length}`)

  if (missingAtIds.length) {
    const fdwResult = await insertMissingFromFdw(
      missingAtIds,
      decisionByRec,
      decisionById,
      APPLY
    )
    console.log(`  FDW decisions ${APPLY ? 'inserted' : 'to insert'}: ${fdwResult.decisionsInserted}`)
    console.log(`  FDW allocs ${APPLY ? 'inserted' : 'to insert'}:    ${fdwResult.inserted}`)
    console.log(`  FDW skipped:               ${fdwResult.skipped.length}`)
    for (const s of fdwResult.skipped.slice(0, 10)) console.log(`    ${s}`)
    if (fdwResult.skipped.length > 10) {
      console.log(`    … +${fdwResult.skipped.length - 10} more`)
    }

    if (APPLY) {
      const refreshed = await fetchAll<CanonAlloc>(
        'allocations_by_date',
        'Allocation_ID, Decision_ID, Decision_Date, State, "Allocation Amount", Decision_Amount, Partner, Notes, google_sheet_code, Serial, sync_status'
      )
      allocById.clear()
      for (const a of refreshed) allocById.set(a.Allocation_ID.trim(), a)

      const refreshedDec = await fetchAll<
        CanonDecision & { airtable_record_id: string | null }
      >(
        'distribution_decision_master_sheet_1',
        'decision_id_proposed, decision_amount, decision_date, partner, notes, restriction, sync_status, airtable_record_id'
      )
      decisionById.clear()
      for (const d of refreshedDec) decisionById.set(d.decision_id_proposed.trim(), d)
    } else {
      // Dry-run: only pretend IDs that would insert (not skipped)
      for (const id of missingAtIds) {
        if (fdwResult.skipped.some((s) => s.startsWith(`${id} —`))) continue
        if (!allocById.has(id)) {
          allocById.set(id, {
            Allocation_ID: id,
            Decision_ID: null,
            Decision_Date: null,
            State: null,
            'Allocation Amount': null,
            Decision_Amount: null,
            Partner: null,
            Notes: null,
            google_sheet_code: null,
            Serial: null,
            sync_status: 'legacy',
          })
        }
      }
    }
  }

  type Stamp = {
    allocationId: string
    google_sheet_code: string
    notes?: string
    reason: 'matched' | 'likely_review'
    sheet_sequence: string
  }

  const stamps: Stamp[] = []
  const stampMissing: string[] = []
  const stampSeen = new Set<string>() // allocationId|code to dedupe

  for (const r of matched) {
    const code = (r.sheet_code || '').trim()
    if (!code) continue
    const ids = fdwIds(r.airtable_allocation_id)
    if (!ids.length) {
      stampMissing.push(`${r.sheet_sequence} — matched but no AT id`)
      continue
    }
    for (const id of ids) {
      const key = `${id}|${code}`
      if (stampSeen.has(key)) continue
      stampSeen.add(key)
      if (!allocById.has(id)) {
        stampMissing.push(`${r.sheet_sequence} → ${id} — not in canonical after FDW pull`)
        continue
      }
      stamps.push({
        allocationId: id,
        google_sheet_code: code,
        reason: 'matched',
        sheet_sequence: r.sheet_sequence,
      })
    }
  }

  for (const r of unmatchedLikely) {
    const code = (r.sheet_code || '').trim()
    const id = r.likely_airtable_allocation_id.trim()
    if (!code || !id) continue
    const key = `${id}|${code}`
    if (stampSeen.has(key)) continue
    stampSeen.add(key)
    if (!allocById.has(id)) {
      stampMissing.push(`${r.sheet_sequence} → likely ${id} — not in canonical after FDW pull`)
      continue
    }
    const existing = allocById.get(id)!
    stamps.push({
      allocationId: id,
      google_sheet_code: code,
      notes: appendNote(existing.Notes, NOTE_REVIEW),
      reason: 'likely_review',
      sheet_sequence: r.sheet_sequence,
    })
  }

  // Group missing-funds rows by sheet_code
  const missingByCode = new Map<string, MatchRow[]>()
  for (const r of unmatchedMissing) {
    const code = (r.sheet_code || '').trim()
    if (!code) {
      stampMissing.push(`${r.sheet_sequence} — missing sheet_code`)
      continue
    }
    if (!missingByCode.has(code)) missingByCode.set(code, [])
    missingByCode.get(code)!.push(r)
  }

  type NewDecision = {
    decision_id_proposed: string
    decision_id: string
    partner: string | null
    decision_amount: number
    sum_allocation_amount: number
    decision_date: string | null
    notes: string
    restriction: string
    sync_status: string
  }

  type NewAlloc = {
    Allocation_ID: string
    Decision_ID: string
    Decision_Date: string | null
    State: string | null
    'Allocation Amount': number | null
    Decision_Amount: number | null
    Partner: string | null
    Notes: string
    Serial: number | null
    google_sheet_code: string
    sync_status: string
    Status: string | null
  }

  const decisionsToInsert: NewDecision[] = []
  const decisionsToUpdate: Array<{
    id: string
    notes: string
    decision_amount: number
    sum_allocation_amount: number
  }> = []
  const allocsToInsert: NewAlloc[] = []
  const allocsAlreadyExist: string[] = []

  for (const [code, group] of missingByCode) {
    const partner = group.map((g) => g.partner?.trim()).find(Boolean) || null
    const amounts = group.map((g) => parseAmount(g.amount) ?? 0)
    const sum = Math.round(amounts.reduce((a, b) => a + b, 0) * 100) / 100
    const decisionDate =
      dateFromSheetCode(code) ||
      dateFromSeries(group[0]?.likely_airtable_series) ||
      null

    const existingDecision = decisionById.get(code)
    if (!existingDecision) {
      decisionsToInsert.push({
        decision_id_proposed: code,
        decision_id: code,
        partner,
        decision_amount: sum,
        sum_allocation_amount: sum,
        decision_date: decisionDate,
        notes: NOTE_MISSING_FUNDS,
        restriction: 'Flexible',
        sync_status: 'legacy',
      })
    } else {
      decisionsToUpdate.push({
        id: code,
        notes: appendNote(existingDecision.notes, NOTE_MISSING_FUNDS),
        decision_amount: sum,
        sum_allocation_amount: sum,
      })
    }

    for (const r of group) {
      const allocId = (r.sheet_sequence || '').trim()
      if (!allocId) continue
      if (allocById.has(allocId)) {
        allocsAlreadyExist.push(allocId)
        // Still stamp sheet code + missing-funds note on existing row
        stamps.push({
          allocationId: allocId,
          google_sheet_code: code,
          notes: appendNote(allocById.get(allocId)!.Notes, NOTE_MISSING_FUNDS),
          reason: 'likely_review',
          sheet_sequence: allocId,
        })
        continue
      }
      allocsToInsert.push({
        Allocation_ID: allocId,
        Decision_ID: code,
        Decision_Date: decisionDate,
        State: normState(r.state),
        'Allocation Amount': parseAmount(r.amount),
        Decision_Amount: sum,
        Partner: partner,
        Notes: NOTE_MISSING_FUNDS,
        Serial: serialFromSequence(allocId),
        google_sheet_code: code,
        sync_status: 'legacy',
        Status: null,
      })
    }
  }

  // Summarize stamp changes vs current
  let stampCodeOnly = 0
  let stampWithNote = 0
  let stampUnchanged = 0
  for (const s of stamps) {
    const cur = allocById.get(s.allocationId)!
    const codeSame = (cur.google_sheet_code || '') === s.google_sheet_code
    const notesSame = s.notes == null || (cur.Notes || '') === s.notes
    if (codeSame && notesSame) {
      stampUnchanged++
    } else if (s.notes) {
      stampWithNote++
    } else {
      stampCodeOnly++
    }
  }

  console.log('--- Plan ---')
  console.log(`Stamp google_sheet_code (matched / likely): ${stamps.length}`)
  console.log(`  code-only updates:     ${stampCodeOnly}`)
  console.log(`  code + review note:    ${stampWithNote}`)
  console.log(`  already up to date:    ${stampUnchanged}`)
  console.log(`Stamp targets missing:   ${stampMissing.length}`)
  console.log(`Missing-funds codes:     ${missingByCode.size}`)
  console.log(`  decisions to insert:   ${decisionsToInsert.length}`)
  console.log(`  decisions to update:   ${decisionsToUpdate.length}`)
  console.log(`  allocations to insert: ${allocsToInsert.length}`)
  console.log(`  allocs already exist:  ${allocsAlreadyExist.length}`)

  console.log('\nLikely-review rows (unmatched → AT id + note):')
  for (const r of unmatchedLikely) {
    console.log(
      `  ${r.sheet_sequence} | ${r.state} $${r.amount} → ${r.likely_airtable_allocation_id} (${r.likely_airtable_state} $${r.airtable_amount})`
    )
  }

  console.log('\nMissing-funds groups:')
  for (const [code, group] of missingByCode) {
    const sum = group.reduce((s, g) => s + (parseAmount(g.amount) ?? 0), 0)
    console.log(`  ${code} — ${group.length} rows, $${sum.toLocaleString()}`)
  }

  if (stampMissing.length) {
    console.log('\nWarnings:')
    for (const w of stampMissing.slice(0, 20)) console.log(`  ${w}`)
    if (stampMissing.length > 20) console.log(`  … +${stampMissing.length - 20} more`)
  }

  if (!APPLY) {
    console.log('\nDry run complete. Re-run with --apply to write.')
    return
  }

  const supabase = getSupabaseAdmin()

  // 1) Decisions first (FK)
  for (const d of decisionsToInsert) {
    const { error } = await supabase.from('distribution_decision_master_sheet_1').insert(d)
    if (error) throw new Error(`Insert decision ${d.decision_id_proposed}: ${error.message}`)
  }
  for (const d of decisionsToUpdate) {
    const { error } = await supabase
      .from('distribution_decision_master_sheet_1')
      .update({
        notes: d.notes,
        decision_amount: d.decision_amount,
        sum_allocation_amount: d.sum_allocation_amount,
      })
      .eq('decision_id_proposed', d.id)
    if (error) throw new Error(`Update decision ${d.id}: ${error.message}`)
  }

  // 2) New allocations
  for (const a of allocsToInsert) {
    const { error } = await supabase.from('allocations_by_date').insert(a)
    if (error) throw new Error(`Insert allocation ${a.Allocation_ID}: ${error.message}`)
  }

  // 3) Stamp codes / notes on existing AT rows
  for (const s of stamps) {
    const cur = allocById.get(s.allocationId)!
    const codeSame = (cur.google_sheet_code || '') === s.google_sheet_code
    const notesSame = s.notes == null || (cur.Notes || '') === s.notes
    if (codeSame && notesSame) continue

    const patch: Record<string, string> = { google_sheet_code: s.google_sheet_code }
    if (s.notes != null) patch.Notes = s.notes

    const { error } = await supabase
      .from('allocations_by_date')
      .update(patch)
      .eq('Allocation_ID', s.allocationId)
    if (error) throw new Error(`Update allocation ${s.allocationId}: ${error.message}`)
  }

  console.log('\nApply complete.')
  console.log(
    `  decisions inserted: ${decisionsToInsert.length}, updated: ${decisionsToUpdate.length}`
  )
  console.log(`  allocations inserted: ${allocsToInsert.length}`)
  console.log(`  stamps applied: ${stamps.length - stampUnchanged}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
