/**
 * Quick FDW vs portal summary for decisions + allocations.
 *   npx tsx scripts/cutover/compare-fdw-portal-summary.ts
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'

config({ path: resolve(process.cwd(), '.env.local') })

async function pageCountAndSum(
  table: string,
  amountCol: string
): Promise<{ count: number; sum: number; error: string | null; ms: number }> {
  const supabase = getSupabaseAdmin()
  const t0 = Date.now()
  let count = 0
  let sum = 0
  let from = 0
  while (true) {
    const { data, error } = await supabase.from(table).select(amountCol).range(from, from + 999)
    if (error) {
      return { count, sum, error: error.message, ms: Date.now() - t0 }
    }
    if (!data?.length) break
    count += data.length
    for (const row of data as Record<string, unknown>[]) {
      const v =
        row[amountCol] ??
        row[amountCol.replace(/"/g, '')] ??
        Object.values(row)[0]
      const n = v != null ? Number(v) : 0
      if (Number.isFinite(n)) sum += n
    }
    if (data.length < 1000) break
    from += 1000
  }
  return { count, sum, error: null, ms: Date.now() - t0 }
}

async function main() {
  console.log('Comparing FDW vs portal (decisions + allocations)…\n')

  const jobs = [
    { label: 'decisions_fdw', table: 'distribution_decision', amount: 'decision_amount' },
    {
      label: 'decisions_portal',
      table: 'distribution_decision_master_sheet_1',
      amount: 'decision_amount',
    },
    { label: 'allocations_fdw', table: 'allocations', amount: 'allocation_amount' },
    {
      label: 'allocations_portal',
      table: 'allocations_by_date',
      amount: '"Allocation Amount"',
    },
  ] as const

  const results: { label: string; count: number; sum: number }[] = []

  for (const j of jobs) {
    process.stdout.write(`${j.label}… `)
    const r = await pageCountAndSum(j.table, j.amount)
    if (r.error) {
      console.log(`ERROR (${r.ms}ms): ${r.error}`)
    } else {
      console.log(
        `count=${r.count} | sum $${r.sum.toLocaleString('en-US', { maximumFractionDigits: 2 })} (${r.ms}ms)`
      )
      results.push({ label: j.label, count: r.count, sum: r.sum })
    }
  }

  const dFdw = results.find((r) => r.label === 'decisions_fdw')
  const dPortal = results.find((r) => r.label === 'decisions_portal')
  const aFdw = results.find((r) => r.label === 'allocations_fdw')
  const aPortal = results.find((r) => r.label === 'allocations_portal')

  console.log('\n--- Deltas (portal − FDW) ---')
  if (dFdw && dPortal) {
    console.log(
      `decisions: count ${dPortal.count - dFdw.count}, amount $${(dPortal.sum - dFdw.sum).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
    )
  }
  if (aFdw && aPortal) {
    console.log(
      `allocations: count ${aPortal.count - aFdw.count}, amount $${(aPortal.sum - aFdw.sum).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
