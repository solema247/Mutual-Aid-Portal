/**
 * Rewrite "missing a funds request" notes → "Please Review: missing a funds request"
 *   npx tsx scripts/cutover/rewrite-missing-funds-notes.ts
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'

config({ path: resolve(process.cwd(), '.env.local') })

const OLD = 'missing a funds request'
const NEW = 'Please Review: missing a funds request'

function rewrite(notes: string | null): string | null {
  if (!notes) return notes
  if (notes.includes(NEW)) return notes
  if (!notes.includes(OLD)) return notes
  return notes.split(OLD).join(NEW)
}

async function main() {
  const supabase = getSupabaseAdmin()

  const { data: allocs, error: aErr } = await supabase
    .from('allocations_by_date')
    .select('Allocation_ID, Notes')
    .ilike('Notes', `%${OLD}%`)
  if (aErr) throw aErr

  let allocUpdated = 0
  for (const row of allocs ?? []) {
    const next = rewrite(row.Notes)
    if (!next || next === row.Notes) continue
    const { error } = await supabase
      .from('allocations_by_date')
      .update({ Notes: next })
      .eq('Allocation_ID', row.Allocation_ID)
    if (error) throw error
    allocUpdated++
  }

  const { data: decisions, error: dErr } = await supabase
    .from('distribution_decision_master_sheet_1')
    .select('decision_id_proposed, notes')
    .ilike('notes', `%${OLD}%`)
  if (dErr) throw dErr

  let decUpdated = 0
  for (const row of decisions ?? []) {
    const next = rewrite(row.notes)
    if (!next || next === row.notes) continue
    const { error } = await supabase
      .from('distribution_decision_master_sheet_1')
      .update({ notes: next })
      .eq('decision_id_proposed', row.decision_id_proposed)
    if (error) throw error
    decUpdated++
  }

  console.log(`Allocations updated: ${allocUpdated}`)
  console.log(`Decisions updated:   ${decUpdated}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
