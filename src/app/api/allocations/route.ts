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

// allocations_by_date has same logical data as allocations but does not trigger HV000 "allocation_id data type not match".
const ALLOCATIONS_BY_DATE_SELECT =
  '"Allocation_ID", "Decision_ID", "Decision_Date", "State", "Allocation Amount", "%_Decision_Amount", "Restriction"'

function mapAllocationsByDateRow(row: Record<string, unknown>) {
  const allocationId = row['Allocation_ID'] != null ? String(row['Allocation_ID']) : null
  const decisionId = row['Decision_ID'] != null ? String(row['Decision_ID']) : null
  const amount = row['Allocation Amount'] != null ? Number(row['Allocation Amount']) : null
  const key = decisionKeyFromAllocationId(allocationId) || decisionId || allocationId || ''
  return {
    allocation_id: allocationId,
    decision_key: key,
    state: row['State'] ?? null,
    allocation_amount: amount != null && !Number.isNaN(amount) ? amount : null,
    percent_decision_amount: row['%_Decision_Amount'] != null ? Number(row['%_Decision_Amount']) : null,
    restriction: row['Restriction'] ?? null,
    decision_date: parseDecisionDate(row['Decision_Date']),
  }
}

/**
 * GET /api/allocations - List allocations for the grant-management Allocations table.
 * Reads from allocations_by_date (same data as allocations; avoids HV000 type mismatch on allocations.allocation_id).
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
      .from('allocations_by_date')
      .select(ALLOCATIONS_BY_DATE_SELECT)

    if (error) {
      console.error('Error fetching allocations from allocations_by_date:', error)
      return NextResponse.json({ error: 'Failed to fetch allocations' }, { status: 500 })
    }

    const list = (data || []).map((row: Record<string, unknown>) => mapAllocationsByDateRow(row))
    list.sort((a, b) => (a.allocation_id ?? '').localeCompare(b.allocation_id ?? '', undefined, { numeric: true }))
    return NextResponse.json(list)
  } catch (error) {
    console.error('Error fetching allocations:', error)
    return NextResponse.json({ error: 'Failed to fetch allocations' }, { status: 500 })
  }
}
