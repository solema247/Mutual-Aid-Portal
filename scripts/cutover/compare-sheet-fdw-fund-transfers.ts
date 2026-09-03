/**
 * Compare Google Tracker Transfers.csv vs Airtable fund requests + transfer segments
 * (via Supabase FDW tables fund_request / transfer_segment).
 *
 * Output is built for pivot tables:
 *   match_status — matched | amount_mismatch | sheet_only | airtable_only
 *   note         — short reason when status is not matched
 *
 *   npx tsx scripts/cutover/compare-sheet-fdw-fund-transfers.ts
 *   npx tsx scripts/cutover/compare-sheet-fdw-fund-transfers.ts "data/imports/Google Tracker Transfers.csv"
 */
import { config } from 'dotenv'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, resolve } from 'path'
import Papa from 'papaparse'
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'

config({ path: resolve(process.cwd(), '.env.local') })

const CSV_PATH = resolve(
  process.cwd(),
  process.argv[2] || 'data/imports/Google Tracker Transfers.csv'
)
const OUT_TRANSFERS = resolve(process.cwd(), 'data/exports/sheet-airtable-transfers-compare.csv')

const AMOUNT_TOLERANCE = 0.02

/** Pivot on these 4 values. Use `note` to drill into sheet_only / airtable_only. */
type MatchStatus = 'matched' | 'amount_mismatch' | 'sheet_only' | 'airtable_only'

function parseMoney(s: string | undefined | null): number | null {
  if (s == null) return null
  const raw = String(s).trim()
  if (!raw || raw.includes('#')) return null
  const n = Number(raw.replace(/[$,]/g, '').trim())
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

function parseSheetDate(s: string | undefined | null): string | null {
  if (!s) return null
  const t = String(s).trim()
  if (!t) return null
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

function amountsEqual(a: number | null, b: number | null): boolean {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  return Math.abs(a - b) <= AMOUNT_TOLERANCE
}

function asRecArray(v: unknown): string[] {
  if (v == null) return []
  if (Array.isArray(v)) return v.map(String).filter((x) => /^rec[A-Za-z0-9]+$/.test(x))
  if (typeof v === 'string') {
    const t = v.trim()
    if (/^rec[A-Za-z0-9]+$/.test(t)) return [t]
    try {
      return asRecArray(JSON.parse(t))
    } catch {
      return []
    }
  }
  return []
}

function normId(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase()
}

async function fetchAll(table: string, select: string): Promise<Record<string, unknown>[]> {
  const supabase = getSupabaseAdmin()
  const rows: Record<string, unknown>[] = []
  const pageSize = 100
  let from = 0
  while (true) {
    let data: Record<string, unknown>[] | null = null
    let lastError: { message?: string } | null = null
    for (let attempt = 1; attempt <= 4; attempt++) {
      const res = await supabase.from(table).select(select).range(from, from + pageSize - 1)
      if (!res.error) {
        data = (res.data || []) as Record<string, unknown>[]
        lastError = null
        break
      }
      lastError = res.error
      await new Promise((r) => setTimeout(r, attempt * 1500))
    }
    if (lastError) throw new Error(`${table}: ${lastError.message}`)
    if (!data?.length) break
    rows.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return rows
}

function jsonbToText(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') {
    const t = value.trim().replace(/^"|"$/g, '')
    if (!t || t.includes('#ERROR!') || /^rec[A-Za-z0-9]+$/.test(t)) return null
    return t
  }
  if (Array.isArray(value)) {
    const parts = value.map(jsonbToText).filter(Boolean) as string[]
    return parts.length ? [...new Set(parts)].join('; ') : null
  }
  if (typeof value === 'object') {
    if ('error' in (value as object)) return null
    return jsonbToText(Object.values(value as object)[0])
  }
  const s = String(value).trim()
  return s && !s.includes('#ERROR!') && !/^rec[A-Za-z0-9]+$/.test(s) ? s : null
}

type SheetLine = {
  sheet_row: number
  payment_id: string | null
  intermediary: string | null
  donor: string | null
  via: string | null
  total_amount: number | null
  date_received: string | null
  status: string | null
}

type AirtableTransfer = {
  request_id: string
  auto: number
  activity_amount: number | null
  transfer_fee_amount: number | null
  transfer_amount: number | null
  transfer_received_date: string | null
  status: string | null
  donor: string | null
  fsp: string | null
}

type OutRow = {
  match_status: MatchStatus
  note: string | null
  sheet_row: number | null
  sheet_payment_id: string | null
  airtable_request_id: string | null
  sheet_intermediary: string | null
  sheet_donor: string | null
  airtable_donor: string | null
  sheet_via: string | null
  airtable_fsp: string | null
  sheet_amount: number | null
  sheet_date_received: string | null
  sheet_status: string | null
  airtable_auto: number | null
  airtable_activity_amount: number | null
  airtable_fee_amount: number | null
  airtable_transfer_amount: number | null
  airtable_date_received: string | null
  airtable_status: string | null
}

function parseSheet(path: string): SheetLine[] {
  const parsed = Papa.parse<Record<string, string>>(readFileSync(path, 'utf8'), {
    header: true,
    skipEmptyLines: true,
  })
  const out: SheetLine[] = []
  let sheet_row = 1
  for (const r of parsed.data) {
    sheet_row++
    const payment_id = (r['Payment ID'] ?? '').trim() || null
    const total_amount = parseMoney(r['Total Amount'])
    if (
      !payment_id &&
      total_amount == null &&
      !(r.Intermediary ?? '').trim() &&
      !(r.Donor ?? '').trim()
    ) {
      continue
    }
    out.push({
      sheet_row,
      payment_id,
      intermediary: (r.Intermediary ?? '').trim() || null,
      donor: (r.Donor ?? '').trim() || null,
      via: (r.Via ?? '').trim() || null,
      total_amount,
      date_received: parseSheetDate(r['Date Received']),
      status: (r.Status ?? '').trim() || null,
    })
  }
  return out
}

function amountOk(sheetAmt: number | null, t: AirtableTransfer): boolean {
  return (
    amountsEqual(sheetAmt, t.activity_amount) ||
    amountsEqual(sheetAmt, t.transfer_amount) ||
    amountsEqual(sheetAmt, t.transfer_fee_amount) ||
    (t.activity_amount != null &&
      t.transfer_fee_amount != null &&
      amountsEqual(
        sheetAmt,
        Math.round((t.activity_amount + t.transfer_fee_amount) * 100) / 100
      ))
  )
}

function pickBest(
  sheet: SheetLine,
  candidates: AirtableTransfer[],
  used: Set<number>
): AirtableTransfer | null {
  const unused = candidates.filter((c) => !used.has(c.auto))
  if (!unused.length) return null

  const scored = unused.map((f) => {
    let score = 0
    const amt = sheet.total_amount
    if (amt != null) {
      if (amountsEqual(amt, f.transfer_amount)) score += 100
      else if (amountsEqual(amt, f.activity_amount)) score += 95
      else if (amountsEqual(amt, f.transfer_fee_amount)) score += 80
      else if (
        f.activity_amount != null &&
        f.transfer_fee_amount != null &&
        amountsEqual(amt, Math.round((f.activity_amount + f.transfer_fee_amount) * 100) / 100)
      ) {
        score += 90
      }
    }
    if (
      sheet.date_received &&
      f.transfer_received_date &&
      sheet.date_received === f.transfer_received_date
    ) {
      score += 20
    }
    return { fdw: f, score }
  })

  scored.sort((a, b) => b.score - a.score || a.fdw.auto - b.fdw.auto)
  const best = scored[0]
  if (!best || best.score < 80) {
    if (unused.length === 1 && sheet.total_amount != null) return unused[0]
    return null
  }
  return best.fdw
}

function matchSheetPairs(
  unmatched: SheetLine[],
  candidates: AirtableTransfer[],
  used: Set<number>
): Array<{ a: SheetLine; b: SheetLine; airtable: AirtableTransfer }> {
  const unused = candidates.filter((c) => !used.has(c.auto))
  const out: Array<{ a: SheetLine; b: SheetLine; airtable: AirtableTransfer }> = []
  const usedSheet = new Set<number>()

  for (const f of unused) {
    if (f.transfer_amount == null) continue
    let found: { a: SheetLine; b: SheetLine } | null = null
    for (let i = 0; i < unmatched.length && !found; i++) {
      if (usedSheet.has(unmatched[i].sheet_row)) continue
      for (let j = i + 1; j < unmatched.length; j++) {
        if (usedSheet.has(unmatched[j].sheet_row)) continue
        const a = unmatched[i].total_amount
        const b = unmatched[j].total_amount
        if (a == null || b == null) continue
        if (amountsEqual(Math.round((a + b) * 100) / 100, f.transfer_amount)) {
          found = { a: unmatched[i], b: unmatched[j] }
          break
        }
      }
    }
    if (found) {
      used.add(f.auto)
      usedSheet.add(found.a.sheet_row)
      usedSheet.add(found.b.sheet_row)
      out.push({ ...found, airtable: f })
    }
  }
  return out
}

function pushMatched(
  rows: OutRow[],
  s: SheetLine,
  requestId: string,
  t: AirtableTransfer,
  ok: boolean
) {
  rows.push({
    match_status: ok ? 'matched' : 'amount_mismatch',
    note: ok ? null : 'amount differs',
    sheet_row: s.sheet_row,
    sheet_payment_id: s.payment_id,
    airtable_request_id: requestId,
    sheet_intermediary: s.intermediary,
    sheet_donor: s.donor,
    airtable_donor: t.donor,
    sheet_via: s.via,
    airtable_fsp: t.fsp,
    sheet_amount: s.total_amount,
    sheet_date_received: s.date_received,
    sheet_status: s.status,
    airtable_auto: t.auto,
    airtable_activity_amount: t.activity_amount,
    airtable_fee_amount: t.transfer_fee_amount,
    airtable_transfer_amount: t.transfer_amount,
    airtable_date_received: t.transfer_received_date,
    airtable_status: t.status,
  })
}

function pushSheetOnly(
  rows: OutRow[],
  note: string,
  s: SheetLine,
  airtable_request_id: string | null
) {
  rows.push({
    match_status: 'sheet_only',
    note,
    sheet_row: s.sheet_row,
    sheet_payment_id: s.payment_id,
    airtable_request_id,
    sheet_intermediary: s.intermediary,
    sheet_donor: s.donor,
    airtable_donor: null,
    sheet_via: s.via,
    airtable_fsp: null,
    sheet_amount: s.total_amount,
    sheet_date_received: s.date_received,
    sheet_status: s.status,
    airtable_auto: null,
    airtable_activity_amount: null,
    airtable_fee_amount: null,
    airtable_transfer_amount: null,
    airtable_date_received: null,
    airtable_status: null,
  })
}

function pushAirtableOnly(rows: OutRow[], note: string, t: AirtableTransfer) {
  rows.push({
    match_status: 'airtable_only',
    note,
    sheet_row: null,
    sheet_payment_id: null,
    airtable_request_id: t.request_id,
    sheet_intermediary: null,
    sheet_donor: null,
    airtable_donor: t.donor,
    sheet_via: null,
    airtable_fsp: t.fsp,
    sheet_amount: null,
    sheet_date_received: null,
    sheet_status: null,
    airtable_auto: t.auto,
    airtable_activity_amount: t.activity_amount,
    airtable_fee_amount: t.transfer_fee_amount,
    airtable_transfer_amount: t.transfer_amount,
    airtable_date_received: t.transfer_received_date,
    airtable_status: t.status,
  })
}

function writeCsv(path: string, rows: OutRow[]) {
  mkdirSync(dirname(path), { recursive: true })
  const columns: (keyof OutRow)[] = [
    'match_status',
    'note',
    'sheet_row',
    'sheet_payment_id',
    'airtable_request_id',
    'sheet_intermediary',
    'sheet_donor',
    'airtable_donor',
    'sheet_via',
    'airtable_fsp',
    'sheet_amount',
    'sheet_date_received',
    'sheet_status',
    'airtable_auto',
    'airtable_activity_amount',
    'airtable_fee_amount',
    'airtable_transfer_amount',
    'airtable_date_received',
    'airtable_status',
  ]
  writeFileSync(path, Papa.unparse(rows, { columns }), 'utf8')
}

async function main() {
  console.log('Comparing Google Tracker Transfers vs Airtable fund requests + transfers…\n')
  console.log(`Sheet: ${CSV_PATH}`)

  const sheet = parseSheet(CSV_PATH)

  const [airtableFr, airtableTs, recBridge, grants, fsps] = await Promise.all([
    fetchAll('fund_request', 'request_id, transfer_id'),
    fetchAll(
      'transfer_segment',
      'auto, activity_amount, transfer_fee_amount, transfer_amount, transfer_received_date, status'
    ),
    // Bridge only: map Airtable transfer rec → auto + FSP (FSP is not on the FDW transfer_segment table)
    fetchAll('transfer_segments', 'auto_number, airtable_record_id, fsp_id'),
    fetchAll('grants', 'grant_id, donor_name, transfer_segment'),
    fetchAll('fsps', 'id, name'),
  ])

  const fspNameById = new Map<string, string>()
  for (const f of fsps) {
    const id = String(f.id || '').trim()
    const name = String(f.name || '').trim()
    if (id && name) fspNameById.set(id, name)
  }

  // Airtable grant → donor label for each linked transfer record id
  // (donor_name is often empty; fall back to grant_id / shortname)
  const donorByTsRec = new Map<string, string>()
  for (const g of grants) {
    const donor = jsonbToText(g.donor_name) || String(g.grant_id || '').trim() || null
    if (!donor) continue
    for (const rec of asRecArray(g.transfer_segment)) {
      donorByTsRec.set(rec, donor)
    }
  }

  const autoByRec = new Map<string, number>()
  const fspByAuto = new Map<number, string>()
  for (const t of recBridge) {
    const rec = String(t.airtable_record_id || '').trim()
    const auto = t.auto_number != null ? Number(t.auto_number) : NaN
    if (rec && Number.isFinite(auto)) autoByRec.set(rec, auto)
    if (Number.isFinite(auto) && t.fsp_id) {
      const name = fspNameById.get(String(t.fsp_id))
      if (name) fspByAuto.set(auto, name)
    }
  }

  const tsByAuto = new Map<number, Record<string, unknown>>()
  for (const t of airtableTs) {
    const a = Number(t.auto)
    if (Number.isFinite(a)) tsByAuto.set(a, t)
  }

  const byRequest = new Map<string, AirtableTransfer[]>()
  const usedAutos = new Set<number>()

  for (const fr of airtableFr) {
    const request_id = String(fr.request_id ?? '').trim()
    if (!request_id) continue
    const flats: AirtableTransfer[] = []
    for (const rec of asRecArray(fr.transfer_id)) {
      const auto = autoByRec.get(rec)
      const ts = auto != null ? tsByAuto.get(auto) : undefined
      if (auto == null || !ts) continue
      usedAutos.add(auto)
      flats.push({
        request_id,
        auto,
        activity_amount:
          ts.activity_amount != null ? Math.round(Number(ts.activity_amount) * 100) / 100 : null,
        transfer_fee_amount:
          ts.transfer_fee_amount != null
            ? Math.round(Number(ts.transfer_fee_amount) * 100) / 100
            : null,
        transfer_amount:
          ts.transfer_amount != null ? Math.round(Number(ts.transfer_amount) * 100) / 100 : null,
        transfer_received_date: ts.transfer_received_date
          ? String(ts.transfer_received_date).slice(0, 10)
          : null,
        status: ts.status != null ? String(ts.status) : null,
        donor: donorByTsRec.get(rec) ?? null,
        fsp: fspByAuto.get(auto) ?? null,
      })
    }
    byRequest.set(request_id, flats)
  }

  const orphanTs: AirtableTransfer[] = []
  for (const [auto, ts] of tsByAuto) {
    if (usedAutos.has(auto)) continue
    // Best-effort donor via reverse lookup of rec for this auto
    let donor: string | null = null
    for (const [rec, a] of autoByRec) {
      if (a === auto) {
        donor = donorByTsRec.get(rec) ?? null
        break
      }
    }
    orphanTs.push({
      request_id: `(unlinked auto ${auto})`,
      auto,
      activity_amount:
        ts.activity_amount != null ? Math.round(Number(ts.activity_amount) * 100) / 100 : null,
      transfer_fee_amount:
        ts.transfer_fee_amount != null
          ? Math.round(Number(ts.transfer_fee_amount) * 100) / 100
          : null,
      transfer_amount:
        ts.transfer_amount != null ? Math.round(Number(ts.transfer_amount) * 100) / 100 : null,
      transfer_received_date: ts.transfer_received_date
        ? String(ts.transfer_received_date).slice(0, 10)
        : null,
      status: ts.status != null ? String(ts.status) : null,
      donor,
      fsp: fspByAuto.get(auto) ?? null,
    })
  }

  const byRequestNorm = new Map<string, string>()
  for (const id of byRequest.keys()) byRequestNorm.set(normId(id), id)

  const rows: OutRow[] = []
  const usedAirtableAutos = new Set<number>()
  const sheetByPayment = new Map<string, SheetLine[]>()
  const blankPaymentLines: SheetLine[] = []

  for (const s of sheet) {
    if (!s.payment_id) {
      blankPaymentLines.push(s)
      continue
    }
    if (!sheetByPayment.has(s.payment_id)) sheetByPayment.set(s.payment_id, [])
    sheetByPayment.get(s.payment_id)!.push(s)
  }

  let matched = 0
  let amountMismatch = 0
  let sheetOnly = 0

  for (const [paymentId, lines] of sheetByPayment) {
    const requestId = byRequestNorm.get(normId(paymentId))
    const candidates = requestId ? [...(byRequest.get(requestId) || [])] : []
    const pending: SheetLine[] = []

    for (const s of lines) {
      if (!requestId) {
        sheetOnly++
        pushSheetOnly(rows, 'no Airtable payment', s, null)
        continue
      }

      const pick = pickBest(s, candidates, usedAirtableAutos)
      if (!pick) {
        pending.push(s)
        continue
      }

      usedAirtableAutos.add(pick.auto)
      const ok = amountOk(s.total_amount, pick)
      if (ok) matched++
      else amountMismatch++
      pushMatched(rows, s, requestId, pick, ok)
    }

    if (requestId && pending.length >= 2) {
      const pairs = matchSheetPairs(pending, candidates, usedAirtableAutos)
      const paired = new Set<number>()
      for (const pair of pairs) {
        paired.add(pair.a.sheet_row)
        paired.add(pair.b.sheet_row)
        for (const s of [pair.a, pair.b]) {
          matched++
          pushMatched(rows, s, requestId, pair.airtable, true)
        }
      }
      for (const s of pending) {
        if (paired.has(s.sheet_row)) continue
        sheetOnly++
        pushSheetOnly(rows, 'same payment, different split', s, requestId)
      }
    } else if (requestId) {
      for (const s of pending) {
        sheetOnly++
        pushSheetOnly(rows, 'same payment, different split', s, requestId)
      }
    }
  }

  for (const s of blankPaymentLines) {
    sheetOnly++
    pushSheetOnly(rows, 'blank Payment ID', s, null)
  }

  let airtableOnly = 0
  for (const [, flats] of byRequest) {
    for (const t of flats) {
      if (usedAirtableAutos.has(t.auto)) continue
      airtableOnly++
      pushAirtableOnly(rows, 'same payment, different split', t)
    }
  }
  for (const t of orphanTs) {
    airtableOnly++
    pushAirtableOnly(rows, 'unlinked transfer', t)
  }

  writeCsv(OUT_TRANSFERS, rows)

  console.log(
    `matched: ${matched} | amount_mismatch: ${amountMismatch} | sheet_only: ${sheetOnly} | airtable_only: ${airtableOnly}`
  )
  console.log(`Wrote ${OUT_TRANSFERS}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
