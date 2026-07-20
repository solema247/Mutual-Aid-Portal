/**
 * Add "Please Review: missing in Lohub Tracker" to AT-only allocations.
 *   npx tsx scripts/cutover/note-missing-lohub-tracker.ts
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'

config({ path: resolve(process.cwd(), '.env.local') })

const NOTE = 'Please Review: missing in Lohub Tracker'

const IDS = [
  'LCC.AD.Avaaz.25-06-23.291',
  'LCC.AD.Avaaz.25-06-23.292',
  'LCC.AD.Avaaz.25-06-23.293',
  'LCC.AD.Avaaz.25-06-23.294',
  'LCC.AD.Avaaz.25-06-23.295',
  'LCC.AD.Avaaz.25-06-23.296',
  'LCC.AD.Avaaz.25-06-23.297',
  'LCC.AD.Avaaz.25-06-23.298',
  'LCC.AD.Gisa.23-11-15.299',
  'LCC.AD.Gisa.23-11-15.300',
  'LCC.AD.Gisa.23-11-15.301',
  'LCC.AD.Gisa.23-11-15.302',
  'LCC.AD.Gisa.23-11-15.303',
  'LCC.AD.P2H.25-01-15.1',
  'LCC.AD.P2H.26-02-14.423',
  'LCC.AD.P2H.26-02-14.424',
  'LCC.AD.P2H.26-02-14.470',
  'LCC.AD.P2H.26-02-14.471',
  'LCC.AD.P2H.26-02-14.472',
  'LCC.AD.P2H.26-02-14.473',
  'LCC.AD.P2H.26-02-14.474',
  'LCC.AD.P2H.26-02-14.475',
  'LCC.AD.P2H.26-02-14.476',
  'LCC.AD.P2H.26-02-14.477',
  'LCC.AD.P2H.26-02-14.478',
  'LCC.AD.P2H.26-02-14.479',
  'LCC.AD.P2H.26-02-14.480',
  'LCC.AD.P2H.26-02-14.481',
  'LCC.AD.P2H.26-02-14.482',
  'LCC.AD.P2H.26-05-06.541',
]

function appendNote(existing: string | null | undefined, note: string): string {
  const cur = (existing || '').trim()
  if (!cur) return note
  if (cur.includes(note)) return cur
  return `${cur}\n${note}`
}

async function main() {
  const supabase = getSupabaseAdmin()
  let updated = 0
  const missing: string[] = []
  const decisions = new Set<string>()

  for (const id of IDS) {
    const { data, error } = await supabase
      .from('allocations_by_date')
      .select('Allocation_ID, Decision_ID, Notes')
      .eq('Allocation_ID', id)
      .maybeSingle()
    if (error) throw error
    if (!data) {
      missing.push(id)
      continue
    }
    if (data.Decision_ID) decisions.add(data.Decision_ID)
    const next = appendNote(data.Notes, NOTE)
    if (next === data.Notes) continue
    const { error: uErr } = await supabase
      .from('allocations_by_date')
      .update({ Notes: next })
      .eq('Allocation_ID', id)
    if (uErr) throw uErr
    updated++
  }

  console.log(`Updated: ${updated}`)
  console.log(`Missing from canonical: ${missing.length}`)
  for (const id of missing) console.log(`  ${id}`)
  console.log(`Parent decisions (${decisions.size}):`)
  for (const d of [...decisions].sort()) console.log(`  ${d}`)

  // Also stamp decision-level notes so the Notes column shows without expanding
  let decisionsUpdated = 0
  for (const decisionId of decisions) {
    const { data: d, error } = await supabase
      .from('distribution_decision_master_sheet_1')
      .select('decision_id_proposed, notes')
      .eq('decision_id_proposed', decisionId)
      .maybeSingle()
    if (error) throw error
    if (!d) continue
    const next = appendNote(d.notes, NOTE)
    if (next === (d.notes || '').trim() || next === d.notes) continue
    const { error: uErr } = await supabase
      .from('distribution_decision_master_sheet_1')
      .update({ notes: next })
      .eq('decision_id_proposed', decisionId)
    if (uErr) throw uErr
    decisionsUpdated++
    console.log(`Decision note: ${decisionId}`)
  }
  console.log(`Decisions updated: ${decisionsUpdated}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
