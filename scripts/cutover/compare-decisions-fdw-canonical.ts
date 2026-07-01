/**
 * Side-by-side FDW vs canonical decisions comparison (matched by airtable_record_id).
 *   npx tsx scripts/cutover/compare-decisions-fdw-canonical.ts
 *   npx tsx scripts/cutover/compare-decisions-fdw-canonical.ts --json > compare.json
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { writeFileSync } from 'fs'
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'

config({ path: resolve(process.cwd(), '.env.local') })

const JSON_OUT = process.argv.includes('--json')

type FdwRow = {
  id: string | null
  decision_id: string | null
  decision_id_proposed: unknown
  partner: unknown
  grant_name: unknown
  decision_amount: number | null
  sum_allocation_amount: number | null
  decision_date: string | null
  restriction: string | null
  notes: string | null
}

type CanonRow = {
  id: string
  airtable_record_id: string | null
  decision_id_proposed: string | null
  decision_id: string | null
  partner: string | null
  grant_name: string | null
  decision_amount: number | null
  sum_allocation_amount: number | null
  decision_date: string | null
  restriction: string | null
  notes: string | null
}

const FIELDS = [
  'decision_id_proposed',
  'decision_id',
  'decision_amount',
  'sum_allocation_amount',
  'decision_date',
  'restriction',
  'partner',
  'grant_name',
] as const

function jsonbToText(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') {
    const t = value.trim().replace(/^"|"$/g, '')
    if (!t || t.includes('#ERROR!')) return null
    return t
  }
  if (Array.isArray(value)) return value.length ? jsonbToText(value[0]) : null
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if ('error' in obj) return '#ERROR!'
    return jsonbToText(Object.values(obj)[0])
  }
  return String(value).trim() || null
}

function fdwDisplay(row: FdwRow): Record<string, string | number | null> {
  const proposed = jsonbToText(row.decision_id_proposed)
  return {
    decision_id_proposed: proposed,
    decision_id: row.decision_id?.trim() || proposed,
    decision_amount: row.decision_amount,
    sum_allocation_amount: row.sum_allocation_amount,
    decision_date: row.decision_date,
    restriction: row.restriction,
    partner: jsonbToText(row.partner),
    grant_name: jsonbToText(row.grant_name),
  }
}

function canonDisplay(row: CanonRow): Record<string, string | number | null> {
  return {
    decision_id_proposed: row.decision_id_proposed,
    decision_id: row.decision_id,
    decision_amount: row.decision_amount,
    sum_allocation_amount: row.sum_allocation_amount,
    decision_date: row.decision_date,
    restriction: row.restriction,
    partner: row.partner,
    grant_name: row.grant_name,
  }
}

function eq(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null && b == null) return true
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 0.01
  return String(a ?? '') === String(b ?? '')
}

function isRecId(s: string | null | undefined): boolean {
  return !!s && /^rec[A-Za-z0-9]+$/.test(s)
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

async function main() {
  const select =
    'id, decision_id, decision_id_proposed, partner, grant_name, decision_amount, sum_allocation_amount, decision_date, restriction, notes'

  const [fdwRows, canonRows] = await Promise.all([
    fetchAll<FdwRow>('distribution_decision', select),
    fetchAll<CanonRow>(
      'distribution_decision_master_sheet_1',
      'id, airtable_record_id, decision_id_proposed, decision_id, partner, grant_name, decision_amount, sum_allocation_amount, decision_date, restriction, notes'
    ),
  ])

  const canonByRec = new Map(canonRows.map((r) => [r.airtable_record_id, r]))
  const matchedCanonIds = new Set<string>()

  type Row = {
    key: string
    fdw_rec: string | null
    canon_uuid: string | null
    status: 'matched' | 'fdw_only' | 'canon_only'
    mismatches: string[]
    fdw: Record<string, string | number | null>
    canonical: Record<string, string | number | null>
  }

  const rows: Row[] = []

  for (const fdw of fdwRows) {
    const proposed = jsonbToText(fdw.decision_id_proposed)
    const fdwRec = fdw.id?.trim() || null

    if (!proposed || proposed === '#ERROR!') {
      rows.push({
        key: fdwRec ?? '?',
        fdw_rec: fdwRec,
        canon_uuid: null,
        status: 'fdw_only',
        mismatches: ['#ERROR! or missing proposed'],
        fdw: fdwDisplay(fdw),
        canonical: Object.fromEntries(FIELDS.map((f) => [f, null])),
      })
      continue
    }

    const canon = fdwRec ? canonByRec.get(fdwRec) : undefined
    if (canon) matchedCanonIds.add(canon.id)

    const fdwVals = fdwDisplay(fdw)
    const canonVals = canon ? canonDisplay(canon) : Object.fromEntries(FIELDS.map((f) => [f, null]))

    const mismatches: string[] = []
    if (!canon) {
      mismatches.push('no canonical row')
    } else {
      for (const f of FIELDS) {
        const fv = fdwVals[f]
        const cv = canonVals[f]
        if (f === 'decision_id_proposed' && canon.decision_id_proposed !== proposed) {
          if (canon.decision_id === proposed) {
            mismatches.push(`${f}: suffix disambiguation (${proposed} → ${canon.decision_id_proposed})`)
            continue
          }
        }
        if (f === 'partner' || f === 'grant_name') {
          if (isRecId(String(fv ?? '')) && cv) continue
        }
        if (!eq(fv, cv)) mismatches.push(`${f}: FDW=${JSON.stringify(fv)} canon=${JSON.stringify(cv)}`)
      }
      if (canon.airtable_record_id !== fdwRec) {
        mismatches.push(`airtable_record_id mismatch`)
      }
    }

    rows.push({
      key: canon?.decision_id_proposed ?? proposed,
      fdw_rec: fdwRec,
      canon_uuid: canon?.id ?? null,
      status: canon ? 'matched' : 'fdw_only',
      mismatches,
      fdw: fdwVals,
      canonical: canonVals,
    })
  }

  for (const canon of canonRows) {
    if (matchedCanonIds.has(canon.id)) continue
    rows.push({
      key: canon.decision_id_proposed ?? canon.id,
      fdw_rec: null,
      canon_uuid: canon.id,
      status: 'canon_only',
      mismatches: ['no FDW row'],
      fdw: Object.fromEntries(FIELDS.map((f) => [f, null])),
      canonical: canonDisplay(canon),
    })
  }

  rows.sort((a, b) => String(a.key).localeCompare(String(b.key)))

  const summary = {
    fdw_count: fdwRows.length,
    canon_count: canonRows.length,
    matched: rows.filter((r) => r.status === 'matched').length,
    fdw_only: rows.filter((r) => r.status === 'fdw_only').length,
    canon_only: rows.filter((r) => r.status === 'canon_only').length,
    with_field_mismatches: rows.filter((r) => r.mismatches.some((m) => !m.includes('suffix') && m !== 'no canonical row' && m !== 'no FDW row' && !m.includes('#ERROR!'))).length,
  }

  if (JSON_OUT) {
    console.log(JSON.stringify({ summary, rows }, null, 2))
    return
  }

  const outPath = resolve(process.cwd(), 'scripts/cutover/compare-decisions-fdw-canonical.json')
  writeFileSync(outPath, JSON.stringify({ summary, rows }, null, 2))

  console.log('Summary:', summary)
  console.log(`Full JSON: ${outPath}\n`)

  const hdr = [
    'decision_id_proposed',
    'status',
    'fdw_amount',
    'canon_amount',
    'fdw_sum_alloc',
    'canon_sum_alloc',
    'fdw_date',
    'canon_date',
    'fdw_restriction',
    'canon_restriction',
    'mismatches',
  ]
  console.log(hdr.join('\t'))
  for (const r of rows) {
    console.log(
      [
        r.key,
        r.status,
        r.fdw.decision_amount,
        r.canonical.decision_amount,
        r.fdw.sum_allocation_amount,
        r.canonical.sum_allocation_amount,
        r.fdw.decision_date,
        r.canonical.decision_date,
        r.fdw.restriction,
        r.canonical.restriction,
        r.mismatches.join('; ') || '—',
      ].join('\t')
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
