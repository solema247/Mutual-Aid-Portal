/**
 * Recompute sum_allocation_amount on all decisions from linked allocations.
 *   npx tsx scripts/cutover/refresh-decision-allocation-sums.ts
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'

config({ path: resolve(process.cwd(), '.env.local') })

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
  const supabase = getSupabaseAdmin()

  const [decisions, allocations] = await Promise.all([
    fetchAll<{ decision_id_proposed: string; sum_allocation_amount: number | null }>(
      'distribution_decision_master_sheet_1',
      'decision_id_proposed, sum_allocation_amount'
    ),
    fetchAll<{ Decision_ID: string | null; 'Allocation Amount': number | null }>(
      'allocations_by_date',
      'Decision_ID, "Allocation Amount"'
    ),
  ])

  const sums = new Map<string, number>()
  for (const a of allocations) {
    const key = (a.Decision_ID || '').trim()
    if (!key) continue
    const amt = a['Allocation Amount']
    const n = amt != null && Number.isFinite(Number(amt)) ? Number(amt) : 0
    sums.set(key, (sums.get(key) ?? 0) + n)
  }

  let updated = 0
  let unchanged = 0
  const samples: string[] = []

  for (const d of decisions) {
    const id = d.decision_id_proposed?.trim()
    if (!id) continue
    const next = Math.round((sums.get(id) ?? 0) * 100) / 100
    const prev = d.sum_allocation_amount != null ? Number(d.sum_allocation_amount) : 0
    if (Math.abs(prev - next) < 0.01) {
      unchanged++
      continue
    }
    const { error } = await supabase
      .from('distribution_decision_master_sheet_1')
      .update({ sum_allocation_amount: next })
      .eq('decision_id_proposed', id)
    if (error) throw error
    updated++
    if (samples.length < 15) {
      samples.push(`${id}: ${prev} → ${next}`)
    }
  }

  console.log(`Decisions checked: ${decisions.length}`)
  console.log(`Updated: ${updated}`)
  console.log(`Unchanged: ${unchanged}`)
  for (const s of samples) console.log(`  ${s}`)
  if (samples.length < updated) console.log(`  … +${updated - samples.length} more`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
