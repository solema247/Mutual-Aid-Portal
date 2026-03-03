import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

/** Extract first Airtable record ID from allocations.decision_id (jsonb array). */
function decisionRecordIdFromJsonb(decisionId: unknown): string | null {
  if (decisionId == null) return null
  if (typeof decisionId === 'string') {
    try {
      const parsed = JSON.parse(decisionId) as unknown
      return decisionRecordIdFromJsonb(parsed)
    } catch {
      return decisionId.trim() || null
    }
  }
  if (Array.isArray(decisionId) && decisionId.length > 0) {
    const first = decisionId[0]
    return typeof first === 'string' ? first.trim() : null
  }
  return null
}

/** Parse decision_date jsonb (e.g. ["2025-06-23"]) to a date string. */
function parseDecisionDate(decisionDate: unknown): string | null {
  if (decisionDate == null) return null
  if (typeof decisionDate === 'string') return decisionDate
  if (Array.isArray(decisionDate) && decisionDate.length > 0) {
    const first = decisionDate[0]
    return typeof first === 'string' ? first : String(first ?? '')
  }
  if (typeof decisionDate === 'object') {
    try {
      const parsed = JSON.parse(JSON.stringify(decisionDate))
      return parseDecisionDate(parsed)
    } catch {
      return null
    }
  }
  return null
}

/** Clean decision_id_proposed from Airtable (often stored as "\"LCC.P2H.2025-03-08.Flex\""). */
function cleanDecisionLabel(value: unknown): string | null {
  if (value == null) return null
  let s = typeof value === 'string' ? value : String(value ?? '')
  s = s.replace(/^"+|"+$/g, '').trim()
  return s || null
}

// public.allocations foreign table (Airtable distribution tracking)
const ALLOCATIONS_SELECT =
  'allocation_id, decision_date, state, allocation_amount, percent_decision_amount, restriction, decision_id'

// distribution_decision: id = Airtable record ID; used to group and label allocations
const DISTRIBUTION_DECISION_SELECT =
  'id, decision_id, decision_id_proposed, decision_date, restriction'

function mapAllocationsRow(row: Record<string, unknown>) {
  const allocationId = row['allocation_id'] != null ? String(row['allocation_id']) : null
  const decisionRecordId = decisionRecordIdFromJsonb(row['decision_id'])
  const amount = row['allocation_amount'] != null ? Number(row['allocation_amount']) : null
  return {
    allocation_id: allocationId,
    decision_key: decisionRecordId || allocationId || '',
    state: row['state'] ?? null,
    allocation_amount: amount != null && !Number.isNaN(amount) ? amount : null,
    percent_decision_amount: row['percent_decision_amount'] != null ? Number(row['percent_decision_amount']) : null,
    restriction: row['restriction'] ?? null,
    decision_date: parseDecisionDate(row['decision_date']),
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
 * Reads from public.allocations and public.distribution_decision (Airtable).
 * decision_key = distribution_decision record id (rec...) so grouping matches Airtable decisions.
 * Response includes decisions[] for display labels (decision_id or decision_id_proposed).
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
      supabase.from('allocations').select(ALLOCATIONS_SELECT),
      supabase.from('distribution_decision').select(DISTRIBUTION_DECISION_SELECT),
    ])

    if (allocationsRes.error) {
      console.error('Error fetching allocations:', allocationsRes.error)
      return NextResponse.json({ error: 'Failed to fetch allocations' }, { status: 500 })
    }

    const list = (allocationsRes.data || []).map((row: Record<string, unknown>) => mapAllocationsRow(row))
    list.sort((a, b) => (a.allocation_id ?? '').localeCompare(b.allocation_id ?? '', undefined, { numeric: true }))

    const decisions: DecisionMeta[] = []
    if (!decisionsRes.error && decisionsRes.data) {
      for (const row of decisionsRes.data as Record<string, unknown>[]) {
        const id = row['id'] != null ? String(row['id']) : null
        if (!id) continue
        decisions.push({
          id,
          decision_id: row['decision_id'] != null ? String(row['decision_id']) : null,
          decision_id_proposed: cleanDecisionLabel(row['decision_id_proposed']),
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
