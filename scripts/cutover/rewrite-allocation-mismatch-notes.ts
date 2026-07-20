/**
 * Normalize allocation-mismatch review notes.
 *   npx tsx scripts/cutover/rewrite-allocation-mismatch-notes.ts
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'

config({ path: resolve(process.cwd(), '.env.local') })

const NOTE = 'Please Review: Allocation does not match decision document'

const ALLOC_PATTERNS = [
  'Mutual Aid Calculator file - please review',
  'Values and details of allocation are different',
  'Allocation does not match decision document',
]

async function main() {
  const supabase = getSupabaseAdmin()

  // 1) Allocations with Mutual Aid / mismatch wording → standard note (preserve other lines like Weekly allocation? replace review line)
  const { data: allocs, error: aErr } = await supabase
    .from('allocations_by_date')
    .select('Allocation_ID, Decision_ID, Notes')
    .or(
      ALLOC_PATTERNS.map((p) => `Notes.ilike.%${p}%`).join(',')
    )
  if (aErr) throw aErr

  const decisionsToFlag = new Set<string>()
  let allocUpdated = 0

  for (const row of allocs ?? []) {
    const notes = row.Notes || ''
    // Keep $2M tranche note as-is (more specific)
    if (/\$300,000 tranche/i.test(notes) || /full \$2,000,000/i.test(notes)) {
      continue
    }
    const lines = notes
      .split(/\n+/)
      .map((l: string) => l.trim())
      .filter(Boolean)
      .filter(
        (l: string) =>
          !/Mutual Aid Calculator/i.test(l) &&
          !/Values and details of allocation are different/i.test(l) &&
          !/Allocation does not match decision document/i.test(l) &&
          !/^Please Review:/i.test(l)
      )
    const next = [...lines, NOTE].join('\n')
    if (next === notes) {
      if (row.Decision_ID) decisionsToFlag.add(row.Decision_ID)
      continue
    }
    const { error } = await supabase
      .from('allocations_by_date')
      .update({ Notes: next })
      .eq('Allocation_ID', row.Allocation_ID)
    if (error) throw error
    allocUpdated++
    if (row.Decision_ID) decisionsToFlag.add(row.Decision_ID)
  }

  // 2) Decisions already marked "Allocation does not match…" → Please Review: …
  const { data: decisions, error: dErr } = await supabase
    .from('distribution_decision_master_sheet_1')
    .select('decision_id_proposed, notes')
    .ilike('notes', '%Allocation does not match decision document%')
  if (dErr) throw dErr

  let decUpdated = 0
  for (const row of decisions ?? []) {
    decisionsToFlag.add(row.decision_id_proposed)
    const notes = row.notes || ''
    if (notes.includes(NOTE)) continue
    const next = notes.includes('Allocation does not match decision document')
      ? notes.replace(/Please Review:\s*/gi, '').replace(
          /Allocation does not match decision document/gi,
          NOTE
        )
      : NOTE
    // Avoid double Please Review
    const cleaned = next.replace(/Please Review:\s*Please Review:/gi, 'Please Review:')
    const { error } = await supabase
      .from('distribution_decision_master_sheet_1')
      .update({ notes: cleaned })
      .eq('decision_id_proposed', row.decision_id_proposed)
    if (error) throw error
    decUpdated++
  }

  // 3) Ensure parent decisions for flagged allocations have the decision-level note
  let decFlagged = 0
  for (const id of decisionsToFlag) {
    const { data: d } = await supabase
      .from('distribution_decision_master_sheet_1')
      .select('decision_id_proposed, notes')
      .eq('decision_id_proposed', id)
      .maybeSingle()
    if (!d) continue
    // Don't overwrite missing-funds or $2M tranche notes
    if (/missing a funds request/i.test(d.notes || '')) continue
    if (/\$300,000 tranche/i.test(d.notes || '')) continue
    if ((d.notes || '').includes(NOTE)) continue
    const next = d.notes?.trim() ? `${d.notes.trim()}\n${NOTE}` : NOTE
    const { error } = await supabase
      .from('distribution_decision_master_sheet_1')
      .update({ notes: next })
      .eq('decision_id_proposed', id)
    if (error) throw error
    decFlagged++
  }

  console.log(`Allocations updated:        ${allocUpdated}`)
  console.log(`Decision notes rewritten:   ${decUpdated}`)
  console.log(`Decisions newly flagged:    ${decFlagged}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
