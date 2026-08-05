/**
 * Interim sync: FDW `grants` → `grants_grid_view`.
 *
 *   npx tsx scripts/sync/pull-grants-from-fdw.ts           # dry-run
 *   npx tsx scripts/sync/pull-grants-from-fdw.ts --apply   # write
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'
import { pullGrantsFromFdw } from '../../src/lib/grantManagement/pullGrantsFromFdw'

config({ path: resolve(process.cwd(), '.env.local') })

const APPLY = process.argv.includes('--apply')

async function main() {
  console.log(APPLY ? '=== APPLY MODE ===\n' : '=== DRY RUN (no writes) ===\n')

  const result = await pullGrantsFromFdw({
    supabase: getSupabaseAdmin(),
    dryRun: !APPLY,
  })

  console.log(`FDW grants: ${result.fdwCount}`)
  console.log(`Canonical grants: ${result.canonicalCount}`)
  console.log(`Would insert / inserted: ${result.insertPlans.length} / ${result.inserted}`)
  console.log(`Would update / updated: ${result.updatePlans.length} / ${result.updated}`)
  console.log(`Unchanged: ${result.unchanged}`)
  console.log(`Skipped: ${result.skipped.length}`)
  console.log()
  console.log('On existing rows, only Airtable-owned financials are updated:')
  console.log('  total_transferred_amount_usd, sum_activity_amount, sum_transfer_fee_amount')
  console.log('Portal-owned metadata (name, dates, status, donor…) is never overwritten.\n')

  if (result.insertPlans.length) {
    console.log('--- INSERT ---')
    for (const p of result.insertPlans) {
      console.log(`  + ${p.grant_id} (donor: ${p.donor}${p.newDonor ? ' [NEW]' : ''})`)
    }
    console.log()
  }

  if (result.updatePlans.length) {
    console.log('--- UPDATE (financials) ---')
    for (const u of result.updatePlans) {
      console.log(`  ~ ${u.grant_id} (${u.id})`)
      for (const [field, { from, to }] of Object.entries(u.changes)) {
        console.log(`      ${field}: ${JSON.stringify(from)} → ${JSON.stringify(to)}`)
      }
    }
    console.log()
  }

  if (result.skipped.length) {
    console.log('--- SKIPPED ---')
    for (const s of result.skipped) console.log(`  ${s}`)
    console.log()
  }

  if (result.errors.length) {
    console.log('--- ERRORS ---')
    for (const e of result.errors) console.log(`  ${e}`)
    console.log()
    process.exitCode = 1
  }

  if (!APPLY) {
    console.log('No changes written. Re-run with --apply to execute.')
  } else {
    console.log(`Applied: ${result.inserted} inserted, ${result.updated} updated`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
