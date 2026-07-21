import type { SupabaseClient } from '@supabase/supabase-js'

export type DecisionRow = {
  id: string
  decision_id_proposed: string | null
  decision_id: string | null
  decision_amount: number | null
  decision_date: string | null
  partner: string | null
  restriction: string | null
  decision_maker: string | null
  flow_oversight: string | null
}

/** Grouping / FK key used on allocations_by_date.Decision_ID */
export function decisionGroupKey(row: {
  decision_id_proposed?: string | null
  decision_id?: string | null
  id?: string | null
}): string {
  return (row.decision_id_proposed || row.decision_id || row.id || '').trim()
}

async function findDecisionRow(
  supabase: SupabaseClient,
  decisionId: string
): Promise<DecisionRow | null> {
  const trimmed = decisionId.trim()
  if (!trimmed) return null

  const select =
    'id, decision_id_proposed, decision_id, decision_amount, decision_date, partner, restriction, decision_maker, flow_oversight'

  const attempts = [
    () => supabase.from('distribution_decision_master_sheet_1').select(select).eq('decision_id_proposed', trimmed).maybeSingle(),
    () => supabase.from('distribution_decision_master_sheet_1').select(select).eq('decision_id', trimmed).maybeSingle(),
    () =>
      supabase.from('distribution_decision_master_sheet_1').select(select).eq('airtable_record_id', trimmed).maybeSingle(),
  ]

  for (const attempt of attempts) {
    const { data, error } = await attempt()
    if (error) throw error
    if (data) return data as DecisionRow
  }

  return null
}

/** Resolve a URL or UI decision identifier to allocations_by_date.Decision_ID */
export async function resolveDecisionGroupKey(
  supabase: SupabaseClient,
  decisionId: string
): Promise<string> {
  const row = await findDecisionRow(supabase, decisionId)
  if (row) return decisionGroupKey(row)
  return decisionId.trim()
}

/** Look up a decision row by proposed id, decision id, or Airtable record id. */
export async function findDecisionByIdentifier(
  supabase: SupabaseClient,
  decisionId: string
): Promise<DecisionRow | null> {
  return findDecisionRow(supabase, decisionId)
}
