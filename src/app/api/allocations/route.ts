import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { decisionGroupKey } from '@/lib/grantManagement/resolveDecisionKey'
import {
  applyOrganizationIdFilter,
  getUserOrgScope,
  orgScopeBlocksAllData,
} from '@/lib/canvas/orgScope'
import { resolveOrgDecisionKeyScope } from '@/lib/canvas/orgResourceScope'

const ALLOCATIONS_SELECT =
  'Allocation_ID, Decision_ID, Decision_Date, State, "Allocation Amount", "%_Decision_Amount", Restriction, Notes'

const DECISIONS_SELECT =
  'id, decision_id, decision_id_proposed, decision_date, restriction, notes, airtable_record_id'

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

function mapAllocationsRow(row: Record<string, unknown>) {
  const allocationId = row['Allocation_ID'] != null ? String(row['Allocation_ID']) : null
  const decisionKey =
    row['Decision_ID'] != null ? String(row['Decision_ID']).trim() : allocationId || ''
  const amount =
    row['Allocation Amount'] != null ? Number(row['Allocation Amount']) : null
  const percent =
    row['%_Decision_Amount'] != null ? Number(row['%_Decision_Amount']) : null
  const notes = row['Notes'] != null ? String(row['Notes']).trim() : null

  return {
    allocation_id: allocationId,
    decision_key: decisionKey,
    state: row['State'] ?? null,
    allocation_amount: amount != null && !Number.isNaN(amount) ? amount : null,
    percent_decision_amount: percent != null && !Number.isNaN(percent) ? percent : null,
    restriction: row['Restriction'] ?? null,
    decision_date: row['Decision_Date'] != null ? String(row['Decision_Date']) : null,
    notes: notes || null,
  }
}

export type DecisionMeta = {
  id: string
  decision_id: string | null
  decision_id_proposed: string | null
  decision_date: string | null
  restriction: string | null
  notes: string | null
}

/**
 * GET /api/allocations - List allocations grouped by distribution decision.
 * Reads from allocations_by_date + distribution_decision_master_sheet_1.
 */
export async function GET() {
  let supabase
  try {
    supabase = getSupabaseAdmin()
  } catch (configError) {
    console.error('Allocations: Supabase not configured:', configError)
    return NextResponse.json({ allocations: [], decisions: [] }, { status: 200 })
  }

  try {
    const orgScope = await getUserOrgScope()
    if (orgScopeBlocksAllData(orgScope)) {
      return NextResponse.json({ allocations: [], decisions: [] })
    }
    const decisionKeyScope = await resolveOrgDecisionKeyScope(supabase, orgScope)
    if (decisionKeyScope.mode === 'none') {
      return NextResponse.json({ allocations: [], decisions: [] })
    }
    if (decisionKeyScope.mode === 'keys' && decisionKeyScope.keys.length === 0) {
      return NextResponse.json({ allocations: [], decisions: [] })
    }

    const [allocationsData, decisionsData] = await Promise.all([
      fetchAllPages((from, to) => {
        let q = supabase
          .from('allocations_by_date')
          .select(ALLOCATIONS_SELECT)
          .order('Allocation_ID', { ascending: true })
        if (decisionKeyScope.mode === 'keys') {
          q = q.in('Decision_ID', decisionKeyScope.keys)
        }
        return q.range(from, to)
      }),
      fetchAllPages((from, to) => {
        let q = supabase
          .from('distribution_decision_master_sheet_1')
          .select(DECISIONS_SELECT)
          .order('id', { ascending: true })
        q = applyOrganizationIdFilter(q, orgScope)
        return q.range(from, to)
      }).catch((err) => {
        console.error('Error fetching decisions for allocations:', err)
        return [] as any[]
      }),
    ])

    const list = allocationsData.map((row: Record<string, unknown>) => mapAllocationsRow(row))
    list.sort((a, b) =>
      (a.allocation_id ?? '').localeCompare(b.allocation_id ?? '', undefined, { numeric: true })
    )

    const decisions: DecisionMeta[] = []
    for (const row of decisionsData as Record<string, unknown>[]) {
      const groupKey = decisionGroupKey({
        decision_id_proposed: row['decision_id_proposed'] as string | null,
        decision_id: row['decision_id'] as string | null,
        id: row['id'] as string | null,
      })
      if (!groupKey) continue
      decisions.push({
        id: groupKey,
        decision_id: row['decision_id'] != null ? String(row['decision_id']) : null,
        decision_id_proposed:
          row['decision_id_proposed'] != null ? String(row['decision_id_proposed']) : null,
        decision_date: row['decision_date'] != null ? String(row['decision_date']) : null,
        restriction: row['restriction'] != null ? String(row['restriction']) : null,
        notes: row['notes'] != null ? String(row['notes']).trim() || null : null,
      })
    }

    return NextResponse.json({ allocations: list, decisions })
  } catch (error) {
    console.error('Error fetching allocations:', error)
    return NextResponse.json({ error: 'Failed to fetch allocations' }, { status: 500 })
  }
}
