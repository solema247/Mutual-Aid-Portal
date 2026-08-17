/**
 * Check whether specific decision notes still look valid vs latest sheet↔FDW match.
 * Read-only.
 *
 *   npx tsx scripts/cutover/check-decision-notes-validity.ts
 */
import { config } from 'dotenv'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import Papa from 'papaparse'
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'

config({ path: resolve(process.cwd(), '.env.local') })

const MATCH_CSV = resolve(process.cwd(), 'data/imports/sheet-airtable-allocation-match.csv')
const SHEET_CSV = resolve(process.cwd(), 'data/imports/Google Sheet Allocations.csv')

const TARGETS = [
  'LCC.P2H.2026-05-06.WRR',
  'LCC.P2H.2026-03-26.Flex',
  'LCC.P2H.2026-02-14.WRR',
  'LCC.P2H.2025-03-08.Flex',
  'LCC.P2H.2025-01-16.Flex',
]

function parseDateParts(iso: string | null): { ymd: string; sheetStyle: string } | null {
  if (!iso) return null
  const d = iso.slice(0, 10)
  const [y, m, day] = d.split('-')
  if (!y || !m || !day) return null
  const yy = y.slice(2)
  return {
    ymd: d,
    // sheet often uses DD-MM-YY or YY-MM-DD fragments
    sheetStyle: `${day}-${m}-${yy}`,
  }
}

async function fetchAll<T>(table: string, select: string): Promise<T[]> {
  const sb = getSupabaseAdmin()
  const rows: T[] = []
  let from = 0
  while (true) {
    const { data, error } = await sb.from(table).select(select).range(from, from + 999)
    if (error) throw error
    if (!data?.length) break
    rows.push(...(data as T[]))
    if (data.length < 1000) break
    from += 1000
  }
  return rows
}

async function main() {
  const match = Papa.parse<Record<string, string>>(readFileSync(MATCH_CSV, 'utf8'), {
    header: true,
    skipEmptyLines: true,
  }).data
  const sheet = Papa.parse<Record<string, string>>(readFileSync(SHEET_CSV, 'utf8'), {
    header: true,
    skipEmptyLines: true,
  }).data

  const decisions = await fetchAll<{
    decision_id_proposed: string
    decision_date: string | null
    decision_amount: number | null
    sum_allocation_amount: number | null
    notes: string | null
  }>(
    'distribution_decision_master_sheet_1',
    'decision_id_proposed, decision_date, decision_amount, sum_allocation_amount, notes'
  )

  const allocs = await fetchAll<{
    Allocation_ID: string
    Decision_ID: string | null
    Notes: string | null
    google_sheet_code: string | null
    'Allocation Amount': number | null
    State: string | null
  }>('allocations_by_date', 'Allocation_ID, Decision_ID, Notes, google_sheet_code, "Allocation Amount", State')

  for (const id of TARGETS) {
    const d = decisions.find((x) => x.decision_id_proposed === id)
    if (!d) {
      console.log(`\n${id}: NOT FOUND in canonical`)
      continue
    }
    const parts = parseDateParts(d.decision_date)
    const decisionAllocs = allocs.filter((a) => a.Decision_ID === id)
    const withSheetCode = decisionAllocs.filter((a) => a.google_sheet_code)
    const missingLohubNote = /missing in Lohub Tracker/i.test(d.notes || '')
    const mismatchDocNote = /does not match decision document/i.test(d.notes || '')

    // Sheet rows: by google_sheet_code on portal allocs, or by date fragment in Code
    const sheetCodes = new Set(
      withSheetCode.map((a) => a.google_sheet_code!).filter(Boolean)
    )
    let sheetRows = sheet.filter((r) => sheetCodes.has((r.Code || '').trim()))
    if (!sheetRows.length && parts) {
      sheetRows = sheet.filter((r) => {
        const code = r.Code || ''
        return (
          code.includes(parts.sheetStyle) ||
          code.includes(`${parts.ymd}`) ||
          // YY-MM-DD in AT style embedded
          code.includes(`${parts.ymd.slice(2)}`)
        )
      })
    }

    // Match rows linked via sheet code or via AT allocation ids under this decision
    const atIds = new Set(decisionAllocs.map((a) => a.Allocation_ID))
    const matchRows = match.filter(
      (r) =>
        sheetCodes.has((r.sheet_code || '').trim()) ||
        atIds.has((r.airtable_allocation_id || '').trim()) ||
        fdwIdsOverlap(r.airtable_allocation_id, atIds)
    )
    const matched = matchRows.filter((r) => r.match_status === 'matched')
    const unmatched = matchRows.filter((r) => r.match_status !== 'matched')

    // Also: how many of this decision's AT allocs appear as matched airtable ids in match CSV
    const atMatchedInCsv = decisionAllocs.filter((a) =>
      match.some(
        (r) =>
          r.match_status === 'matched' &&
          fdwIdsOverlap(r.airtable_allocation_id, new Set([a.Allocation_ID]))
      )
    )
    const atNotInMatchedCsv = decisionAllocs.filter(
      (a) => !atMatchedInCsv.some((x) => x.Allocation_ID === a.Allocation_ID)
    )

    const variance =
      Number(d.decision_amount || 0) - Number(d.sum_allocation_amount || 0)

    console.log(`\n=== ${id} ===`)
    console.log(`notes: ${JSON.stringify(d.notes)}`)
    console.log(
      `amounts: decision $${Number(d.decision_amount)} | alloc sum $${Number(d.sum_allocation_amount)} | variance $${variance}`
    )
    console.log(
      `portal allocs: ${decisionAllocs.length} | with google_sheet_code: ${withSheetCode.length}`
    )
    console.log(`sheet rows found: ${sheetRows.length} (codes: ${[...sheetCodes].join(', ') || '—'})`)
    console.log(
      `match CSV for this decision: ${matchRows.length} (matched ${matched.length}, unmatched ${unmatched.length})`
    )
    console.log(
      `AT allocs appearing as matched in CSV: ${atMatchedInCsv.length}/${decisionAllocs.length}`
    )
    if (atNotInMatchedCsv.length) {
      console.log(
        `  AT allocs NOT matched to sheet in CSV: ${atNotInMatchedCsv
          .map((a) => a.Allocation_ID)
          .join(', ')}`
      )
    }

    // Validity heuristics for the two note types
    if (missingLohubNote) {
      const stillMissing =
        atNotInMatchedCsv.length > 0 ||
        (sheetRows.length === 0 && decisionAllocs.length > 0)
      console.log(
        `NOTE "missing in Lohub Tracker": ${stillMissing ? 'LIKELY STILL VALID' : 'LIKELY STALE (all AT allocs now matched to sheet)'}`
      )
    }
    if (mismatchDocNote) {
      // This note was about sheet vs decision document / MAC mismatches, not pure FDW presence.
      // Still valid if variance non-zero OR sheet still unmatched OR specific review remains.
      const stillValid =
        Math.abs(variance) >= 0.01 ||
        unmatched.length > 0 ||
        sheetRows.length === 0
      console.log(
        `NOTE "Allocation does not match decision document": ${
          stillValid
            ? 'LIKELY STILL VALID (variance and/or sheet gaps remain — confirm manually vs decision doc)'
            : 'UNCERTAIN / possibly stale (amounts balance and sheet rows matched; original was document mismatch)'
        }`
      )
    }
  }
}

function fdwIdsOverlap(idField: string | undefined, set: Set<string>): boolean {
  if (!idField) return false
  return idField
    .split(';')
    .map((s) => s.trim())
    .some((id) => set.has(id))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
