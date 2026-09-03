/**
 * Export Airtable (FDW) allocations with no matched Google Sheet row.
 *
 *   npx tsx scripts/cutover/export-orphan-airtable-allocations.ts
 */
import { config } from 'dotenv'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import Papa from 'papaparse'
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'

config({ path: resolve(process.cwd(), '.env.local') })

const MATCH_CSV = resolve(process.cwd(), 'data/imports/sheet-airtable-allocation-match.csv')
const OUTPUT_PATH = resolve(process.cwd(), 'data/imports/airtable-allocations-without-sheet-match.csv')

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

/** FDW: LCC.AD.P2H.26-06-25.587 — partner is embedded when the partner column is a rec… id */
function partnerFromAllocationId(id: string): string | null {
  const m = id.match(/^LCC\.AD\.([^.]+)\.(\d{2}-\d{2}-\d{2})\.(\d+)$/)
  return m ? m[1] : null
}

function resolvePartner(allocationId: string, rawPartner: unknown): string | null {
  const fromCol = jsonbToText(rawPartner)
  if (fromCol && !/^rec[A-Za-z0-9]+$/.test(fromCol)) return fromCol
  return partnerFromAllocationId(allocationId) || fromCol
}

async function fetchFdw() {
  const supabase = getSupabaseAdmin()
  const rows: Array<{
    allocation_id: unknown
    state: string | null
    allocation_amount: number | null
    decision_date: unknown
    serial: number | null
    partner: unknown
  }> = []
  const pageSize = 100
  let from = 0
  while (true) {
    let data: typeof rows | null = null
    let lastError: { message?: string } | null = null
    for (let attempt = 1; attempt <= 4; attempt++) {
      const res = await supabase
        .from('allocations')
        .select('allocation_id, state, allocation_amount, decision_date, serial, partner')
        .range(from, from + pageSize - 1)
      if (!res.error) {
        data = (res.data as typeof rows) || []
        lastError = null
        break
      }
      lastError = res.error
      const waitMs = attempt * 1500
      console.warn(
        `[fetchFdw] range ${from}-${from + pageSize - 1} attempt ${attempt} failed: ${res.error.message}; retry in ${waitMs}ms`
      )
      await new Promise((r) => setTimeout(r, waitMs))
    }
    if (lastError) throw lastError
    if (!data?.length) break
    rows.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return rows
}

async function main() {
  const matchCsv = Papa.parse<Record<string, string>>(readFileSync(MATCH_CSV, 'utf8'), {
    header: true,
    skipEmptyLines: true,
  }).data

  const matchedIds = new Set(
    matchCsv
      .filter((r) => r.match_status === 'matched' && r.airtable_allocation_id)
      .flatMap((r) =>
        r.airtable_allocation_id
          .split(';')
          .map((s) => s.trim())
          .filter(Boolean)
      )
  )

  const hintedBySheet = new Map<string, { sheet_code: string; sheet_sequence: string; amount_mismatch: string }>()
  for (const r of matchCsv) {
    if (r.match_status !== 'no_airtable_match' || !r.likely_airtable_allocation_id) continue
    if (!hintedBySheet.has(r.likely_airtable_allocation_id)) {
      hintedBySheet.set(r.likely_airtable_allocation_id, {
        sheet_code: r.sheet_code || '',
        sheet_sequence: r.sheet_sequence || '',
        amount_mismatch: r.amount_mismatch || '',
      })
    }
  }

  const fdw = await fetchFdw()
  const orphans: Record<string, string | number | null>[] = []

  for (const r of fdw) {
    const id = jsonbToText(r.allocation_id)
    if (!id || matchedIds.has(id)) continue

    const hint = hintedBySheet.get(id)
    let decisionDate: string | null = null
    if (r.decision_date) {
      const d = String(r.decision_date).slice(0, 10)
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) decisionDate = d
    }

    orphans.push({
      airtable_allocation_id: id,
      partner: resolvePartner(id, r.partner),
      decision_date: decisionDate,
      state: r.state,
      allocation_amount:
        r.allocation_amount != null ? Math.round(Number(r.allocation_amount) * 100) / 100 : null,
      serial: r.serial != null ? Number(r.serial) : null,
      sheet_link: hint ? 'likely_hint_only' : 'none',
      hinted_sheet_code: hint?.sheet_code || null,
      hinted_sheet_sequence: hint?.sheet_sequence || null,
      amount_mismatch: hint?.amount_mismatch || null,
    })
  }

  orphans.sort((a, b) =>
    String(a.airtable_allocation_id).localeCompare(String(b.airtable_allocation_id))
  )

  writeFileSync(OUTPUT_PATH, Papa.unparse(orphans, { header: true }), 'utf8')
  console.log(`Wrote ${orphans.length} orphan Airtable rows → ${OUTPUT_PATH}`)
  console.log(`  none (no sheet link):     ${orphans.filter((o) => o.sheet_link === 'none').length}`)
  console.log(`  likely_hint_only:         ${orphans.filter((o) => o.sheet_link === 'likely_hint_only').length}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
