import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

/**
 * GET /api/distribution-decisions/[decisionId]/allocations - Allocations for one decision.
 * Uses service role to read public.allocations (foreign table). Links via decision_id (jsonb).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ decisionId: string }> }
) {
  try {
    const { decisionId } = await params
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

const selectCols = '"Allocation_ID","Decision_ID","Decision_Date","State","Allocation Amount","%_Decision_Amount","Decision_Amount","Grant_ID","Partner","Decision Maker","Restriction","Notes","Status","Flow Oversight","Serial"'

function mapAllocationRow(row: any) {
  return {
    allocation_id: row?.Allocation_ID ?? null,
    decision_id: row?.Decision_ID ?? null,
    decision_date: row?.Decision_Date ?? null,
    state: row?.State ?? null,
    amount: row?.['Allocation Amount'] ?? null,
    percent_of_decision: row?.['%_Decision_Amount'] ?? null,
    decision_amount: row?.['Decision_Amount'] ?? null,
    grant_id: row?.Grant_ID ?? null,
    partner: row?.Partner ?? null,
    decision_maker: row?.['Decision Maker'] ?? null,
    restriction: row?.Restriction ?? null,
    notes: row?.Notes ?? null,
    status: row?.Status ?? null,
    flow_oversight: row?.['Flow Oversight'] ?? null,
    serial: row?.Serial ?? null,
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ decisionId: string }> }
) {
  try {
    const supabase = getSupabaseRouteClient()
    const { decisionId } = await params
    const body = await request.json()
    const { allocations } = body || {}

    if (!Array.isArray(allocations) || allocations.length === 0) {
      return NextResponse.json({ error: 'allocations array is required' }, { status: 400 })
    }

    // Get decision info for defaults
    const { data: decision, error: decisionError } = await supabase
      .from('distribution_decision_master_sheet_1')
      .select('decision_id, decision_amount, decision_date, partner, restriction')
      .eq('decision_id', decisionId)
      .single()

    if (decisionError || !decision) {
      return NextResponse.json({ error: 'Decision not found' }, { status: 404 })
    }

    const decisionAmount = decision.decision_amount ?? null
    const decisionDate = decision.decision_date ?? null

    const rowsToInsert = allocations.map((alloc: any) => {
      const amountNum = alloc?.amount !== undefined ? Number(alloc.amount) : null
      const percent = amountNum && decisionAmount
        ? (amountNum / Number(decisionAmount)) * 100
        : null

      return {
        Allocation_ID: crypto.randomUUID(),
        Decision_ID: decisionId,
        Decision_Date: alloc?.decision_date || decisionDate,
        State: alloc?.state || null,
        'Allocation Amount': amountNum,
        '%_Decision_Amount': percent,
        Decision_Amount: decisionAmount,
        Grant_ID: alloc?.grant_id || null,
        Partner: alloc?.partner || decision.partner || null,
        'Decision Maker': alloc?.decision_maker || null,
        Restriction: alloc?.restriction || decision.restriction || null,
        Notes: alloc?.notes || null,
        Status: alloc?.status || 'new',
        'Flow Oversight': alloc?.flow_oversight || null,
        Serial: alloc?.serial ?? null,
      }
    })

    const { error: insertError } = await supabase
      .from('allocations_by_date')
      .insert(rowsToInsert)

    if (insertError) throw insertError

    // Refresh sum in master sheet
    const { data: sumRows, error: sumError } = await supabase
      .from('allocations_by_date')
      .select('"Allocation Amount"')
      .eq('Decision_ID', decisionId)

    if (sumError) throw sumError

    const totalAllocated = (sumRows || []).reduce((sum, row: any) => {
      const amt = row?.['Allocation Amount']
      return sum + (amt ? Number(amt) : 0)
    }, 0)

    const { error: updateError } = await supabase
      .from('distribution_decision_master_sheet_1')
      .update({ sum_allocation_amount: totalAllocated })
      .eq('decision_id', decisionId)

    if (updateError) throw updateError

    return NextResponse.json({ success: true, total_allocated: totalAllocated })
  } catch (error) {
    console.error('Error creating allocations:', error)
    return NextResponse.json({ error: 'Failed to create allocations' }, { status: 500 })
  }
}

