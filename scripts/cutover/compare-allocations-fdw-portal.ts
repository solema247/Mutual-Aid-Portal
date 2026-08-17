/**
 * Row-level allocations: FDW `allocations` vs portal `allocations_by_date`.
 * Match by Allocation_ID / allocation_id (jsonb text).
 *   npx tsx scripts/cutover/compare-allocations-fdw-portal.ts
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'

config({ path: resolve(process.cwd(), '.env.local') })

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

async function fetchAll(
  table: string,
  select: string
): Promise<Record<string, unknown>[]> {
  const supabase = getSupabaseAdmin()
  const rows: Record<string, unknown>[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data?.length) break
    rows.push(...(data as Record<string, unknown>[]))
    if (data.length < 1000) break
    from += 1000
  }
  return rows
}

async function main() {
  const [fdw, portal] = await Promise.all([
    fetchAll('allocations', 'allocation_id, allocation_amount, state'),
    fetchAll('allocations_by_date', 'Allocation_ID, "Allocation Amount", State, airtable_record_id'),
  ])

  const portalByKey = new Map<string, { amount: number; state: string | null; rec: string | null }>()
  for (const r of portal) {
    const key = String(r.Allocation_ID ?? '').trim()
    if (!key) continue
    portalByKey.set(key, {
      amount: Number(r['Allocation Amount']) || 0,
      state: (r.State as string) ?? null,
      rec: (r.airtable_record_id as string) ?? null,
    })
  }

  const fdwByKey = new Map<string, { amount: number; state: string | null }>()
  for (const r of fdw) {
    const key = jsonbToText(r.allocation_id)
    if (!key) continue
    fdwByKey.set(key, {
      amount: Number(r.allocation_amount) || 0,
      state: jsonbToText(r.state),
    })
  }

  const fdwOnly: string[] = []
  const amountMismatch: { key: string; fdw: number; portal: number; delta: number }[] = []
  let matched = 0

  for (const [key, f] of fdwByKey) {
    const p = portalByKey.get(key)
    if (!p) {
      fdwOnly.push(key)
      continue
    }
    matched++
    if (Math.abs(f.amount - p.amount) >= 0.01) {
      amountMismatch.push({
        key,
        fdw: f.amount,
        portal: p.amount,
        delta: p.amount - f.amount,
      })
    }
  }

  const portalOnly = [...portalByKey.keys()].filter((k) => !fdwByKey.has(k))

  amountMismatch.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

  console.log('Allocations FDW vs portal (by Allocation_ID)')
  console.log(`FDW keys: ${fdwByKey.size} | portal keys: ${portalByKey.size}`)
  console.log(`matched: ${matched}`)
  console.log(`fdw_only: ${fdwOnly.length}`)
  console.log(`portal_only: ${portalOnly.length}`)
  console.log(`amount_mismatch: ${amountMismatch.length}`)
  const totalDelta = amountMismatch.reduce((s, r) => s + r.delta, 0)
  console.log(
    `sum of amount deltas (portal−FDW on mismatches): $${totalDelta.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
  )

  if (fdwOnly.length) {
    console.log('\nFDW only (first 20):')
    for (const k of fdwOnly.slice(0, 20)) console.log(`  ${k}`)
  }
  if (portalOnly.length) {
    console.log('\nPortal only (first 20):')
    for (const k of portalOnly.slice(0, 20)) console.log(`  ${k}`)
  }
  if (amountMismatch.length) {
    console.log('\nLargest amount mismatches (first 20):')
    for (const m of amountMismatch.slice(0, 20)) {
      console.log(
        `  ${m.key}: FDW $${m.fdw.toLocaleString()} | portal $${m.portal.toLocaleString()} | Δ $${m.delta.toLocaleString()}`
      )
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
