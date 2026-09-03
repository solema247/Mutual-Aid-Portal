/**
 * Compare Google Tracker Grants CSV vs public.grants (Airtable FDW).
 *
 * Match key: sheet "Grant Shortname" ↔ FDW grant_id (normalized), with a few
 * known aliases for spelling / naming drift.
 *
 * Field mapping (sheet → FDW):
 *   Amount Transferred → total_transferred_amount_usd
 *   Amount Disbursed   → sum_activity_amount
 *   Transfer Fees      → sum_transfer_fee_amount
 *   Balance            → sheet only (transferred − disbursed − fees)
 *   Name / Donor / Partner / dates / status / Grantor ID as available
 *
 *   npx tsx scripts/cutover/compare-sheet-fdw-grants.ts
 *   npx tsx scripts/cutover/compare-sheet-fdw-grants.ts "data/imports/Google Tracker Grants.csv"
 */
import { config } from 'dotenv'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import Papa from 'papaparse'
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'

config({ path: resolve(process.cwd(), '.env.local') })

const CSV_PATH = resolve(
  process.cwd(),
  process.argv[2] || 'data/imports/Google Tracker Grants.csv'
)
const OUTPUT_PATH = resolve(process.cwd(), 'data/exports/sheet-fdw-grants-compare.csv')

/** Sheet shortname → FDW grant_id when names differ */
const SHEET_TO_FDW_ALIAS: Record<string, string> = {
  'safer world': 'Saferworld',
  saferworld: 'Saferworld',
  sv: 'Stichting Vluchteling',
  'stichting vluchteling': 'Stichting Vluchteling',
  'sichting cordaid': 'Stiching Cordaid',
  'stiching cordaid': 'Stiching Cordaid',
  cordaid: 'Stiching Cordaid',
  'hampshire foundation - holiday impact campaign': 'Hampshire Foundation',
  'hampshire foundation': 'Hampshire Foundation',
  'longer tables fund': 'Longer Tables Fund - Jose Andres',
  'sall family foundation': 'Sall Family Foundation',
  'elma foundation': 'ELMA Foundation',
  'sc group': 'The SC Group',
  'crushing family': 'Crushing Family Foundation',
  'silicom vally': 'Silicon Valley Foundation',
  'silicon valley': 'Silicon Valley Foundation',
  'silicon valley foundation': 'Silicon Valley Foundation',
  'skoll foundation': 'Skoll Foundation',
  'hunt foundation': 'Hunt',
  hunt: 'Hunt',
  'bloomberg philanthropies': 'Bloomberg',
  bloomberg: 'Bloomberg',
  malala: 'Malala Fund',
  tides: 'Tides Foundation',
  'fcdo help-s': 'FCDO-HELP-S',
  'fcdo help s': 'FCDO-HELP-S',
  'fcdo shpr': 'FCDO-SHPR',
}

const AMOUNT_TOLERANCE = 0.02

function parseMoney(s: string | undefined | null): number | null {
  if (s == null) return null
  const raw = String(s).trim()
  if (!raw || raw.includes('#')) return null
  const n = Number(raw.replace(/[$,]/g, '').trim())
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

/** Collapse spaces/hyphens so "FCDO SHPR" matches "FCDO-SHPR" */
function normKey(s: string | null | undefined): string {
  return (s ?? '')
    .trim()
    .toLowerCase()
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function sheetMatchKey(shortname: string): string {
  // Aliases are keyed on a soft human form; also try collapsed key lookups below.
  const soft = (shortname ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[‐‑‒–—]/g, '-')
  const alias = SHEET_TO_FDW_ALIAS[soft] || SHEET_TO_FDW_ALIAS[normKey(shortname)]
  return alias ? normKey(alias) : normKey(shortname)
}

function jsonbToText(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') {
    const t = value.trim().replace(/^"|"$/g, '')
    if (!t || t.includes('#ERROR!') || /^rec[A-Za-z0-9]+$/.test(t)) return t.startsWith('rec') ? null : t || null
    return t
  }
  if (Array.isArray(value)) {
    const parts = value.map(jsonbToText).filter(Boolean) as string[]
    return parts.length ? parts.join('; ') : null
  }
  if (typeof value === 'object') {
    if ('error' in (value as object)) return null
    return jsonbToText(Object.values(value as object)[0])
  }
  const s = String(value).trim()
  return s && !s.includes('#ERROR!') && !/^rec[A-Za-z0-9]+$/.test(s) ? s : null
}

function parseSheetDate(s: string | undefined | null): string | null {
  if (!s) return null
  const t = String(s).trim()
  if (!t) return null
  // 01-Jul-24 / 01-Jul-2024
  const m = t.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/)
  if (m) {
    const months: Record<string, string> = {
      jan: '01',
      feb: '02',
      mar: '03',
      apr: '04',
      may: '05',
      jun: '06',
      jul: '07',
      aug: '08',
      sep: '09',
      oct: '10',
      nov: '11',
      dec: '12',
    }
    const mon = months[m[2].toLowerCase()]
    if (!mon) return t
    const yy = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${yy}-${mon}-${m[1].padStart(2, '0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  return t
}

function moneyDelta(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return 0
  if (a == null || b == null) return null
  return Math.round((a - b) * 100) / 100
}

function amountsEqual(a: number | null, b: number | null): boolean {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  return Math.abs(a - b) <= AMOUNT_TOLERANCE
}

function normStatus(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase()
}

type SheetGrant = {
  shortname: string
  name: string | null
  donor: string | null
  partner: string | null
  start_date: string | null
  end_date: string | null
  status: string | null
  grantor_id: string | null
  transferred: number | null
  disbursed: number | null
  fees: number | null
  balance: number | null
  note: string | null
}

type FdwGrant = {
  grant_id: string
  project_name: string | null
  donor_name: string | null
  partner_name: string | null
  grant_start_date: string | null
  grant_end_date: string | null
  status: string | null
  project_id: string | null
  transferred: number | null
  disbursed: number | null
  fees: number | null
}

async function fetchFdw(): Promise<FdwGrant[]> {
  const supabase = getSupabaseAdmin()
  const rows: any[] = []
  const pageSize = 100
  let from = 0
  while (true) {
    let data: any[] | null = null
    let lastError: { message?: string } | null = null
    for (let attempt = 1; attempt <= 4; attempt++) {
      const res = await supabase
        .from('grants')
        .select(
          'grant_id, project_name, donor_name, partner_name, grant_start_date, grant_end_date, status, project_id, total_transferred_amount_usd, sum_activity_amount, sum_transfer_fee_amount'
        )
        .range(from, from + pageSize - 1)
      if (!res.error) {
        data = res.data || []
        lastError = null
        break
      }
      lastError = res.error
      await new Promise((r) => setTimeout(r, attempt * 1500))
    }
    if (lastError) throw lastError
    if (!data?.length) break
    rows.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }

  return rows
    .map((r) => {
      const grant_id = (r.grant_id ?? '').trim()
      if (!grant_id) return null
      return {
        grant_id,
        project_name: r.project_name ?? null,
        donor_name: jsonbToText(r.donor_name),
        partner_name: jsonbToText(r.partner_name),
        grant_start_date: r.grant_start_date ? String(r.grant_start_date).slice(0, 10) : null,
        grant_end_date: r.grant_end_date ? String(r.grant_end_date).slice(0, 10) : null,
        status: r.status ?? null,
        project_id: r.project_id ?? null,
        transferred:
          r.total_transferred_amount_usd != null
            ? Math.round(Number(r.total_transferred_amount_usd) * 100) / 100
            : null,
        disbursed:
          r.sum_activity_amount != null ? Math.round(Number(r.sum_activity_amount) * 100) / 100 : null,
        fees:
          r.sum_transfer_fee_amount != null
            ? Math.round(Number(r.sum_transfer_fee_amount) * 100) / 100
            : null,
      } satisfies FdwGrant
    })
    .filter(Boolean) as FdwGrant[]
}

function parseSheet(path: string): SheetGrant[] {
  const parsed = Papa.parse<Record<string, string>>(readFileSync(path, 'utf8'), {
    header: true,
    skipEmptyLines: true,
  })
  const out: SheetGrant[] = []
  for (const r of parsed.data) {
    const shortname = (r['Grant Shortname'] ?? '').trim()
    if (!shortname) continue
    out.push({
      shortname,
      name: (r.Name ?? '').trim() || null,
      donor: (r.Donor ?? '').trim() || null,
      partner: (r.Partner ?? '').trim() || null,
      start_date: parseSheetDate(r['Start Date']),
      end_date: parseSheetDate(r['End Date']),
      status: (r.Status ?? '').trim() || null,
      grantor_id: (r['Grantor ID'] ?? '').trim() || null,
      transferred: parseMoney(r['Amount Transferred']),
      disbursed: parseMoney(r['Amount Disbursed']),
      fees: parseMoney(r['Transfer Fees']),
      balance: parseMoney(r['Balance '] ?? r.Balance),
      note: (r.Note ?? '').trim() || null,
    })
  }
  return out
}

async function main() {
  const sheet = parseSheet(CSV_PATH)
  const fdw = await fetchFdw()

  const fdwByKey = new Map<string, FdwGrant>()
  for (const g of fdw) {
    const k = normKey(g.grant_id)
    if (!fdwByKey.has(k)) fdwByKey.set(k, g)
  }

  const usedFdw = new Set<string>()
  const rows: Record<string, string | number | null>[] = []

  let matchedExact = 0
  let matchedAlias = 0
  let amountMismatch = 0
  let sheetOnly = 0

  for (const s of sheet) {
    const exactKey = normKey(s.shortname)
    const aliasKey = sheetMatchKey(s.shortname)
    let f = fdwByKey.get(exactKey)
    let method: string | null = null
    if (f) {
      method = 'exact_grant_id'
      matchedExact++
    } else if (aliasKey !== exactKey) {
      f = fdwByKey.get(aliasKey)
      if (f) {
        method = 'alias_grant_id'
        matchedAlias++
      }
    }

    if (!f) {
      sheetOnly++
      rows.push({
        match_status: 'sheet_only',
        match_method: null,
        sheet_grant_shortname: s.shortname,
        fdw_grant_id: null,
        sheet_name: s.name,
        fdw_project_name: null,
        sheet_donor: s.donor,
        fdw_donor_name: null,
        sheet_partner: s.partner,
        fdw_partner_name: null,
        sheet_status: s.status,
        fdw_status: null,
        sheet_start_date: s.start_date,
        fdw_start_date: null,
        sheet_end_date: s.end_date,
        fdw_end_date: null,
        sheet_grantor_id: s.grantor_id,
        fdw_project_id: null,
        sheet_transferred: s.transferred,
        fdw_transferred: null,
        delta_transferred: null,
        sheet_disbursed: s.disbursed,
        fdw_disbursed: null,
        delta_disbursed: null,
        sheet_fees: s.fees,
        fdw_fees: null,
        delta_fees: null,
        sheet_balance: s.balance,
        sheet_note: s.note,
        field_mismatches: null,
      })
      continue
    }

    usedFdw.add(normKey(f.grant_id))

    const mismatches: string[] = []
    if (!amountsEqual(s.transferred, f.transferred)) mismatches.push('transferred')
    if (!amountsEqual(s.disbursed, f.disbursed)) mismatches.push('disbursed')
    if (!amountsEqual(s.fees, f.fees)) mismatches.push('fees')
    if (normStatus(s.status) && normStatus(f.status) && normStatus(s.status) !== normStatus(f.status)) {
      mismatches.push('status')
    }
    if (s.start_date && f.grant_start_date && s.start_date !== f.grant_start_date) {
      mismatches.push('start_date')
    }
    if (s.end_date && f.grant_end_date && s.end_date !== f.grant_end_date) {
      mismatches.push('end_date')
    }

    const hasMoneyMismatch = mismatches.some((m) =>
      ['transferred', 'disbursed', 'fees'].includes(m)
    )
    if (hasMoneyMismatch) amountMismatch++

    rows.push({
      match_status: mismatches.length ? 'matched_with_diffs' : 'matched',
      match_method: method,
      sheet_grant_shortname: s.shortname,
      fdw_grant_id: f.grant_id,
      sheet_name: s.name,
      fdw_project_name: f.project_name,
      sheet_donor: s.donor,
      fdw_donor_name: f.donor_name,
      sheet_partner: s.partner,
      fdw_partner_name: f.partner_name,
      sheet_status: s.status,
      fdw_status: f.status,
      sheet_start_date: s.start_date,
      fdw_start_date: f.grant_start_date,
      sheet_end_date: s.end_date,
      fdw_end_date: f.grant_end_date,
      sheet_grantor_id: s.grantor_id,
      fdw_project_id: f.project_id,
      sheet_transferred: s.transferred,
      fdw_transferred: f.transferred,
      delta_transferred: moneyDelta(s.transferred, f.transferred),
      sheet_disbursed: s.disbursed,
      fdw_disbursed: f.disbursed,
      delta_disbursed: moneyDelta(s.disbursed, f.disbursed),
      sheet_fees: s.fees,
      fdw_fees: f.fees,
      delta_fees: moneyDelta(s.fees, f.fees),
      sheet_balance: s.balance,
      sheet_note: s.note,
      field_mismatches: mismatches.length ? mismatches.join('|') : null,
    })
  }

  const fdwOnly = fdw.filter((g) => !usedFdw.has(normKey(g.grant_id)))
  for (const f of fdwOnly) {
    rows.push({
      match_status: 'fdw_only',
      match_method: null,
      sheet_grant_shortname: null,
      fdw_grant_id: f.grant_id,
      sheet_name: null,
      fdw_project_name: f.project_name,
      sheet_donor: null,
      fdw_donor_name: f.donor_name,
      sheet_partner: null,
      fdw_partner_name: f.partner_name,
      sheet_status: null,
      fdw_status: f.status,
      sheet_start_date: null,
      fdw_start_date: f.grant_start_date,
      sheet_end_date: null,
      fdw_end_date: f.grant_end_date,
      sheet_grantor_id: null,
      fdw_project_id: f.project_id,
      sheet_transferred: null,
      fdw_transferred: f.transferred,
      delta_transferred: null,
      sheet_disbursed: null,
      fdw_disbursed: f.disbursed,
      delta_disbursed: null,
      sheet_fees: null,
      fdw_fees: f.fees,
      delta_fees: null,
      sheet_balance: null,
      sheet_note: null,
      field_mismatches: null,
    })
  }

  const statusRank: Record<string, number> = {
    matched_with_diffs: 0,
    sheet_only: 1,
    fdw_only: 2,
    matched: 3,
  }
  rows.sort((a, b) => {
    const ra = statusRank[String(a.match_status)] ?? 9
    const rb = statusRank[String(b.match_status)] ?? 9
    if (ra !== rb) return ra - rb
    const sa = String(a.sheet_grant_shortname || a.fdw_grant_id || '')
    const sb = String(b.sheet_grant_shortname || b.fdw_grant_id || '')
    return sa.localeCompare(sb)
  })

  writeFileSync(OUTPUT_PATH, Papa.unparse(rows, { header: true }), 'utf8')

  console.log('=== Sheet ↔ FDW grants compare ===\n')
  console.log(`Sheet: ${CSV_PATH}`)
  console.log(`Sheet rows:              ${sheet.length}`)
  console.log(`FDW rows:                ${fdw.length}`)
  console.log(`Exact grant_id match:    ${matchedExact}`)
  console.log(`Alias match:             ${matchedAlias}`)
  console.log(`Matched with $ diffs:    ${amountMismatch}`)
  console.log(`Sheet only:              ${sheetOnly}`)
  console.log(`FDW only:                ${fdwOnly.length}`)
  console.log(`\nWrote: ${OUTPUT_PATH}`)

  if (sheetOnly || fdwOnly.length) {
    console.log('\nSheet only:')
    for (const r of rows.filter((x) => x.match_status === 'sheet_only')) {
      console.log(`  ${r.sheet_grant_shortname}`)
    }
    console.log('FDW only:')
    for (const r of rows.filter((x) => x.match_status === 'fdw_only')) {
      console.log(`  ${r.fdw_grant_id}`)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
