/**
 * Compare LoHub Google Sheet CSV vs public.allocations (Airtable FDW).
 *   npx tsx scripts/cutover/compare-sheet-fdw-allocations.ts
 */
import { config } from 'dotenv'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import Papa from 'papaparse'
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'

config({ path: resolve(process.cwd(), '.env.local') })

const CSV_PATH = resolve(
  process.cwd(),
  "data/imports/LCC_ERRs_LoHub & Partner Grant Tracker - ERR's-Grants_Allocation - LCC_ERRs_LoHub & Partner Grant Tracker - ERR's-Grants_Allocation.csv"
)

function parseMoney(s: string | undefined): number | null {
  if (!s || String(s).includes('#')) return null
  const n = Number(String(s).replace(/[$,]/g, '').trim())
  return Number.isFinite(n) ? n : null
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

function allocKey(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'object' && !Array.isArray(value) && 'error' in value) return null
  return jsonbToText(value)
}

function normState(s: string | null | undefined): string {
  return (s || '')
    .toLowerCase()
    .replace(/al jazeera/g, 'al jazirah')
    .replace(/gadarif/g, 'gadaref')
    .replace(/sinar/g, 'sennar')
    .trim()
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

type SheetRow = {
  Code?: string
  Sequence?: string
  Donor?: string
  Partner?: string
  'ERR state Implementer(s)'?: string
  'Allocation Amount'?: string
  'Allocation Amount '?: string
  'ERR Office and Community Space Activities'?: string
}

async function main() {
  const raw = readFileSync(CSV_PATH, 'utf8')
  const parsed = Papa.parse<SheetRow>(raw, { header: true, skipEmptyLines: true })
  const sheetRows = parsed.data.filter((r) => r.Sequence?.trim())

  const sheetBySeq = new Map<
    string,
    {
      code: string | null
      donor: string | null
      partner: string | null
      state: string | null
      amount: number | null
      restriction: string | null
    }
  >()

  for (const r of sheetRows) {
    const seq = r.Sequence!.trim()
    sheetBySeq.set(seq, {
      code: r.Code?.trim() || null,
      donor: r.Donor?.trim() || null,
      partner: r.Partner?.trim() || null,
      state: r['ERR state Implementer(s)']?.trim() || null,
      amount: parseMoney(r['Allocation Amount '] ?? r['Allocation Amount']),
      restriction: r['ERR Office and Community Space Activities']?.trim() || null,
    })
  }

  const fdwRows = await fetchAll<{
    allocation_id: unknown
    state: string | null
    allocation_amount: number | null
    partner: unknown
    restriction: string | null
    decision_id: unknown
  }>('allocations', 'allocation_id, state, allocation_amount, partner, restriction, decision_id')

  const fdwByKey = new Map<
    string,
    {
      state: string | null
      amount: number | null
      partner: string | null
      restriction: string | null
      decisionRec: string | null
    }
  >()

  for (const r of fdwRows) {
    const key = allocKey(r.allocation_id)
    if (!key) continue
    fdwByKey.set(key, {
      state: r.state,
      amount: r.allocation_amount != null ? Number(r.allocation_amount) : null,
      partner: jsonbToText(r.partner),
      restriction: r.restriction,
      decisionRec: jsonbToText(r.decision_id),
    })
  }

  const sheetOnly: string[] = []
  const fdwOnly: string[] = []
  const amountMismatch: Array<{ seq: string; sheet: number; fdw: number; code: string | null }> = []
  const stateMismatch: Array<{ seq: string; sheet: string; fdw: string; code: string | null }> = []
  let overlap = 0

  for (const [seq, s] of sheetBySeq) {
    const f = fdwByKey.get(seq)
    if (!f) {
      sheetOnly.push(seq)
      continue
    }
    overlap++
    if (s.amount != null && f.amount != null && Math.abs(s.amount - f.amount) > 0.02) {
      amountMismatch.push({ seq, sheet: s.amount, fdw: f.amount, code: s.code })
    }
    if (s.state && f.state && normState(s.state) !== normState(f.state)) {
      stateMismatch.push({ seq, sheet: s.state, fdw: f.state, code: s.code })
    }
  }

  for (const key of fdwByKey.keys()) {
    if (!sheetBySeq.has(key)) fdwOnly.push(key)
  }

  const sheetTotal = [...sheetBySeq.values()].reduce((a, r) => a + (r.amount || 0), 0)
  const fdwTotal = [...fdwByKey.values()].reduce((a, r) => a + (r.amount || 0), 0)
  const sheetCodes = new Set([...sheetBySeq.values()].map((r) => r.code).filter(Boolean))

  const sheetOnlyTotal = sheetOnly.reduce((a, seq) => a + (sheetBySeq.get(seq)?.amount || 0), 0)

  console.log('=== Sheet vs FDW allocations (match on Sequence = allocation_id) ===\n')
  console.log(`Sheet rows (with Sequence):     ${sheetRows.length}`)
  console.log(`Sheet unique Sequences:       ${sheetBySeq.size}`)
  console.log(`Sheet unique Codes:           ${sheetCodes.size}`)
  console.log(`FDW allocation rows:          ${fdwByKey.size}`)
  console.log(`Overlap (same allocation_id): ${overlap}`)
  console.log(`Sheet only:                   ${sheetOnly.length}  ($${sheetOnlyTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })})`)
  console.log(`FDW only:                       ${fdwOnly.length}`)
  console.log(`Amount mismatches (overlap):  ${amountMismatch.length}`)
  console.log(`State mismatches (overlap):   ${stateMismatch.length}`)
  console.log(`Sheet total (parsed amounts): $${sheetTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`)
  console.log(`FDW total:                    $${fdwTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`)

  if (sheetOnly.length) {
    console.log('\nSample sheet-only (first 10):')
    for (const seq of sheetOnly.slice(0, 10)) {
      const s = sheetBySeq.get(seq)!
      console.log(`  ${seq} | ${s.code} | ${s.state} | $${s.amount}`)
    }
  }

  if (fdwOnly.length) {
    console.log('\nSample FDW-only (first 10):')
    for (const seq of fdwOnly.slice(0, 10)) {
      const f = fdwByKey.get(seq)!
      console.log(`  ${seq} | ${f.state} | $${f.amount}`)
    }
  }

  if (amountMismatch.length) {
    console.log('\nSample amount mismatches (first 5):')
    for (const m of amountMismatch.slice(0, 5)) {
      console.log(`  ${m.seq}: sheet $${m.sheet} vs fdw $${m.fdw}`)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
