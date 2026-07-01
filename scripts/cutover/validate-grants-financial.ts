/**
 * Grant financial totals: FDW vs canonical (matched by grant_id).
 *   npx tsx scripts/cutover/validate-grants-financial.ts
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'

config({ path: resolve(process.cwd(), '.env.local') })

const SKIP = new Set(['Avaaz 2'])

type Row = {
  grant_id: string | null
  total_transferred_amount_usd: number | null
  sum_activity_amount: number | null
  sum_transfer_fee_amount: number | null
}

function num(v: unknown): number {
  if (v == null || v === '') return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function sum(rows: Row[], field: keyof Row) {
  return rows.reduce((s, r) => s + num(r[field]), 0)
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
    'grant_id, total_transferred_amount_usd, sum_activity_amount, sum_transfer_fee_amount'

  const [fdw, canon] = await Promise.all([
    fetchAll<Row>('grants', select),
    fetchAll<Row>('grants_grid_view', select),
  ])

  const canonById = new Map(
    canon.map((r) => [(r.grant_id ?? '').trim(), r]).filter(([k]) => k)
  )

  const mismatches: string[] = []
  let matched = 0

  for (const f of fdw) {
    const id = (f.grant_id ?? '').trim()
    if (!id) continue
    const c = canonById.get(id)
    if (!c) {
      mismatches.push(`${id}: missing in canonical`)
      continue
    }
    matched++
    for (const field of [
      'total_transferred_amount_usd',
      'sum_activity_amount',
      'sum_transfer_fee_amount',
    ] as const) {
      if (Math.abs(num(f[field]) - num(c[field])) > 0.01) {
        mismatches.push(`${id}.${field}: FDW=${f[field]} canon=${c[field]}`)
      }
    }
  }

  const canonOnly = canon.filter((r) => {
    const id = (r.grant_id ?? '').trim()
    return id && !fdw.some((f) => (f.grant_id ?? '').trim() === id)
  })

  const fdwMatched = fdw.filter((r) => canonById.has((r.grant_id ?? '').trim()))

  console.log('=== Grant financial validation ===\n')
  console.log(`FDW grants: ${fdw.length}`)
  console.log(`Canonical grants: ${canon.length}`)
  console.log(`Matched by grant_id: ${matched}`)
  console.log(`Canonical-only: ${canonOnly.map((r) => r.grant_id).join(', ') || 'none'}\n`)

  const fields = [
    'sum_activity_amount',
    'total_transferred_amount_usd',
    'sum_transfer_fee_amount',
  ] as const

  console.log('Totals (all FDW vs matched FDW vs all canonical vs canonical excl. portal-only):')
  console.log(
    'Field'.padEnd(32) +
      'FDW all'.padStart(16) +
      'FDW matched'.padStart(16) +
      'Canon all'.padStart(16) +
      'Canon synced'.padStart(16)
  )
  for (const field of fields) {
    const canonSynced = canon.filter((r) => !SKIP.has((r.grant_id ?? '').trim()))
    console.log(
      field.padEnd(32) +
        sum(fdw, field).toLocaleString('en-US', { maximumFractionDigits: 2 }).padStart(16) +
        sum(fdwMatched, field).toLocaleString('en-US', { maximumFractionDigits: 2 }).padStart(16) +
        sum(canon, field).toLocaleString('en-US', { maximumFractionDigits: 2 }).padStart(16) +
        sum(canonSynced, field).toLocaleString('en-US', { maximumFractionDigits: 2 }).padStart(16)
    )
  }

  console.log()
  if (mismatches.length) {
    console.log(`FAIL — ${mismatches.length} mismatch(es):`)
    for (const m of mismatches) console.log(`  ${m}`)
  } else {
    console.log('PASS — all FDW grants match canonical on financial fields')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
