/**
 * Side-by-side Google Sheet vs Airtable (FDW) allocation totals by state.
 *
 *   npx tsx scripts/cutover/compare-gs-at-by-state.ts
 */
import { config } from 'dotenv'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import Papa from 'papaparse'
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'

config({ path: resolve(process.cwd(), '.env.local') })

const CSV_PATH = resolve(
  process.cwd(),
  "data/imports/LCC_ERRs_LoHub & Partner Grant Tracker - ERR's-Grants_Allocation (1) - LCC_ERRs_LoHub & Partner Grant Tracker - ERR's-Grants_Allocation (1).csv"
)

function parseMoney(s: string | undefined): number | null {
  if (!s || String(s).includes('#')) return null
  const n = Number(String(s).replace(/[$,]/g, '').trim())
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
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

function normState(s: string | null | undefined): string {
  const t = (s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/al jazeera/g, 'al jazirah')
    .replace(/gadarif/g, 'gadaref')
    .replace(/sinar/g, 'sennar')
    .replace(/cross borden/g, 'cross border')
    .trim()
  if (!t) return '(blank)'
  return t.replace(/\b\w/g, (c) => c.toUpperCase())
}

async function main() {
  const parsed = Papa.parse<Record<string, string>>(readFileSync(CSV_PATH, 'utf8'), {
    header: true,
    skipEmptyLines: true,
  })

  const gs = new Map<string, number>()
  for (const r of parsed.data) {
    const seq = r.Sequence?.trim()
    const amt = parseMoney(r['Allocation Amount '] ?? r['Allocation Amount'])
    if (!seq && (amt == null || amt === 0)) continue
    if (amt == null) continue
    const state = normState(r['ERR state Implementer(s)']?.trim() || null)
    gs.set(state, Math.round(((gs.get(state) ?? 0) + amt) * 100) / 100)
  }

  const sb = getSupabaseAdmin()
  const at = new Map<string, number>()
  let from = 0
  while (true) {
    const { data, error } = await sb
      .from('allocations')
      .select('allocation_id, state, allocation_amount')
      .range(from, from + 999)
    if (error) throw error
    if (!data?.length) break
    for (const r of data) {
      const id = jsonbToText(r.allocation_id)
      if (!id) continue
      const amt =
        r.allocation_amount != null ? Math.round(Number(r.allocation_amount) * 100) / 100 : 0
      const state = normState(r.state)
      at.set(state, Math.round(((at.get(state) ?? 0) + amt) * 100) / 100)
    }
    if (data.length < 1000) break
    from += 1000
  }

  const states = [...new Set([...gs.keys(), ...at.keys()])].sort((a, b) => a.localeCompare(b))
  const fmt = (n: number) =>
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  console.log('| State | GS | AT |')
  console.log('|---|---:|---:|')
  let gsT = 0
  let atT = 0
  for (const s of states) {
    const g = gs.get(s) ?? 0
    const a = at.get(s) ?? 0
    gsT += g
    atT += a
    console.log(`| ${s} | ${fmt(g)} | ${fmt(a)} |`)
  }
  console.log(`| **Total** | **${fmt(gsT)}** | **${fmt(atT)}** |`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
