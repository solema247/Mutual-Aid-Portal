import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

/**
 * GET /api/distribution-decisions/[id]/allocations - Allocations for one decision.
 * Uses service role to read public.allocations. Links via decision_id (jsonb).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: decisionId } = await params
    if (!decisionId) {
      return NextResponse.json({ error: 'Missing decision id' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    // decision_id in allocations is jsonb (Airtable link), often ["recXXX"]
    const { data, error } = await supabase
      .from('allocations')
      .select('state, allocation_amount, percent_decision_amount')
      .contains('decision_id', [decisionId])

    if (error) {
      // If contains fails (e.g. different jsonb shape), fallback: fetch and filter in memory
      const { data: allRows, error: fallbackError } = await supabase
        .from('allocations')
        .select('state, allocation_amount, percent_decision_amount, decision_id')
      if (fallbackError) throw fallbackError
      const filtered = (allRows || []).filter((row: Record<string, unknown>) => {
        const did = row.decision_id
        if (did == null) return false
        if (Array.isArray(did)) return did.includes(decisionId)
        if (typeof did === 'string') return did === decisionId
        try {
          const arr = typeof did === 'string' ? JSON.parse(did) : did
          return Array.isArray(arr) ? arr.includes(decisionId) : arr === decisionId
        } catch {
          return false
        }
      }).map((row: Record<string, unknown>) => ({
        state: row.state ?? null,
        allocation_amount: row.allocation_amount != null ? Number(row.allocation_amount) : null,
        percent_decision_amount: row.percent_decision_amount != null ? Number(row.percent_decision_amount) : null,
      }))
      return NextResponse.json(filtered)
    }

    const list = (data || []).map((row: Record<string, unknown>) => ({
      state: row.state ?? null,
      allocation_amount: row.allocation_amount != null ? Number(row.allocation_amount) : null,
      percent_decision_amount: row.percent_decision_amount != null ? Number(row.percent_decision_amount) : null,
    }))

    return NextResponse.json(list)
  } catch (error) {
    console.error('Error fetching allocations for decision:', error)
    return NextResponse.json({ error: 'Failed to fetch allocations' }, { status: 500 })
  }
}
