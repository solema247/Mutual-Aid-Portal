/**
 * Set specific amount/state mismatch notes on flagged allocations.
 *   npx tsx scripts/cutover/set-specific-mismatch-notes.ts
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'

config({ path: resolve(process.cwd(), '.env.local') })

function fmtUsd(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n)
}

type Spec = {
  allocationId: string
  keepPrefixLines?: string[]
  note: string
}

const specs: Spec[] = [
  {
    allocationId: 'LCC.AD.P2H.26-05-06.538',
    note: `Please Review: amount mismatch — Mutual Aid Calculator ${fmtUsd(3100)} vs recorded ${fmtUsd(3000)}`,
  },
  {
    allocationId: 'LCC.AD.P2H.26-03-26.466',
    note: 'Please Review: state mismatch — Mutual Aid Calculator North Kordofan vs recorded South Kordofan',
  },
  {
    allocationId: 'LCC.AD.P2H.25-01-16.31',
    keepPrefixLines: ['Weekly allocation'],
    note: `Please Review: amount mismatch — Mutual Aid Calculator ${fmtUsd(3050)} vs recorded ${fmtUsd(7000)}`,
  },
  {
    allocationId: 'LCC.AD.P2H.25-03-08.45',
    keepPrefixLines: ['Weekly allocation'],
    note: `Please Review: amount mismatch — Mutual Aid Calculator ${fmtUsd(27500)} vs recorded ${fmtUsd(27000)}`,
  },
  {
    allocationId: 'LCC.AD.P2H.25-03-08.49',
    keepPrefixLines: ['Weekly allocation'],
    note: `Please Review: amount mismatch — Mutual Aid Calculator ${fmtUsd(30450)} vs recorded ${fmtUsd(27000)}`,
  },
]

async function main() {
  const supabase = getSupabaseAdmin()
  const decisions = new Set<string>()

  for (const s of specs) {
    const { data: row, error } = await supabase
      .from('allocations_by_date')
      .select('Allocation_ID, Decision_ID, Notes')
      .eq('Allocation_ID', s.allocationId)
      .maybeSingle()
    if (error) throw error
    if (!row) {
      console.warn(`Missing allocation ${s.allocationId}`)
      continue
    }

    const notes = [...(s.keepPrefixLines ?? []), s.note].join('\n')
    const { error: uErr } = await supabase
      .from('allocations_by_date')
      .update({ Notes: notes })
      .eq('Allocation_ID', s.allocationId)
    if (uErr) throw uErr
    console.log(`Updated ${s.allocationId}: ${s.note}`)
    if (row.Decision_ID) decisions.add(row.Decision_ID)
  }

  // Decision-level: keep generic flag; details live on the allocation rows
  const DECISION_NOTE = 'Please Review: Allocation does not match decision document'
  for (const id of decisions) {
    const { data: d } = await supabase
      .from('distribution_decision_master_sheet_1')
      .select('notes')
      .eq('decision_id_proposed', id)
      .maybeSingle()
    if (!d) continue
    if (/missing a funds request/i.test(d.notes || '')) continue
    if (/\$300,000 tranche/i.test(d.notes || '')) continue
    if ((d.notes || '').includes(DECISION_NOTE)) continue
    const next = d.notes?.trim() ? `${d.notes.trim()}\n${DECISION_NOTE}` : DECISION_NOTE
    const { error } = await supabase
      .from('distribution_decision_master_sheet_1')
      .update({ notes: next })
      .eq('decision_id_proposed', id)
    if (error) throw error
    console.log(`Decision flagged: ${id}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
