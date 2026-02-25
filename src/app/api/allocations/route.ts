import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

/**
 * Derive decision key from allocation_id: prefix before the last dot.
 * e.g. LCC.AD.Avaaz.25-06-23.291 -> LCC.AD.Avaaz.25-06-23
 */
function decisionKeyFromAllocationId(allocationId: string | null): string {
  if (!allocationId || typeof allocationId !== 'string') return ''
  const lastDot = allocationId.lastIndexOf('.')
  if (lastDot <= 0) return allocationId
  return allocationId.slice(0, lastDot)
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

// public.allocations foreign table (Airtable distribution tracking)
const ALLOCATIONS_SELECT =
  'allocation_id, decision_date, state, allocation_amount, percent_decision_amount, restriction'

function mapAllocationsRow(row: Record<string, unknown>) {
  const allocationId = row['allocation_id'] != null ? String(row['allocation_id']) : null
  const decisionId = row['decision_id']
  const amount = row['allocation_amount'] != null ? Number(row['allocation_amount']) : null
  const key = decisionKeyFromAllocationId(allocationId) || (decisionId != null ? String(decisionId) : '') || allocationId || ''
  return {
    allocation_id: allocationId,
    decision_key: key,
    state: row['state'] ?? null,
    allocation_amount: amount != null && !Number.isNaN(amount) ? amount : null,
    percent_decision_amount: row['percent_decision_amount'] != null ? Number(row['percent_decision_amount']) : null,
    restriction: row['restriction'] ?? null,
    decision_date: parseDecisionDate(row['decision_date']),
  }
}

/**
 * GET /api/allocations - List allocations for the grant-management Allocations table.
 * Reads from public.allocations (foreign table to Airtable distribution tracking).
 * Each row includes a computed decision_key (allocation_id prefix before last dot).
 */
export async function GET() {
  let supabase
  try {
    supabase = getSupabaseAdmin()
  } catch (configError) {
    console.error('Allocations: Supabase not configured:', configError)
    return NextResponse.json([], { status: 200 })
  }

  try {
    const { data, error } = await supabase
      .from('allocations')
      .select(ALLOCATIONS_SELECT)

    if (error) {
      console.error('Error fetching allocations from allocations:', error)
      return NextResponse.json({ error: 'Failed to fetch allocations' }, { status: 500 })
    }

    const list = (data || []).map((row: Record<string, unknown>) => mapAllocationsRow(row))
    list.sort((a, b) => (a.allocation_id ?? '').localeCompare(b.allocation_id ?? '', undefined, { numeric: true }))
    return NextResponse.json(list)
  } catch (error) {
    console.error('Error fetching allocations:', error)
    return NextResponse.json({ error: 'Failed to fetch allocations' }, { status: 500 })
  }
}
