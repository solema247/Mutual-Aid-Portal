/**
 * Helpers for org-scoping tables that lack organization_id
 * (e.g. allocations_by_date) via decision / grant keys.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserOrgScope } from '@/lib/canvas/orgScope'
import { decisionGroupKey } from '@/lib/grantManagement/resolveDecisionKey'

const PAGE_SIZE = 1000

async function fetchAllPages(
  buildQuery: (from: number, to: number) => any
): Promise<any[]> {
  const all: any[] = []
  let from = 0
  for (;;) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1)
    if (error) throw error
    if (!data?.length) break
    all.push(...data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

/** Decision_ID strings used on allocations_by_date for this org. */
export async function loadOrgDecisionKeys(
  supabase: SupabaseClient,
  organizationId: string
): Promise<string[]> {
  const rows = await fetchAllPages((from, to) =>
    supabase
      .from('distribution_decision_master_sheet_1')
      .select('id, decision_id, decision_id_proposed')
      .eq('organization_id', organizationId)
      .order('id', { ascending: true })
      .range(from, to)
  )

  const keys = new Set<string>()
  for (const row of rows) {
    const key = decisionGroupKey(row)
    if (key) keys.add(key)
    if (row.decision_id) keys.add(String(row.decision_id).trim())
    if (row.decision_id_proposed) keys.add(String(row.decision_id_proposed).trim())
  }
  return Array.from(keys).filter(Boolean)
}

export type OrgDecisionKeyScope =
  | { mode: 'all' }
  | { mode: 'none' }
  | { mode: 'keys'; keys: string[] }

export async function resolveOrgDecisionKeyScope(
  supabase: SupabaseClient,
  orgScope: UserOrgScope
): Promise<OrgDecisionKeyScope> {
  if (orgScope.mode === 'none') return { mode: 'none' }
  if (orgScope.mode === 'all') return { mode: 'all' }
  const keys = await loadOrgDecisionKeys(supabase, orgScope.organizationId)
  return { mode: 'keys', keys }
}
