import { config } from 'dotenv'
import { resolve } from 'path'
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'

config({ path: resolve(process.cwd(), '.env.local') })

function isRec(v: string | null | undefined): boolean {
  return !!v && /^rec[A-Za-z0-9]+$/.test(v.trim())
}

function partnerFromProposed(proposed: string): string | null {
  const parts = proposed.split('.')
  if (parts.length >= 2 && parts[0] === 'LCC') return parts[1]
  return null
}

async function main() {
  const supabase = getSupabaseAdmin()

  const { data: decisions, error } = await supabase
    .from('distribution_decision_master_sheet_1')
    .select('decision_id_proposed, partner')
    .like('partner', 'rec%')
  if (error) throw error

  let updated = 0
  for (const d of decisions ?? []) {
    if (!isRec(d.partner)) continue
    const partner = partnerFromProposed(d.decision_id_proposed)
    if (!partner) {
      console.warn(`Could not derive partner for ${d.decision_id_proposed} (had ${d.partner})`)
      continue
    }
    const { error: uErr } = await supabase
      .from('distribution_decision_master_sheet_1')
      .update({ partner })
      .eq('decision_id_proposed', d.decision_id_proposed)
    if (uErr) throw uErr
    console.log(`${d.decision_id_proposed}: ${d.partner} → ${partner}`)
    updated++
  }

  // Also fix allocations Partner if stored as rec…
  const { data: allocs, error: aErr } = await supabase
    .from('allocations_by_date')
    .select('Allocation_ID, Decision_ID, Partner')
    .like('Partner', 'rec%')
  if (aErr) throw aErr

  let allocUpdated = 0
  for (const a of allocs ?? []) {
    if (!isRec(a.Partner)) continue
    const partner =
      (a.Decision_ID ? partnerFromProposed(a.Decision_ID) : null) ||
      null
    if (!partner) {
      console.warn(`Could not derive partner for alloc ${a.Allocation_ID}`)
      continue
    }
    const { error: uErr } = await supabase
      .from('allocations_by_date')
      .update({ Partner: partner })
      .eq('Allocation_ID', a.Allocation_ID)
    if (uErr) throw uErr
    console.log(`alloc ${a.Allocation_ID}: ${a.Partner} → ${partner}`)
    allocUpdated++
  }

  console.log(`Decisions updated: ${updated}`)
  console.log(`Allocations updated: ${allocUpdated}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
