/**
 * Compare Google Tracker WRR allocations vs Airtable FDW allocations.
 *
 * GT filter: "ERR Office and Community Space Activities" contains WRR or WSRR
 * AT filter: restriction contains WRR or WSRR (treated as the same)
 *
 *   npx tsx scripts/cutover/compare-wrr-gt-airtable.ts
 *   npx tsx scripts/cutover/compare-wrr-gt-airtable.ts "data/imports/Google Tracker ERR's-Grants_Allocation - Sept 15th.csv"
 */
import { config } from 'dotenv'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import Papa from 'papaparse'
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'

config({ path: resolve(process.cwd(), '.env.local') })

const GT_CSV = resolve(
  process.cwd(),
  process.argv[2] || "data/imports/Google Tracker ERR's-Grants_Allocation - Sept 15th.csv"
)

const ACTIVITY_COL = 'ERR Office and Community Space Activities'

/** WRR and WSRR are the same label. */
function isWrrLabel(s: string | null | undefined): boolean {
  const t = (s ?? '').toUpperCase()
  // 'WRR' is also a substring of 'WSRR'
  return t.includes('WRR')
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

function parseMoney(s: string | undefined | null): number | null {
  if (s == null) return null
  const raw = String(s).trim()
  if (!raw || raw.includes('#')) return null
  const n = Number(raw.replace(/[$,]/g, '').trim())
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

function money(n: number | null | undefined): number {
  if (n == null || !Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

/** Normalize Sinar/Sennar and WRR/WSRR pool labels for side-by-side keys. */
function normState(s: string | null | undefined): string {
  const t = (s ?? '').trim()
  if (!t) return '(blank)'
  if (/^sinar$/i.test(t) || /^sennar$/i.test(t)) return 'Sennar/Sinar'
  if (/^w?srr\s*pool$/i.test(t)) return 'WRR Pool'
  return t
}

/** Extract decision date from sheet_code like LCC.AD.P2H.13-08-25-21 → 2025-08-13 */
function dateFromSheetCode(code: string): string | null {
  const m = code.match(/(\d{2})-(\d{2})-(\d{2})/)
  if (!m) return null
  const dd = m[1]
  const mm = m[2]
  const yy = m[3]
  return `20${yy}-${mm}-${dd}`
}

/** Extract YY-MM-DD from Airtable allocation_id LCC.AD.P2H.25-09-17.215 */
function dateFromAllocationId(id: string | null): string | null {
  if (!id) return null
  const m = id.match(/\.(\d{2})-(\d{2})-(\d{2})\.(\d+)$/)
  if (!m) return null
  return `20${m[1]}-${m[2]}-${m[3]}`
}

function toIsoDate(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const t = jsonbToText(v)
  if (t && /^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  return null
}

type GtRow = {
  sheet_code: string
  sheet_sequence: string
  partner: string
  state: string
  state_key: string
  amount: number
  date: string | null
  activity: string
}

function parseGtWrr(path: string): GtRow[] {
  const parsed = Papa.parse<Record<string, string>>(readFileSync(path, 'utf8'), {
    header: true,
    skipEmptyLines: true,
  })
  const out: GtRow[] = []
  for (const r of parsed.data) {
    const activity = (r[ACTIVITY_COL] ?? '').trim()
    if (!isWrrLabel(activity)) continue
    const sheet_code = (r.Code ?? '').trim()
    const sheet_sequence = (r.Sequence ?? '').trim()
    const amount = parseMoney(r['Allocation Amount'])
    if (!sheet_code && !sheet_sequence && amount == null) continue
    const state = (r['ERR state Implementer(s)'] ?? '').trim() || '(blank)'
    out.push({
      sheet_code,
      sheet_sequence,
      partner: (r.Partner ?? '').trim(),
      state,
      state_key: normState(state),
      amount: amount ?? 0,
      date: dateFromSheetCode(sheet_code),
      activity,
    })
  }
  return out
}

type AtRow = {
  allocation_id: string
  state: string
  amount: number
  decision_date: string | null
  decision_id: string | null
  restriction: string | null
  notes: string | null
  serial: number | null
}

async function fetchWrrAllocations(): Promise<AtRow[]> {
  const sb = getSupabaseAdmin()
  const rows: AtRow[] = []
  const pageSize = 100
  let from = 0
  while (true) {
    let data: Record<string, unknown>[] | null = null
    let lastError: { message?: string } | null = null
    for (let attempt = 1; attempt <= 4; attempt++) {
      // Pull a page of all allocations then filter — FDW or() on restriction can be flaky
      const res = await sb
        .from('allocations')
        .select(
          'allocation_id, state, allocation_amount, decision_date, decision_id, restriction, notes, serial, partner'
        )
        .or('restriction.ilike.%WRR%,restriction.ilike.%WSRR%')
        .range(from, from + pageSize - 1)
      if (!res.error) {
        data = (res.data as Record<string, unknown>[]) || []
        lastError = null
        break
      }
      lastError = res.error
      await new Promise((r) => setTimeout(r, attempt * 1500))
    }
    if (lastError) throw new Error(lastError.message)
    if (!data?.length) break
    for (const r of data) {
      if (!isWrrLabel(r.restriction != null ? String(r.restriction) : null)) continue
      const id = jsonbToText(r.allocation_id) || ''
      rows.push({
        allocation_id: id,
        state: String(r.state ?? '').trim() || '(blank)',
        amount: money(r.allocation_amount != null ? Number(r.allocation_amount) : 0),
        decision_date: toIsoDate(r.decision_date) || dateFromAllocationId(id),
        decision_id: jsonbToText(r.decision_id),
        restriction: r.restriction != null ? String(r.restriction) : null,
        notes: r.notes != null ? String(r.notes) : null,
        serial: r.serial != null ? Number(r.serial) : null,
      })
    }
    if (data.length < pageSize) break
    from += pageSize
  }
  return rows
}

function writeCsv(path: string, rows: Record<string, string | number | null>[]) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, Papa.unparse(rows), 'utf8')
  console.log(`Wrote ${rows.length} rows → ${path}`)
}

async function main() {
  console.log(`GT CSV: ${GT_CSV}`)
  console.log(`GT filter: ${ACTIVITY_COL} contains WRR/WSRR`)
  console.log('AT filter: restriction contains WRR/WSRR (same label)\n')

  const gt = parseGtWrr(GT_CSV)
  console.log(`Google Tracker WRR rows: ${gt.length}`)

  console.log('Fetching Airtable allocations with Restriction WRR/WSRR…')
  const at = await fetchWrrAllocations()
  console.log(`Airtable WRR allocations: ${at.length}`)

  writeCsv(
    resolve(process.cwd(), 'data/exports/wrr-airtable-allocations-raw.csv'),
    at.map((r) => ({
      allocation_id: r.allocation_id,
      state: r.state,
      state_key: normState(r.state),
      allocation_amount: r.amount,
      decision_date: r.decision_date,
      decision_id: r.decision_id,
      restriction: r.restriction,
      notes: r.notes,
      serial: r.serial,
    }))
  )

  writeCsv(
    resolve(process.cwd(), 'data/exports/wrr-google-tracker-allocations-raw.csv'),
    gt.map((r) => ({
      sheet_code: r.sheet_code,
      sheet_sequence: r.sheet_sequence,
      partner: r.partner,
      state: r.state,
      state_key: r.state_key,
      amount: r.amount,
      decision_date: r.date,
      activity: r.activity,
    }))
  )

  // --- By state ---
  type Agg = { count: number; amount: number }
  const gtByState = new Map<string, Agg>()
  const atByState = new Map<string, Agg>()
  for (const r of gt) {
    const a = gtByState.get(r.state_key) || { count: 0, amount: 0 }
    a.count++
    a.amount = money(a.amount + r.amount)
    gtByState.set(r.state_key, a)
  }
  for (const r of at) {
    const k = normState(r.state)
    const a = atByState.get(k) || { count: 0, amount: 0 }
    a.count++
    a.amount = money(a.amount + r.amount)
    atByState.set(k, a)
  }
  const states = [...new Set([...gtByState.keys(), ...atByState.keys()])].sort()
  writeCsv(
    resolve(process.cwd(), 'data/exports/wrr-gt-vs-airtable-by-state.csv'),
    states.map((state) => {
      const g = gtByState.get(state) || { count: 0, amount: 0 }
      const a = atByState.get(state) || { count: 0, amount: 0 }
      return {
        state,
        gt_count: g.count,
        gt_amount: g.amount,
        airtable_count: a.count,
        airtable_amount: a.amount,
        count_delta_gt_minus_at: g.count - a.count,
        amount_delta_gt_minus_at: money(g.amount - a.amount),
      }
    })
  )

  // --- By date (separate GT vs AT date columns; sources differ) ---
  // GT date = parsed from sheet Code; AT date = decision_date / allocation_id
  const gtByDate = new Map<string, Agg>()
  const atByDate = new Map<string, Agg>()
  for (const r of gt) {
    const d = r.date || '(no date)'
    const a = gtByDate.get(d) || { count: 0, amount: 0 }
    a.count++
    a.amount = money(a.amount + r.amount)
    gtByDate.set(d, a)
  }
  for (const r of at) {
    const d = r.decision_date || '(no date)'
    const a = atByDate.get(d) || { count: 0, amount: 0 }
    a.count++
    a.amount = money(a.amount + r.amount)
    atByDate.set(d, a)
  }
  const dates = [...new Set([...gtByDate.keys(), ...atByDate.keys()])].sort()
  writeCsv(
    resolve(process.cwd(), 'data/exports/wrr-gt-vs-airtable-by-date.csv'),
    dates.map((date) => {
      const g = gtByDate.get(date)
      const a = atByDate.get(date)
      return {
        gt_date: g ? date : null,
        airtable_date: a ? date : null,
        gt_count: g?.count ?? 0,
        gt_amount: g?.amount ?? 0,
        airtable_count: a?.count ?? 0,
        airtable_amount: a?.amount ?? 0,
        count_delta_gt_minus_at: (g?.count ?? 0) - (a?.count ?? 0),
        amount_delta_gt_minus_at: money((g?.amount ?? 0) - (a?.amount ?? 0)),
      }
    })
  )

  // --- By decision (separate GT vs AT decision columns) ---
  // GT decision = sheet Code; AT decision = allocation_id series (LCC.AD.Partner.YY-MM-DD)
  function atDecisionKey(allocationId: string): string {
    const m = allocationId.match(/^(LCC\.AD\.[^.]+\.\d{2}-\d{2}-\d{2})\./)
    return m ? m[1] : allocationId || '(no decision)'
  }

  const gtByDecision = new Map<string, Agg>()
  const atByDecision = new Map<string, Agg>()
  for (const r of gt) {
    const d = r.sheet_code || '(no decision)'
    const a = gtByDecision.get(d) || { count: 0, amount: 0 }
    a.count++
    a.amount = money(a.amount + r.amount)
    gtByDecision.set(d, a)
  }
  for (const r of at) {
    const d = atDecisionKey(r.allocation_id)
    const a = atByDecision.get(d) || { count: 0, amount: 0 }
    a.count++
    a.amount = money(a.amount + r.amount)
    atByDecision.set(d, a)
  }
  // Outer-join style: one row per GT decision and one per AT decision (no forced key match)
  const byDecisionRows: Record<string, string | number | null>[] = []
  for (const [d, g] of [...gtByDecision.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    byDecisionRows.push({
      gt_decision: d,
      airtable_decision: null,
      gt_count: g.count,
      gt_amount: g.amount,
      airtable_count: 0,
      airtable_amount: 0,
      count_delta_gt_minus_at: g.count,
      amount_delta_gt_minus_at: g.amount,
    })
  }
  for (const [d, a] of [...atByDecision.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    byDecisionRows.push({
      gt_decision: null,
      airtable_decision: d,
      gt_count: 0,
      gt_amount: 0,
      airtable_count: a.count,
      airtable_amount: a.amount,
      count_delta_gt_minus_at: -a.count,
      amount_delta_gt_minus_at: money(0 - a.amount),
    })
  }
  writeCsv(
    resolve(process.cwd(), 'data/exports/wrr-gt-vs-airtable-by-decision.csv'),
    byDecisionRows
  )

  // --- Totals: decisions + allocations ---
  const gtDecisions = new Set(gt.map((r) => r.sheet_code).filter(Boolean))
  const atDecisionIds = new Set(
    at.map((r) => r.decision_id).filter((x): x is string => !!x && !/^rec/.test(x))
  )
  const atDecisionDates = new Set(at.map((r) => r.decision_date).filter(Boolean) as string[])
  const atSeries = new Set(atByDecision.keys())

  const gtAllocCount = gt.length
  const atAllocCount = at.length
  const gtAmount = money(gt.reduce((s, r) => s + r.amount, 0))
  const atAmount = money(at.reduce((s, r) => s + r.amount, 0))
  const atPositive = at.filter((r) => r.amount > 0)
  const atNegative = at.filter((r) => r.amount < 0)
  const atZero = at.filter((r) => r.amount === 0)

  writeCsv(resolve(process.cwd(), 'data/exports/wrr-gt-vs-airtable-totals.csv'), [
    {
      metric: 'decisions',
      google_tracker: gtDecisions.size,
      airtable: atSeries.size,
      note: 'GT = distinct sheet_code; AT = distinct allocation_id series (LCC.AD.Partner.YY-MM-DD)',
    },
    {
      metric: 'decision_dates',
      google_tracker: new Set(gt.map((r) => r.date).filter(Boolean)).size,
      airtable: atDecisionDates.size,
      note: 'Distinct decision dates',
    },
    {
      metric: 'decision_id_text_values',
      google_tracker: null,
      airtable: atDecisionIds.size,
      note: 'AT decision_id when not an Airtable rec… link',
    },
    {
      metric: 'allocations',
      google_tracker: gtAllocCount,
      airtable: atAllocCount,
      note: 'Row counts',
    },
    {
      metric: 'allocation_amount_sum',
      google_tracker: gtAmount,
      airtable: atAmount,
      note: 'AT includes negative adjustment rows',
    },
    {
      metric: 'airtable_positive_rows',
      google_tracker: null,
      airtable: atPositive.length,
      note: `sum=${money(atPositive.reduce((s, r) => s + r.amount, 0))}`,
    },
    {
      metric: 'airtable_negative_rows',
      google_tracker: null,
      airtable: atNegative.length,
      note: `sum=${money(atNegative.reduce((s, r) => s + r.amount, 0))}`,
    },
    {
      metric: 'airtable_zero_rows',
      google_tracker: null,
      airtable: atZero.length,
      note: '',
    },
    {
      metric: 'amount_delta_gt_minus_at',
      google_tracker: gtAmount,
      airtable: atAmount,
      note: String(money(gtAmount - atAmount)),
    },
  ])

  console.log('\n=== Summary ===')
  console.log(
    `GT WRR rows: ${gtAllocCount} | decisions(sheet_code): ${gtDecisions.size} | amount: $${gtAmount.toLocaleString()}`
  )
  console.log(
    `AT WRR rows: ${atAllocCount} (pos ${atPositive.length} / neg ${atNegative.length} / zero ${atZero.length}) | series: ${atSeries.size} | amount: $${atAmount.toLocaleString()}`
  )
  console.log(`Δ amount (GT − AT): $${money(gtAmount - atAmount).toLocaleString()}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
