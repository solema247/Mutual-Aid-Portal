import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { decisionGroupKey } from '@/lib/grantManagement/resolveDecisionKey'

const ALLOCATIONS_SELECT =
  'Allocation_ID, Decision_ID, Decision_Date, State, "Allocation Amount", "%_Decision_Amount", Restriction'

const DECISIONS_SELECT =
  'id, decision_id, decision_id_proposed, decision_date, restriction, airtable_record_id'

function mapAllocationsRow(row: Record<string, unknown>) {
  const allocationId = row['Allocation_ID'] != null ? String(row['Allocation_ID']) : null
  const decisionKey =
    row['Decision_ID'] != null ? String(row['Decision_ID']).trim() : allocationId || ''
  const amount =
    row['Allocation Amount'] != null ? Number(row['Allocation Amount']) : null
  const percent =
    row['%_Decision_Amount'] != null ? Number(row['%_Decision_Amount']) : null

  return {
    allocation_id: allocationId,
    decision_key: decisionKey,
    state: row['State'] ?? null,
    allocation_amount: amount != null && !Number.isNaN(amount) ? amount : null,
    percent_decision_amount: percent != null && !Number.isNaN(percent) ? percent : null,
    restriction: row['Restriction'] ?? null,
    decision_date: row['Decision_Date'] != null ? String(row['Decision_Date']) : null,
  }
}

export type DecisionMeta = {
  id: string
  decision_id: string | null
  decision_id_proposed: string | null
  decision_date: string | null
  restriction: string | null
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
    const [allocationsRes, decisionsRes] = await Promise.all([
      supabase.from('allocations_by_date').select(ALLOCATIONS_SELECT),
      supabase.from('distribution_decision_master_sheet_1').select(DECISIONS_SELECT),
    ])

    if (allocationsRes.error) {
      console.error('Error fetching allocations:', allocationsRes.error)
      return NextResponse.json({ error: 'Failed to fetch allocations' }, { status: 500 })
    }

    const list = (allocationsRes.data || []).map((row: Record<string, unknown>) =>
      mapAllocationsRow(row)
    )
    list.sort((a, b) =>
      (a.allocation_id ?? '').localeCompare(b.allocation_id ?? '', undefined, { numeric: true })
    )

    const decisions: DecisionMeta[] = []
    if (!decisionsRes.error && decisionsRes.data) {
      for (const row of decisionsRes.data as Record<string, unknown>[]) {
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
        })
      }
    }

    return NextResponse.json({ allocations: list, decisions })
  } catch (error) {
    console.error('Error fetching allocations:', error)
    return NextResponse.json({ error: 'Failed to fetch allocations' }, { status: 500 })
  }
}
