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

/**
 * GET /api/allocations - List allocations from foreign table.
 * Uses service role to read public.allocations.
 * Each row includes a computed decision_key (allocation_id prefix before last dot).
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('allocations')
      .select('allocation_id, state, allocation_amount, percent_decision_amount, restriction, decision_date')
      .order('allocation_id', { ascending: true })

    if (error) throw error

    const list = (data || []).map((row: Record<string, unknown>) => {
      const allocationId = row.allocation_id != null ? String(row.allocation_id) : null
      const amount = row.allocation_amount != null ? Number(row.allocation_amount) : null
      return {
        allocation_id: allocationId,
        decision_key: decisionKeyFromAllocationId(allocationId),
        state: row.state ?? null,
        allocation_amount: amount != null && !Number.isNaN(amount) ? amount : null,
        percent_decision_amount:
          row.percent_decision_amount != null ? Number(row.percent_decision_amount) : null,
        restriction: row.restriction ?? null,
        decision_date: parseDecisionDate(row.decision_date),
      }
    })

    return NextResponse.json(list)
  } catch (error) {
    console.error('Error fetching allocations:', error)
    return NextResponse.json({ error: 'Failed to fetch allocations' }, { status: 500 })
  }
}
