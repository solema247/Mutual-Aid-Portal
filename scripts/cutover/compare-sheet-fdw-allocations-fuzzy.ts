/**
 * Fuzzy match Google Sheet allocations vs FDW using Airtable ID formula semantics:
 *   LCC.AD.{Partner}.{YY-MM-DD}.{Serial}
 *
 * Sheet uses alternate conventions; we normalize dates and match on:
 *   1) Exact id when formats align
 *   2) partner + decision_date + state + amount (fuzzy)
 *
 *   npx tsx scripts/cutover/compare-sheet-fdw-allocations-fuzzy.ts
 */
import { config } from 'dotenv'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import Papa from 'papaparse'
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'

config({ path: resolve(process.cwd(), '.env.local') })

const CSV_PATH = resolve(
  process.cwd(),
  "data/imports/LCC_ERRs_LoHub & Partner Grant Tracker - ERR's-Grants_Allocation - LCC_ERRs_LoHub & Partner Grant Tracker - ERR's-Grants_Allocation.csv"
)
const OUTPUT_PATH = resolve(process.cwd(), 'data/imports/sheet-airtable-allocation-match.csv')

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

/** Allow ±2 cents for sheet vs Airtable rounding differences */
const AMOUNT_TOLERANCE_CENTS = 2
/** Allow ±$1 when one sheet row is split across two Airtable decision dates */
const SPLIT_AMOUNT_TOLERANCE_CENTS = 100
/** Allow up to ±$100 for split pairs that bridge an established sibling decision date */
const SPLIT_BRIDGING_TOLERANCE_CENTS = 10000

function fdwIdsFromMatch(id: string): string[] {
  return id.split(';').map((s) => s.trim()).filter(Boolean)
}

function amountCents(amount: number): number {
  return Math.round(amount * 100)
}

function amountCentsVariants(amount: number): number[] {
  const c = amountCents(amount)
  const out = new Set<number>()
  for (let d = -AMOUNT_TOLERANCE_CENTS; d <= AMOUNT_TOLERANCE_CENTS; d++) {
    out.add(c + d)
  }
  return [...out]
}

function lookupIndex(
  index: Map<string, string[]>,
  keyParts: string[],
  amount: number,
  used: Set<string>
): string[] {
  const seen = new Set<string>()
  const hits: string[] = []
  for (const cents of amountCentsVariants(amount)) {
    const key = [...keyParts, String(cents)].join('|')
    for (const id of index.get(key) ?? []) {
      if (!seen.has(id) && !used.has(id)) {
        seen.add(id)
        hits.push(id)
      }
    }
  }
  return hits
}

function normState(s: string | null | undefined): string {
  return (s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/al jazeera/g, 'al jazirah')
    .replace(/gadarif/g, 'gadaref')
    .replace(/sinar/g, 'sennar')
    .replace(/cross borden/g, 'cross border')
    .trim()
}

/** Parse DD-MM-YYYY or DD-MM-YY → YY-MM-DD (Airtable DATETIME_FORMAT style) */
function sheetDateToYyMmDd(token: string): string | null {
  const parts = token.split('-').map((p) => p.trim())
  if (parts.length !== 3) return null
  const [a, b, c] = parts
  if (c.length === 4) {
    return `${c.slice(-2)}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`
  }
  if (c.length === 2) {
    return `${c}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`
  }
  return null
}

/** FDW id prefix without serial, e.g. LCC.AD.P2H.25-05-28 */
function fdwSeries(id: string): string | null {
  const m = id.match(/^(.+)\.\d+$/)
  return m ? m[1] : null
}

type LikelyAirtable = {
  likely_airtable_series: string | null
  likely_airtable_allocation_id: string | null
  likely_airtable_state: string | null
  airtable_amount: number | null
  amount_mismatch: number | null
}

function emptyLikely(): LikelyAirtable {
  return {
    likely_airtable_series: null,
    likely_airtable_allocation_id: null,
    likely_airtable_state: null,
    airtable_amount: null,
    amount_mismatch: null,
  }
}

function amountDiffCents(a: number, b: number): number {
  return Math.abs(amountCents(a) - amountCents(b))
}

/** FDW: LCC.AD.P2H.26-06-25.587 */
function parseFdwAllocationId(id: string): {
  partner: string
  yymmdd: string
  serial: string
} | null {
  const m = id.match(/^LCC\.AD\.([^.]+)\.(\d{2}-\d{2}-\d{2})\.(\d+)$/)
  if (!m) return null
  return { partner: m[1], yymmdd: m[2], serial: m[3] }
}

type SheetAlloc = {
  sequence: string
  code: string | null
  partner: string | null
  state: string | null
  amount: number | null
  yymmdd: string | null
  yymmddCandidates: string[]
  donor: string | null
}

/** Decision date(s) embedded in sheet Code, e.g. LCC.AD.P2H.15-04-26-40 → 26-04-15 */
function codeDateCandidates(code: string | null): string[] {
  if (!code) return []
  const out = new Set<string>()
  const patterns = [
    /^LCC\.AD\.[A-Za-z0-9 ]+\.(\d{2}-\d{2}-\d{4})-\d+$/,
    /^LCC\.AD\.[A-Za-z0-9 ]+\.(\d{2}-\d{2}-\d{2})-\d+$/,
    /^LCC\.AD\.(\d{2}-\d{2}-\d{4})-\d+$/,
    /^MAG\.AD\.[A-Za-z0-9 ]+\.(\d{2}-\d{2}-\d{2})-\d+$/,
  ]
  for (const re of patterns) {
    const m = code.match(re)
    if (m?.[1]) {
      const y = sheetDateToYyMmDd(m[1])
      if (y) out.add(y)
    }
  }
  return [...out]
}

/** Hint batch dates: inferred batch → anchored Code date → date-aware siblings → sequence */
function resolveHintBatchDates(
  s: SheetAlloc,
  dateAwareSiblingMajority: Set<string>,
  batchNoDateDates: Set<string>,
  hasPartnerSeries: (partner: string, yymmdd: string) => boolean
): Set<string> {
  if (batchNoDateDates.size) return batchNoDateDates
  const fromCode = codeDateCandidates(s.code)
  if (fromCode.some((d) => hasPartnerSeries(s.partner!, d))) return new Set(fromCode)
  if (dateAwareSiblingMajority.size) return dateAwareSiblingMajority
  if (fromCode.length) return new Set(fromCode)
  if (s.yymmddCandidates.length) return new Set(s.yymmddCandidates)
  return new Set()
}

/** Collect all date tokens embedded in sheet Code / Sequence */
function extractSheetDateCandidates(sequence: string, code: string | null): string[] {
  const candidates = new Set<string>()
  const patterns = [
    /^LCC\.AD\.[A-Za-z0-9 ]+\.(\d{2}-\d{2}-\d{2})-\d+-\d+$/,
    /^LCC\.AD\.(\d{2}-\d{2}-\d{4})-\d+-\d+$/,
    /^LCC\.AD\.(?:[^.]+)\.(\d{2}-\d{2}-\d{4})-\d+$/,
    /^LCC\.AD\.[A-Za-z0-9 ]+\.(\d{2}-\d{2}-\d{2})-\d+$/,
  ]
  for (const s of [sequence, code].filter(Boolean) as string[]) {
    for (const re of patterns) {
      const m = s.match(re)
      if (m?.[1]) {
        const y = sheetDateToYyMmDd(m[1])
        if (y) candidates.add(y)
      }
    }
  }
  return [...candidates]
}

function partnerFromCodeOrSequence(code: string | null, sequence: string): string | null {
  for (const s of [code, sequence].filter(Boolean) as string[]) {
    const m = s.match(/^(?:LCC|MAG)\.AD\.([^.]+)\./)
    if (m?.[1]) return m[1]
  }
  return null
}

function parseSheetRow(r: Record<string, string>): SheetAlloc & { yymmddCandidates: string[] } | null {
  const sequence = r.Sequence?.trim()
  if (!sequence) return null

  const code = r.Code?.trim() || null
  const partner = r.Partner?.trim() || partnerFromCodeOrSequence(code, sequence)
  const yymmddCandidates = extractSheetDateCandidates(sequence, code)

  return {
    sequence,
    code,
    partner,
    state: r['ERR state Implementer(s)']?.trim() || null,
    amount: parseMoney(r['Allocation Amount '] ?? r['Allocation Amount']),
    yymmdd: yymmddCandidates[0] ?? null,
    yymmddCandidates,
    donor: r.Donor?.trim() || null,
  }
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
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('allocations')
      .select('allocation_id, state, allocation_amount, decision_date, serial, partner')
      .range(from, from + 999)
    if (error) throw error
    if (!data?.length) break
    rows.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
  return rows
}

async function main() {
  const raw = readFileSync(CSV_PATH, 'utf8')
  const parsed = Papa.parse<Record<string, string>>(raw, { header: true, skipEmptyLines: true })
  const sheetAll = parsed.data.map(parseSheetRow).filter(Boolean) as SheetAlloc[]

  const fdwRaw = await fetchFdw()

  type FdwAlloc = {
    id: string
    partner: string | null
    yymmdd: string | null
    serial: number | null
    state: string | null
    amount: number | null
  }

  const fdw: FdwAlloc[] = []
  for (const r of fdwRaw) {
    const id = jsonbToText(r.allocation_id)
    if (!id) continue
    const parsedId = parseFdwAllocationId(id)
    let yymmdd = parsedId?.yymmdd ?? null
    if (!yymmdd && r.decision_date) {
      const d = String(r.decision_date).slice(0, 10)
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        yymmdd = `${d.slice(2, 4)}-${d.slice(5, 7)}-${d.slice(8, 10)}`
      }
    }
    fdw.push({
      id,
      partner: parsedId?.partner ?? jsonbToText(r.partner),
      yymmdd,
      serial: r.serial != null ? Number(r.serial) : parsedId ? Number(parsedId.serial) : null,
      state: r.state,
      amount: r.allocation_amount != null ? Math.round(Number(r.allocation_amount) * 100) / 100 : null,
    })
  }

  const fdwById = new Map(fdw.map((f) => [f.id, f]))

  const partnerSeriesDates = new Map<string, Set<string>>()
  for (const f of fdw) {
    if (!f.partner || !f.yymmdd) continue
    const dates = partnerSeriesDates.get(f.partner) ?? new Set<string>()
    dates.add(f.yymmdd)
    partnerSeriesDates.set(f.partner, dates)
  }

  function hasPartnerSeries(partner: string, yymmdd: string): boolean {
    return partnerSeriesDates.get(partner)?.has(yymmdd) ?? false
  }

  const fuzzyIndex = new Map<string, string[]>()
  const noDateIndex = new Map<string, string[]>()
  for (const f of fdw) {
    if (!f.partner || !f.state || f.amount == null) continue
    if (f.yymmdd) {
      const key = `${f.partner}|${f.yymmdd}|${normState(f.state)}|${amountCents(f.amount)}`
      const list = fuzzyIndex.get(key) ?? []
      list.push(f.id)
      fuzzyIndex.set(key, list)
    }
    const key2 = `${f.partner}|${normState(f.state)}|${amountCents(f.amount)}`
    const list2 = noDateIndex.get(key2) ?? []
    list2.push(f.id)
    noDateIndex.set(key2, list2)
  }

  /** When sheet Code date has no Airtable series, infer decision date from batch-wide exact hits */
  const MIN_BATCH_NO_DATE_HITS = 3
  const MIN_BATCH_NO_DATE_RATIO = 0.5

  function noDateHitsForRow(s: SheetAlloc): string[] {
    if (!s.partner || !s.state || s.amount == null) return []
    return lookupIndex(noDateIndex, [s.partner, normState(s.state)], s.amount, new Set())
  }

  /** partner|yymmdd → sheet Code that anchors to an existing Airtable series */
  function buildClaimedPartnerDates(): Map<string, string> {
    const claimed = new Map<string, string>()
    const seenCodes = new Set<string>()
    for (const s of sheetAll) {
      if (!s.code || !s.partner || seenCodes.has(s.code)) continue
      seenCodes.add(s.code)
      for (const d of codeDateCandidates(s.code)) {
        if (!hasPartnerSeries(s.partner, d)) continue
        const key = `${s.partner}|${d}`
        if (!claimed.has(key)) claimed.set(key, s.code)
      }
    }
    return claimed
  }

  const claimedPartnerDates = buildClaimedPartnerDates()

  function isClaimedByOtherCode(partner: string, yymmdd: string, code: string | null): boolean {
    const owner = claimedPartnerDates.get(`${partner}|${yymmdd}`)
    return owner != null && owner !== code
  }

  function inferBatchNoDateDecisionDates(): Map<string, Set<string>> {
    const byCode = new Map<string, SheetAlloc[]>()
    for (const s of sheetAll) {
      if (!s.code) continue
      const list = byCode.get(s.code) ?? []
      list.push(s)
      byCode.set(s.code, list)
    }

    const out = new Map<string, Set<string>>()
    for (const [code, rows] of byCode) {
      const partner = rows[0]?.partner
      if (!partner) continue

      const dateHits = new Map<string, number>()
      for (const r of rows) {
        const seenDates = new Set<string>()
        for (const id of noDateHitsForRow(r)) {
          const yymmdd = fdwById.get(id)?.yymmdd
          if (!yymmdd || seenDates.has(yymmdd)) continue
          seenDates.add(yymmdd)
          dateHits.set(yymmdd, (dateHits.get(yymmdd) ?? 0) + 1)
        }
      }
      if (!dateHits.size) continue

      const batchSize = rows.length
      const maxHits = Math.max(...dateHits.values())
      if (maxHits < MIN_BATCH_NO_DATE_HITS && maxHits / batchSize < MIN_BATCH_NO_DATE_RATIO) {
        continue
      }

      const plausible = new Set<string>()
      for (const [date, count] of dateHits) {
        if (count === maxHits) plausible.add(date)
      }
      if (plausible.size) out.set(code, plausible)
    }
    return out
  }

  const batchNoDateDecisionDates = inferBatchNoDateDecisionDates()

  let exactId = 0
  let fuzzyMatch = 0
  let noDateMatch = 0
  let batchDisambigMatch = 0
  let secondPassMatch = 0
  let splitMatch = 0
  let unmatched = 0
  const matchedPairs: Array<{
    sheet_code: string | null
    sheet_sequence: string
    fdw_allocation_id: string
    match_method: string
    partner: string | null
    state: string | null
    amount: number | null
  }> = []
  const usedFdw = new Set<string>()

  function recordMatch(
    s: SheetAlloc,
    fdwId: string,
    method: string
  ) {
    matchedPairs.push({
      sheet_code: s.code,
      sheet_sequence: s.sequence,
      fdw_allocation_id: fdwId,
      match_method: method,
      partner: s.partner,
      state: s.state,
      amount: s.amount,
    })
  }

  function batchDecisionDates(code: string | null): Set<string> {
    if (!code) return new Set()
    const dates = new Set<string>()
    for (const p of matchedPairs) {
      if (p.sheet_code !== code) continue
      for (const id of fdwIdsFromMatch(p.fdw_allocation_id)) {
        const f = fdwById.get(id)
        if (f?.yymmdd) dates.add(f.yymmdd)
      }
    }
    return dates
  }

  /** Decision date(s) shared by the most date-aware sibling matches in a Code batch */
  function majorityBatchDecisionDates(
    code: string | null,
    dateAwareOnly = false
  ): Set<string> {
    if (!code) return new Set()
    const counts = new Map<string, number>()
    for (const p of matchedPairs) {
      if (p.sheet_code !== code) continue
      if (
        dateAwareOnly &&
        p.match_method !== 'exact_id' &&
        !p.match_method.includes('date')
      ) {
        continue
      }
      for (const id of fdwIdsFromMatch(p.fdw_allocation_id)) {
        const f = fdwById.get(id)
        if (!f?.yymmdd) continue
        counts.set(f.yymmdd, (counts.get(f.yymmdd) ?? 0) + 1)
      }
    }
    if (!counts.size) return new Set()
    const max = Math.max(...counts.values())
    const dates = new Set<string>()
    for (const [date, count] of counts) {
      if (count === max) dates.add(date)
    }
    return dates
  }

  /** Narrow ambiguous hits using sheet date tokens or sibling rows in same Code batch */
  function disambiguateHits(
    hits: string[],
    s: SheetAlloc & { yymmddCandidates: string[] }
  ): string[] {
    if (hits.length <= 1) return hits

    let narrowed = hits
    if (s.yymmddCandidates.length) {
      const byDate = hits.filter((id) => {
        const f = fdwById.get(id)
        return f?.yymmdd && s.yymmddCandidates.includes(f.yymmdd)
      })
      if (byDate.length) narrowed = byDate
    }

    if (narrowed.length > 1 && s.code) {
      const batchDates = batchDecisionDates(s.code)
      if (batchDates.size) {
        const byBatch = narrowed.filter((id) => {
          const f = fdwById.get(id)
          return f?.yymmdd && batchDates.has(f.yymmdd)
        })
        if (byBatch.length) narrowed = byBatch
      }
    }

    return narrowed
  }

  function resolveHits(
    hits: string[],
    s: SheetAlloc & { yymmddCandidates: string[] },
    method: string
  ): boolean {
    const resolved = disambiguateHits(hits, s)
    if (resolved.length !== 1) return false

    const isBatch = hits.length > 1
    if (method === 'partner+date+state+amount') fuzzyMatch++
    else noDateMatch++
    if (isBatch) batchDisambigMatch++

    usedFdw.add(resolved[0])
    recordMatch(
      s,
      resolved[0],
      isBatch ? `${method}+batch_disambig` : method
    )
    return true
  }

  function noDateAllowedDates(s: SheetAlloc): Set<string> | null {
    if (!s.partner) return null
    const inferred = s.code ? batchNoDateDecisionDates.get(s.code) : undefined
    if (inferred?.size) return inferred

    const anchored = codeDateCandidates(s.code).filter((d) => hasPartnerSeries(s.partner!, d))
    if (anchored.length) return new Set(anchored)

    return null
  }

  function filterNoDateHits(
    hits: string[],
    s: SheetAlloc,
    opts?: { restrictBatchDates?: boolean }
  ): string[] {
    const restrictBatchDates = opts?.restrictBatchDates !== false
    const inferred = s.code ? batchNoDateDecisionDates.get(s.code) : undefined
    const batchCoherent = (inferred?.size ?? 0) > 0

    let filtered = hits
    if (!batchCoherent) {
      filtered = hits.filter((id) => {
        const yymmdd = fdwById.get(id)?.yymmdd
        if (!yymmdd || !s.partner) return true
        return !isClaimedByOtherCode(s.partner, yymmdd, s.code)
      })
    }

    if (!restrictBatchDates) return filtered

    const allowed = noDateAllowedDates(s)
    if (!allowed) return filtered
    return filtered.filter((id) => {
      const yymmdd = fdwById.get(id)?.yymmdd
      return yymmdd != null && allowed.has(yymmdd)
    })
  }

  function tryMatch(s: SheetAlloc & { yymmddCandidates: string[] }): boolean {
    if (!s.partner || !s.state || s.amount == null) return false

    for (const yymmdd of s.yymmddCandidates) {
      const hits = lookupIndex(
        fuzzyIndex,
        [s.partner, yymmdd, normState(s.state)],
        s.amount,
        usedFdw
      )
      if (resolveHits(hits, s, 'partner+date+state+amount')) return true
    }

    const baseNoDateHits = lookupIndex(
      noDateIndex,
      [s.partner, normState(s.state)],
      s.amount,
      usedFdw
    )

    const hits2 = filterNoDateHits(baseNoDateHits, s)
    if (resolveHits(hits2, s, 'partner+state+amount')) return true

    // Batch outlier on a different Airtable decision date (e.g. Cross Border on 26-05-24)
    if (s.code && batchNoDateDecisionDates.has(s.code)) {
      const hits3 = filterNoDateHits(baseNoDateHits, s, { restrictBatchDates: false })
      if (resolveHits(hits3, s, 'partner+state+amount')) return true
    }

    return false
  }

  /**
   * One sheet row split across two Airtable allocations (same partner+state,
   * amounts sum to sheet). E.g. 14-05-25-11 North Darfur $33199 = .80+$8375 + .73+$24824.
   */
  function trySplitMatch(s: SheetAlloc): boolean {
    if (!s.partner || !s.state || s.amount == null) return false

    const stateNorm = normState(s.state)
    const candidates = fdw.filter(
      (f) =>
        !usedFdw.has(f.id) &&
        f.partner === s.partner &&
        normState(f.state) === stateNorm &&
        f.amount != null
    )
    if (candidates.length < 2) return false

    const target = amountCents(s.amount)
    const siblingDates = batchDecisionDates(s.code)

    const collectPairs = (tolCents: number) => {
      const pairs: Array<[(typeof fdw)[0], (typeof fdw)[0], number]> = []
      for (let i = 0; i < candidates.length; i++) {
        for (let j = i + 1; j < candidates.length; j++) {
          const sum = amountCents(candidates[i].amount!) + amountCents(candidates[j].amount!)
          const diff = Math.abs(sum - target)
          if (diff <= tolCents) pairs.push([candidates[i], candidates[j], diff])
        }
      }
      return pairs
    }

    const isBridging = (a: (typeof fdw)[0], b: (typeof fdw)[0]) => {
      if (!a.yymmdd || !b.yymmdd || a.yymmdd === b.yymmdd) return false
      if (!siblingDates.size) return false
      // Different decision dates, at least one already used by this sheet Code batch
      return siblingDates.has(a.yymmdd) || siblingDates.has(b.yymmdd)
    }

    let pairs = collectPairs(SPLIT_AMOUNT_TOLERANCE_CENTS)
    // Near-miss splits (e.g. Khartoum/Kassala on 15-04-26-40): allow larger gap if pair bridges sibling date
    if (!pairs.length && siblingDates.size) {
      pairs = collectPairs(SPLIT_BRIDGING_TOLERANCE_CENTS).filter(([a, b]) => isBridging(a, b))
    }
    if (!pairs.length) return false

    let chosen = pairs
    if (siblingDates.size) {
      const bridging = pairs.filter(([a, b]) => isBridging(a, b))
      if (bridging.length) chosen = bridging
      else {
        const touching = pairs.filter(
          ([a, b]) =>
            (a.yymmdd && siblingDates.has(a.yymmdd)) || (b.yymmdd && siblingDates.has(b.yymmdd))
        )
        if (touching.length) chosen = touching
      }
    }

    if (chosen.length > 1) {
      const minDiff = Math.min(...chosen.map((p) => p[2]))
      chosen = chosen.filter((p) => p[2] === minDiff)
    }
    if (chosen.length !== 1) return false

    const ordered = [chosen[0][0], chosen[0][1]].sort((a, b) => {
      const da = a.yymmdd ?? ''
      const db = b.yymmdd ?? ''
      if (da !== db) return da.localeCompare(db)
      return a.id.localeCompare(b.id)
    })

    usedFdw.add(ordered[0].id)
    usedFdw.add(ordered[1].id)
    recordMatch(s, `${ordered[0].id};${ordered[1].id}`, 'partner+state+split_amount')
    splitMatch++
    return true
  }

  function isMatched(sequence: string): boolean {
    return matchedPairs.some((p) => p.sheet_sequence === sequence)
  }

  for (const s of sheetAll) {
    if (fdwById.has(s.sequence)) {
      exactId++
      usedFdw.add(s.sequence)
      recordMatch(s, s.sequence, 'exact_id')
      continue
    }

    if (!tryMatch(s)) unmatched++
  }

  // Retry unmatched rows after siblings in the same Code batch have established decision dates
  for (const s of sheetAll) {
    if (isMatched(s.sequence)) continue
    if (tryMatch(s)) {
      secondPassMatch++
      unmatched--
    }
  }

  // Sheet amount split across two Airtable decision dates (same partner+state)
  for (const s of sheetAll) {
    if (isMatched(s.sequence)) continue
    if (trySplitMatch(s)) unmatched--
  }

  // Retry near-miss splits after siblings establish decision dates
  for (const s of sheetAll) {
    if (isMatched(s.sequence)) continue
    if (trySplitMatch(s)) unmatched--
  }

  const matchedFdwIds = new Set(
    matchedPairs.flatMap((p) => fdwIdsFromMatch(p.fdw_allocation_id))
  )
  const fdwUnmatched = fdw.filter((f) => !matchedFdwIds.has(f.id))

  console.log('=== Fuzzy sheet ↔ FDW match ===\n')
  console.log(`Sheet rows:              ${sheetAll.length}`)
  console.log(`FDW rows:                  ${fdw.length}`)
  console.log(`Exact id match:            ${exactId}`)
  console.log(`Fuzzy match (p+date+st+$): ${fuzzyMatch}`)
  console.log(`Match (p+state+amount):    ${noDateMatch}`)
  console.log(`Batch disambiguated:       ${batchDisambigMatch}`)
  console.log(`Second pass (batch retry): ${secondPassMatch}`)
  console.log(`Split amount (1 sheet→2):  ${splitMatch}`)
  console.log(`Sheet unmatched:           ${unmatched}`)
  console.log(`FDW unmatched:             ${fdwUnmatched.length}`)
  console.log(`Sheet with parsed date:    ${sheetAll.filter((s) => s.yymmdd).length}`)

  const matchedSequences = new Set(matchedPairs.map((p) => p.sheet_sequence))
  const unmatchedRows = sheetAll.filter((s) => !matchedSequences.has(s.sequence))

  function suggestLikelyAirtable(s: SheetAlloc): LikelyAirtable {
    if (!s.partner || !s.state) return emptyLikely()

    const hintDates = resolveHintBatchDates(
      s,
      majorityBatchDecisionDates(s.code, true),
      s.code ? (batchNoDateDecisionDates.get(s.code) ?? new Set()) : new Set(),
      hasPartnerSeries
    )
    const stateNorm = normState(s.state)

    const inHintBatch = (f: (typeof fdw)[0]) => {
      if (f.partner !== s.partner) return false
      if (hintDates.size && (!f.yymmdd || !hintDates.has(f.yymmdd))) return false
      return true
    }

    const packLikely = (f: (typeof fdw)[0]): LikelyAirtable => ({
      likely_airtable_series: fdwSeries(f.id),
      likely_airtable_allocation_id: f.id,
      likely_airtable_state: f.state,
      airtable_amount: f.amount,
      amount_mismatch:
        s.amount != null && f.amount != null
          ? Math.round((s.amount - f.amount) * 100) / 100
          : null,
    })

    const pickClosestAmount = (cands: (typeof fdw)[0][]): (typeof fdw)[0] | null => {
      if (!cands.length) return null
      if (s.amount == null) return cands[0]
      return cands.reduce<(typeof fdw)[0] | null>((best, f) => {
        if (f.amount == null) return best
        if (!best || best.amount == null) return f
        return amountDiffCents(f.amount, s.amount!) < amountDiffCents(best.amount, s.amount!)
          ? f
          : best
      }, null)
    }

    const batchPool = fdw.filter(inHintBatch)
    let byState = batchPool.filter((f) => normState(f.state) === stateNorm)

    if (byState.length === 1) return packLikely(byState[0])
    if (byState.length > 1) {
      const best = pickClosestAmount(byState)
      if (best) return packLikely(best)
    }

    if (s.amount != null && batchPool.length) {
      const byAmount = batchPool.filter(
        (f) => f.amount != null && amountDiffCents(f.amount, s.amount!) <= AMOUNT_TOLERANCE_CENTS
      )
      if (byAmount.length === 1) return packLikely(byAmount[0])
      if (byAmount.length > 1) {
        const stateHit = byAmount.filter((f) => normState(f.state) === stateNorm)
        if (stateHit.length === 1) return packLikely(stateHit[0])
        const best = pickClosestAmount(byAmount)
        if (best) return packLikely(best)
      }
    }

    // Same decision date + state, closest amount (amount mismatch reconciliation)
    if (byState.length > 0) {
      const best = pickClosestAmount(byState)
      if (best) return packLikely(best)
    }

    // Constrained to a known decision date — do not guess across other dates
    if (hintDates.size) return emptyLikely()

    // No date anchor: fall back to global partner + state closest amount
    byState = fdw.filter(
      (f) => f.partner === s.partner && normState(f.state) === stateNorm
    )
    if (byState.length === 1) return packLikely(byState[0])
    const best = pickClosestAmount(byState)
    if (best) return packLikely(best)

    return emptyLikely()
  }

  let likelySuggested = 0

  const csvRows: Record<string, string | number | null>[] = [
    ...matchedPairs.map((p) => {
      const ids = fdwIdsFromMatch(p.fdw_allocation_id)
      const amounts = ids
        .map((id) => fdwById.get(id)?.amount)
        .filter((a): a is number => a != null)
      const airtableAmount =
        amounts.length > 0
          ? Math.round(amounts.reduce((sum, a) => sum + a, 0) * 100) / 100
          : null
      return {
        match_status: 'matched',
        sheet_code: p.sheet_code,
        sheet_sequence: p.sheet_sequence,
        airtable_allocation_id: p.fdw_allocation_id,
        match_method: p.match_method,
        partner: p.partner,
        state: p.state,
        amount: p.amount,
        likely_airtable_series: null,
        likely_airtable_allocation_id: null,
        likely_airtable_state: null,
        airtable_amount: airtableAmount,
        amount_mismatch:
          p.amount != null && airtableAmount != null
            ? Math.round((p.amount - airtableAmount) * 100) / 100
            : null,
      }
    }),
    ...unmatchedRows.map((s) => {
      const likely = suggestLikelyAirtable(s)
      if (likely.likely_airtable_allocation_id) likelySuggested++
      return {
        match_status: 'no_airtable_match',
        sheet_code: s.code,
        sheet_sequence: s.sequence,
        airtable_allocation_id: null,
        match_method: null,
        partner: s.partner,
        state: s.state,
        amount: s.amount,
        ...likely,
      }
    }),
  ]

  const csv = Papa.unparse(csvRows, { header: true })
  writeFileSync(OUTPUT_PATH, csv, 'utf8')
  console.log(`\nWrote: ${OUTPUT_PATH}`)
  console.log(`  Matched rows:    ${matchedPairs.length}`)
  console.log(`  Unmatched rows:  ${unmatchedRows.length}`)
  console.log(`  Likely Airtable hint: ${likelySuggested} unmatched rows`)

  console.log('\nSample fuzzy matches (first 8):')
  for (const p of matchedPairs.filter((p) => p.match_method !== 'exact_id').slice(0, 8)) {
    console.log(`  ${p.sheet_sequence}`)
    console.log(`    → ${p.fdw_allocation_id} (${p.match_method})`)
  }

  console.log('\nSample sheet unmatched (first 5):')
  for (const s of unmatchedRows.slice(0, 5)) {
    console.log(`  ${s.code} | ${s.sequence} | ${s.partner} | ${s.yymmdd} | ${s.state} | $${s.amount}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
