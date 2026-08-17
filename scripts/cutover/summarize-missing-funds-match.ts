/**
 * Summarize sheet↔FDW match status for portal decisions still marked
 * "Please Review: missing a funds request".
 *
 *   npx tsx scripts/cutover/summarize-missing-funds-match.ts
 */
import { config } from 'dotenv'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import Papa from 'papaparse'
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'

config({ path: resolve(process.cwd(), '.env.local') })

const MATCH_CSV = resolve(process.cwd(), 'data/imports/sheet-airtable-allocation-match.csv')

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
  const decisions = await fetchAll<{
    decision_id_proposed: string
    decision_date: string | null
    decision_amount: number | null
    notes: string | null
  }>(
    'distribution_decision_master_sheet_1',
    'decision_id_proposed, decision_date, decision_amount, notes'
  )

  const flagged = decisions.filter((d) =>
    /missing a funds request/i.test(d.notes || '')
  )
  const flaggedIds = new Set(flagged.map((d) => d.decision_id_proposed))

  const raw = readFileSync(MATCH_CSV, 'utf8')
  const matchRows = Papa.parse<Record<string, string>>(raw, {
    header: true,
    skipEmptyLines: true,
  }).data

  console.log(`Flagged decisions with note: ${flagged.length}`)
  for (const d of flagged) {
    console.log(
      `  ${d.decision_id_proposed} | ${d.decision_date} | $${Number(d.decision_amount || 0).toLocaleString()}`
    )
  }

  console.log('\n--- Match CSV status for those sheet codes ---')
  for (const id of [...flaggedIds].sort()) {
    const rows = matchRows.filter((r) => (r.sheet_code || '').trim() === id)
    const matched = rows.filter((r) => r.match_status === 'matched')
    const unmatched = rows.filter((r) => r.match_status !== 'matched')
    console.log(
      `\n${id}: sheet rows=${rows.length} matched=${matched.length} unmatched=${unmatched.length}`
    )
    for (const r of matched.slice(0, 8)) {
      console.log(
        `  ✓ ${r.sheet_sequence} → ${r.airtable_allocation_id} (${r.match_method})`
      )
    }
    for (const r of unmatched.slice(0, 8)) {
      console.log(
        `  ✗ ${r.sheet_sequence} | ${r.state} | $${r.amount} | likely=${r.likely_airtable_allocation_id || '—'}`
      )
    }
  }

  const allUnmatched = matchRows.filter((r) => r.match_status !== 'matched')
  const byCode = new Map<string, number>()
  for (const r of allUnmatched) {
    const c = (r.sheet_code || '').trim() || '(blank)'
    byCode.set(c, (byCode.get(c) || 0) + 1)
  }
  console.log(`\n--- All unmatched sheet rows: ${allUnmatched.length} ---`)
  for (const [c, n] of [...byCode.entries()].sort((a, b) => b[1] - a[1])) {
    const flaggedMark = flaggedIds.has(c) ? ' [still has missing-funds note]' : ''
    console.log(`  ${c}: ${n}${flaggedMark}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
