/**
 * Clear stale "Please Review: missing a funds request" notes on decisions
 * (and their allocations) that are fully matched sheet↔FDW.
 *
 *   npx tsx scripts/cutover/clear-stale-missing-funds-notes.ts
 *   npx tsx scripts/cutover/clear-stale-missing-funds-notes.ts --apply
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'

config({ path: resolve(process.cwd(), '.env.local') })

const APPLY = process.argv.includes('--apply')

/** Fully matched in the latest sheet↔FDW exercise — notes are stale. */
const STALE_DECISION_IDS = [
  'LCC.AD.P2H.01-07-26-59',
  'LCC.AD.P2H.01-07-26-60',
  'LCC.AD.P2H.08-07-26-61',
  'LCC.AD.P2H.08-07-26-62',
  'LCC.AD.P2H.15-07-26-63',
]

async function main() {
  const sb = getSupabaseAdmin()

  const { data: decisions, error: dErr } = await sb
    .from('distribution_decision_master_sheet_1')
    .select('decision_id_proposed, notes')
    .in('decision_id_proposed', STALE_DECISION_IDS)
  if (dErr) throw dErr

  const { data: allocations, error: aErr } = await sb
    .from('allocations_by_date')
    .select('Allocation_ID, Decision_ID, Notes')
    .in('Decision_ID', STALE_DECISION_IDS)
    .ilike('Notes', '%missing a funds request%')
  if (aErr) throw aErr

  console.log(APPLY ? '=== APPLY ===' : '=== DRY RUN (pass --apply to write) ===')
  console.log('\nDecisions:')
  for (const d of decisions || []) {
    console.log(`  ${d.decision_id_proposed}: ${JSON.stringify(d.notes)}`)
  }
  console.log(`\nAllocations with note: ${(allocations || []).length}`)
  for (const a of allocations || []) {
    console.log(`  ${a.Allocation_ID} (${a.Decision_ID})`)
  }

  if (!APPLY) {
    console.log('\nNo writes. Re-run with --apply.')
    return
  }

  const { data: decUpd, error: duErr } = await sb
    .from('distribution_decision_master_sheet_1')
    .update({ notes: null, updated_at: new Date().toISOString() })
    .in('decision_id_proposed', STALE_DECISION_IDS)
    .ilike('notes', '%missing a funds request%')
    .select('decision_id_proposed')
  if (duErr) throw duErr

  const { data: allocUpd, error: auErr } = await sb
    .from('allocations_by_date')
    .update({ Notes: null })
    .in('Decision_ID', STALE_DECISION_IDS)
    .ilike('Notes', '%missing a funds request%')
    .select('Allocation_ID, Decision_ID')
  if (auErr) throw auErr

  console.log(`\nCleared decisions: ${(decUpd || []).length}`)
  console.log((decUpd || []).map((d) => d.decision_id_proposed).join('\n'))
  console.log(`Cleared allocations: ${(allocUpd || []).length}`)

  const { data: left, error: lErr } = await sb
    .from('distribution_decision_master_sheet_1')
    .select('decision_id_proposed, notes')
    .ilike('notes', '%missing a funds request%')
  if (lErr) throw lErr
  console.log(`\nStill flagged elsewhere: ${(left || []).length}`)
  for (const d of left || []) {
    console.log(`  ${d.decision_id_proposed}: ${d.notes}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
