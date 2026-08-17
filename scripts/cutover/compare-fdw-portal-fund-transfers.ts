/**
 * Compare FDW fund_request / transfer_segment vs portal fund_requests / transfer_segments.
 *
 * Note: FDW transfer_segment.transfer_id is not readable via PostgREST
 * ("column data type not match"), so transfers are matched by auto / auto_number.
 *
 *   npx tsx scripts/cutover/compare-fdw-portal-fund-transfers.ts
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

function num(v: unknown): number {
  const n = v != null ? Number(v) : 0
  return Number.isFinite(n) ? n : 0
}

function eqMoney(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.02
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
  console.log('Comparing FDW vs portal: fund requests + transfer segments…\n')

  const [fdwFr, portalFr, fdwTs, portalTs] = await Promise.all([
    fetchAll(
      'fund_request',
      'request_id, requested_amount, transfer_amount_rollup, date_submitted, partner_name'
    ),
    fetchAll(
      'fund_requests',
      'id, request_id, requested_amount, date_submitted, partner_name, airtable_record_id'
    ),
    // omit transfer_id — PostgREST/FDW type mismatch
    fetchAll(
      'transfer_segment',
      'auto, activity_amount, transfer_fee_amount, transfer_amount, status, grant_id, request_id, transfer_received_date'
    ),
    fetchAll(
      'transfer_segments',
      'id, transfer_id, auto_number, request_id, activity_amount, transfer_fee_amount, status, grant_id, airtable_record_id'
    ),
  ])

  // --- Fund requests by request_id ---
  const fdwFrById = new Map<string, { amount: number; rollup: number }>()
  for (const r of fdwFr) {
    const key = jsonbToText(r.request_id)
    if (!key) continue
    fdwFrById.set(key, {
      amount: num(r.requested_amount),
      rollup: num(r.transfer_amount_rollup),
    })
  }
  const portalFrById = new Map<string, { amount: number }>()
  for (const r of portalFr) {
    const key = String(r.request_id ?? '').trim()
    if (!key) continue
    portalFrById.set(key, { amount: num(r.requested_amount) })
  }

  let frMatched = 0
  const frAmountMismatch: { id: string; fdw: number; portal: number }[] = []
  const frFdwOnly: string[] = []
  for (const [id, f] of fdwFrById) {
    const p = portalFrById.get(id)
    if (!p) {
      frFdwOnly.push(id)
      continue
    }
    frMatched++
    if (!eqMoney(f.amount, p.amount)) {
      frAmountMismatch.push({ id, fdw: f.amount, portal: p.amount })
    }
  }
  const frPortalOnly = [...portalFrById.keys()].filter((k) => !fdwFrById.has(k))

  const fdwFrSum = [...fdwFrById.values()].reduce((s, r) => s + r.amount, 0)
  const portalFrSum = [...portalFrById.values()].reduce((s, r) => s + r.amount, 0)
  const fdwFrRollup = [...fdwFrById.values()].reduce((s, r) => s + r.rollup, 0)

  console.log('=== Fund requests (match by request_id) ===')
  console.log(
    `FDW fund_request:     count=${fdwFrById.size} | requested_amount sum=$${fdwFrSum.toLocaleString()} | transfer_amount_rollup sum=$${fdwFrRollup.toLocaleString()}`
  )
  console.log(
    `Portal fund_requests: count=${portalFrById.size} | requested_amount sum=$${portalFrSum.toLocaleString()}`
  )
  console.log(
    `matched: ${frMatched} | fdw_only: ${frFdwOnly.length} | portal_only: ${frPortalOnly.length}`
  )
  console.log(`requested_amount mismatches: ${frAmountMismatch.length}`)
  console.log(
    `Δ count (portal−FDW): ${portalFrById.size - fdwFrById.size} | Δ amount: $${(portalFrSum - fdwFrSum).toLocaleString()}`
  )
  if (frFdwOnly.length) {
    console.log('\nFDW-only request_ids (first 20):')
    for (const id of frFdwOnly.slice(0, 20)) console.log(`  ${id}`)
  }
  if (frPortalOnly.length) {
    console.log('\nPortal-only request_ids (first 20):')
    for (const id of frPortalOnly.slice(0, 20)) console.log(`  ${id}`)
  }
  if (frAmountMismatch.length) {
    console.log('\nAmount mismatches (first 15):')
    for (const m of frAmountMismatch
      .sort((a, b) => Math.abs(b.portal - b.fdw) - Math.abs(a.portal - a.fdw))
      .slice(0, 15)) {
      console.log(
        `  ${m.id}: FDW $${m.fdw.toLocaleString()} | portal $${m.portal.toLocaleString()} | Δ $${(m.portal - m.fdw).toLocaleString()}`
      )
    }
  }

  // --- Transfer segments by auto / auto_number ---
  type TsSide = {
    activity: number
    fee: number
    transfer: number
    status: string | null
    transfer_id?: string | null
  }
  const fdwTsByAuto = new Map<number, TsSide>()
  let fdwTsNoAuto = 0
  for (const r of fdwTs) {
    const auto = r.auto != null ? Number(r.auto) : NaN
    if (!Number.isFinite(auto)) {
      fdwTsNoAuto++
      continue
    }
    const activity = num(r.activity_amount)
    const fee = num(r.transfer_fee_amount)
    fdwTsByAuto.set(auto, {
      activity,
      fee,
      transfer: r.transfer_amount != null ? num(r.transfer_amount) : activity + fee,
      status: (r.status as string) ?? null,
    })
  }
  const portalTsByAuto = new Map<number, TsSide>()
  let portalTsNoAuto = 0
  for (const r of portalTs) {
    const auto = r.auto_number != null ? Number(r.auto_number) : NaN
    if (!Number.isFinite(auto)) {
      portalTsNoAuto++
      continue
    }
    const activity = num(r.activity_amount)
    const fee = num(r.transfer_fee_amount)
    portalTsByAuto.set(auto, {
      activity,
      fee,
      transfer: activity + fee,
      status: (r.status as string) ?? null,
      transfer_id: (r.transfer_id as string) ?? null,
    })
  }

  let tsMatched = 0
  const tsActivityMismatch: { auto: number; id: string | null; fdw: number; portal: number }[] =
    []
  const tsFeeMismatch: { auto: number; id: string | null; fdw: number; portal: number }[] = []
  const tsFdwOnly: number[] = []
  for (const [auto, f] of fdwTsByAuto) {
    const p = portalTsByAuto.get(auto)
    if (!p) {
      tsFdwOnly.push(auto)
      continue
    }
    tsMatched++
    if (!eqMoney(f.activity, p.activity)) {
      tsActivityMismatch.push({
        auto,
        id: p.transfer_id ?? null,
        fdw: f.activity,
        portal: p.activity,
      })
    }
    if (!eqMoney(f.fee, p.fee)) {
      tsFeeMismatch.push({
        auto,
        id: p.transfer_id ?? null,
        fdw: f.fee,
        portal: p.fee,
      })
    }
  }
  const tsPortalOnly = [...portalTsByAuto.entries()]
    .filter(([auto]) => !fdwTsByAuto.has(auto))
    .map(([auto, p]) => ({ auto, transfer_id: p.transfer_id }))

  const fdwAct = [...fdwTsByAuto.values()].reduce((s, r) => s + r.activity, 0)
  const fdwFee = [...fdwTsByAuto.values()].reduce((s, r) => s + r.fee, 0)
  const portalAct = [...portalTsByAuto.values()].reduce((s, r) => s + r.activity, 0)
  const portalFee = [...portalTsByAuto.values()].reduce((s, r) => s + r.fee, 0)

  // Also raw portal totals including rows without auto
  const portalActAll = portalTs.reduce((s, r) => s + num(r.activity_amount), 0)
  const portalFeeAll = portalTs.reduce((s, r) => s + num(r.transfer_fee_amount), 0)
  const fdwActAll = fdwTs.reduce((s, r) => s + num(r.activity_amount), 0)
  const fdwFeeAll = fdwTs.reduce((s, r) => s + num(r.transfer_fee_amount), 0)

  console.log('\n=== Transfer segments (match by auto / auto_number) ===')
  console.log(
    `(FDW transfer_id unreadable via API — matching on auto. FDW rows without auto: ${fdwTsNoAuto}; portal without auto_number: ${portalTsNoAuto})`
  )
  console.log(
    `FDW transfer_segment:     rows=${fdwTs.length} (with auto=${fdwTsByAuto.size}) | activity=$${fdwActAll.toLocaleString()} | fees=$${fdwFeeAll.toLocaleString()}`
  )
  console.log(
    `Portal transfer_segments: rows=${portalTs.length} (with auto=${portalTsByAuto.size}) | activity=$${portalActAll.toLocaleString()} | fees=$${portalFeeAll.toLocaleString()}`
  )
  console.log(
    `matched by auto: ${tsMatched} | fdw_only auto: ${tsFdwOnly.length} | portal_only auto: ${tsPortalOnly.length}`
  )
  console.log(
    `activity mismatches: ${tsActivityMismatch.length} | fee mismatches: ${tsFeeMismatch.length}`
  )
  console.log(
    `Δ rows (portal−FDW): ${portalTs.length - fdwTs.length} | Δ activity: $${(portalActAll - fdwActAll).toLocaleString()} | Δ fees: $${(portalFeeAll - fdwFeeAll).toLocaleString()}`
  )

  if (tsFdwOnly.length) {
    console.log('\nFDW-only auto# (first 20):')
    for (const a of tsFdwOnly.slice(0, 20)) console.log(`  auto=${a}`)
  }
  if (tsPortalOnly.length) {
    console.log('\nPortal-only auto# (first 20):')
    for (const p of tsPortalOnly.slice(0, 20)) {
      console.log(`  auto=${p.auto} transfer_id=${p.transfer_id}`)
    }
  }
  if (tsActivityMismatch.length) {
    console.log('\nActivity mismatches (first 10):')
    for (const m of tsActivityMismatch.slice(0, 10)) {
      console.log(
        `  auto=${m.auto} ${m.id || ''}: FDW $${m.fdw.toLocaleString()} | portal $${m.portal.toLocaleString()}`
      )
    }
  }
  if (tsFeeMismatch.length) {
    console.log('\nFee mismatches (first 10):')
    for (const m of tsFeeMismatch.slice(0, 10)) {
      console.log(
        `  auto=${m.auto} ${m.id || ''}: FDW $${m.fdw.toLocaleString()} | portal $${m.portal.toLocaleString()}`
      )
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
