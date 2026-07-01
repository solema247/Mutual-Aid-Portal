import type { SupabaseClient } from '@supabase/supabase-js'

/** Recompute sum_allocation_amount and mark decision pending for Airtable push. */
export async function refreshDecisionAllocationSum(
  supabase: SupabaseClient,
  groupKey: string
): Promise<number> {
  const { data: sumRows, error: sumError } = await supabase
    .from('allocations_by_date')
    .select('"Allocation Amount"')
    .eq('Decision_ID', groupKey)

  if (sumError) throw sumError

  const totalAllocated = (sumRows || []).reduce((sum, row: Record<string, unknown>) => {
    const amt = row['Allocation Amount']
    return sum + (amt ? Number(amt) : 0)
  }, 0)

  const { error: updateError } = await supabase
    .from('distribution_decision_master_sheet_1')
    .update({ sum_allocation_amount: totalAllocated, sync_status: 'pending' })
    .eq('decision_id_proposed', groupKey)

  if (updateError) throw updateError

  return totalAllocated
}
