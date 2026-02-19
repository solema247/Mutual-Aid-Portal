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

/** Returns true if the error indicates the table/view is missing or a column is missing (e.g. foreign table schema mismatch). */
function isRecoverableAllocationsError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return (
    /relation ["']?allocations["']? does not exist/i.test(msg) ||
    /relation ["']?public\.allocations["']? does not exist/i.test(msg) ||
    /PGRST301/i.test(msg) ||
    /could not find the table/i.test(msg) ||
    /column .* does not exist/i.test(msg)
  )
}

// Foreign table may use Airtable-style column names (same as distribution-decisions and allocations_by_date).
const ALLOCATIONS_SELECT_AIRTABLE =
  '"Allocation_ID", "State", "Allocation Amount", "%_Decision_Amount", "Restriction", "Decision_Date"'
// Fallback: lowercase column names (if table/view uses snake_case).
const ALLOCATIONS_SELECT_LOWERCASE =
  'allocation_id, state, allocation_amount, percent_decision_amount, restriction, decision_date'

function mapRowToAllocation(row: Record<string, unknown>, useAirtableNames: boolean) {
  const allocationId = useAirtableNames
    ? (row['Allocation_ID'] != null ? String(row['Allocation_ID']) : null)
    : (row.allocation_id != null ? String(row.allocation_id) : null)
  const amount = useAirtableNames
    ? (row['Allocation Amount'] != null ? Number(row['Allocation Amount']) : null)
    : (row.allocation_amount != null ? Number(row.allocation_amount) : null)
  const state = useAirtableNames ? (row['State'] ?? null) : (row.state ?? null)
  const percentDecision = useAirtableNames
    ? (row['%_Decision_Amount'] != null ? Number(row['%_Decision_Amount']) : null)
    : (row.percent_decision_amount != null ? Number(row.percent_decision_amount) : null)
  const restriction = useAirtableNames ? (row['Restriction'] ?? null) : (row.restriction ?? null)
  const decisionDate = useAirtableNames ? row['Decision_Date'] : row.decision_date
  return {
    allocation_id: allocationId,
    decision_key: decisionKeyFromAllocationId(allocationId),
    state,
    allocation_amount: amount != null && !Number.isNaN(amount) ? amount : null,
    percent_decision_amount: percentDecision,
    restriction,
    decision_date: parseDecisionDate(decisionDate),
  }
}

/**
 * GET /api/allocations - List allocations from foreign table.
 * Uses service role to read public.allocations.
 * Tries Airtable-style column names first (Allocation_ID, State, Allocation Amount, etc.), then falls back to lowercase.
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
    // Try Airtable-style column names first (match distribution-decisions / allocations_by_date foreign table).
    let data: Record<string, unknown>[] | null = null
    let useAirtableNames = true

    const res = await supabase
      .from('allocations')
      .select(ALLOCATIONS_SELECT_AIRTABLE)
      .order('Allocation_ID', { ascending: true })

    if (res.error) {
      const msg = res.error.message || ''
      if (/column .* does not exist/i.test(msg) || /Allocation_ID/i.test(msg)) {
        useAirtableNames = false
        const fallback = await supabase
          .from('allocations')
          .select(ALLOCATIONS_SELECT_LOWERCASE)
          .order('allocation_id', { ascending: true })
        if (fallback.error) {
          if (isRecoverableAllocationsError(fallback.error)) {
            console.warn('Allocations: table/column not available, returning empty list:', fallback.error.message)
            return NextResponse.json([])
          }
          throw fallback.error
        }
        data = fallback.data
      } else {
        if (isRecoverableAllocationsError(res.error)) {
          console.warn('Allocations: table/column not available, returning empty list:', res.error.message)
          return NextResponse.json([])
        }
        throw res.error
      }
    } else {
      data = res.data
    }

    const list = (data || []).map((row: Record<string, unknown>) => mapRowToAllocation(row, useAirtableNames))
    return NextResponse.json(list)
  } catch (error) {
    console.error('Error fetching allocations:', error)
    return NextResponse.json({ error: 'Failed to fetch allocations' }, { status: 500 })
  }
}
