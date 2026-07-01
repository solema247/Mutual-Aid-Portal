/**
 * Validate allocations_by_date.Decision_ID → distribution_decision_master_sheet_1.decision_id_proposed
 *   npx tsx scripts/cutover/validate-allocations-fk.ts
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
  const [allocs, decisions] = await Promise.all([
    fetchAll<{ Allocation_ID: string; Decision_ID: string | null }>(
      'allocations_by_date',
      'Allocation_ID, Decision_ID'
    ),
    fetchAll<{ decision_id_proposed: string | null }>(
      'distribution_decision_master_sheet_1',
      'decision_id_proposed'
    ),
  ])

  const proposed = new Set(
    decisions.map((d) => d.decision_id_proposed?.trim()).filter((x): x is string => !!x)
  )

  const orphans = allocs.filter((a) => {
    const id = a.Decision_ID?.trim()
    return id && !proposed.has(id)
  })
  const nullDecision = allocs.filter((a) => !a.Decision_ID?.trim())
  const linked = allocs.filter((a) => {
    const id = a.Decision_ID?.trim()
    return id && proposed.has(id)
  })

  console.log('=== FK validation: allocations → decisions ===\n')
  console.log(`Allocations: ${allocs.length}`)
  console.log(`Decisions (decision_id_proposed): ${proposed.size}`)
  console.log(`Linked (valid Decision_ID): ${linked.length}`)
  console.log(`Null Decision_ID: ${nullDecision.length}`)
  console.log(`Orphans (Decision_ID not in decisions): ${orphans.length}`)

  if (orphans.length) {
    console.log('\nOrphan samples:')
    for (const o of orphans.slice(0, 10)) {
      console.log(`  ${o.Allocation_ID} → Decision_ID=${o.Decision_ID}`)
    }
  }

  const supabase = getSupabaseAdmin()
  const { error: fkTest } = await supabase.from('allocations_by_date').insert({
    Allocation_ID: '__fk_test_invalid__',
    Decision_ID: '__NONEXISTENT_DECISION__',
    sync_status: 'pending',
  })

  console.log('\nDB FK enforcement test (invalid insert):')
  if (fkTest) {
    console.log(`  BLOCKED — ${fkTest.message}`)
  } else {
    console.log('  UNEXPECTED: insert succeeded (FK may not be enforced)')
    await supabase.from('allocations_by_date').delete().eq('Allocation_ID', '__fk_test_invalid__')
  }

  const ok = orphans.length === 0 && nullDecision.length === 0 && !!fkTest
  console.log(`\n${ok ? 'PASS' : 'FAIL'} — FK relationship ${ok ? 'is valid' : 'has issues'}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
