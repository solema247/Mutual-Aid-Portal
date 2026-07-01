import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireGrantEditor } from '@/lib/grantManagement/requireGrantEditor'
import {
  findDecisionByIdentifier,
  resolveDecisionGroupKey,
} from '@/lib/grantManagement/resolveDecisionKey'
import { refreshDecisionAllocationSum } from '@/lib/grantManagement/refreshDecisionSum'

/**
 * GET /api/distribution-decisions/[decisionId]/allocations - Allocations for one decision.
 * Reads from allocations_by_date (canonical), keyed by Decision_ID.
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
    const groupKey = await resolveDecisionGroupKey(supabase, decisionId)

    const { data, error } = await supabase
      .from('allocations_by_date')
      .select('Allocation_ID, State, "Allocation Amount", "%_Decision_Amount"')
      .eq('Decision_ID', groupKey)

    if (error) throw error

    const list = (data || []).map((row: Record<string, unknown>) => {
      const amount =
        row['Allocation Amount'] != null ? Number(row['Allocation Amount']) : null
      const percent =
        row['%_Decision_Amount'] != null ? Number(row['%_Decision_Amount']) : null
      const allocationId = row['Allocation_ID'] != null ? String(row['Allocation_ID']) : null

      return {
        allocation_id: allocationId,
        state: row['State'] ?? null,
        amount: amount != null && !Number.isNaN(amount) ? amount : null,
        allocation_amount: amount != null && !Number.isNaN(amount) ? amount : null,
        percent_of_decision: percent != null && !Number.isNaN(percent) ? percent : null,
        percent_decision_amount: percent != null && !Number.isNaN(percent) ? percent : null,
      }
    })

    return NextResponse.json(list)
  } catch (error) {
    console.error('Error fetching allocations for decision:', error)
    return NextResponse.json({ error: 'Failed to fetch allocations' }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ decisionId: string }> }
) {
  const auth = await requireGrantEditor()
  if (!auth.ok) return auth.response

  try {
    const { decisionId } = await params
    const body = await request.json()
    const { allocations } = body || {}

    if (!Array.isArray(allocations) || allocations.length === 0) {
      return NextResponse.json({ error: 'allocations array is required' }, { status: 400 })
    }

    const decision = await findDecisionByIdentifier(auth.ctx.supabase, decisionId)
    if (!decision) {
      return NextResponse.json({ error: 'Decision not found' }, { status: 404 })
    }

    const groupKey = (await resolveDecisionGroupKey(auth.ctx.supabase, decisionId)) || decisionId
    const decisionAmount = decision.decision_amount ?? null
    const decisionDate = decision.decision_date ?? null

    const rowsToInsert = allocations.map((alloc: Record<string, unknown>) => {
      const amountNum = alloc?.amount !== undefined ? Number(alloc.amount) : null
      const percent =
        amountNum && decisionAmount ? (amountNum / Number(decisionAmount)) * 100 : null

      return {
        Allocation_ID: crypto.randomUUID(),
        Decision_ID: groupKey,
        Decision_Date:
          typeof alloc?.decision_date === 'string' ? alloc.decision_date : decisionDate,
        State: typeof alloc?.state === 'string' ? alloc.state : null,
        'Allocation Amount': amountNum,
        '%_Decision_Amount': percent,
        Decision_Amount: decisionAmount,
        Grant_ID: typeof alloc?.grant_id === 'string' ? alloc.grant_id : null,
        Partner:
          typeof alloc?.partner === 'string' ? alloc.partner : decision.partner || null,
        'Decision Maker':
          typeof alloc?.decision_maker === 'string' ? alloc.decision_maker : null,
        Restriction:
          typeof alloc?.restriction === 'string' ? alloc.restriction : decision.restriction || null,
        Notes: typeof alloc?.notes === 'string' ? alloc.notes : null,
        Status: typeof alloc?.status === 'string' ? alloc.status : 'new',
        'Flow Oversight': typeof alloc?.flow_oversight === 'string' ? alloc.flow_oversight : null,
        Serial: alloc?.serial ?? null,
        sync_status: 'pending' as const,
      }
    })

    const { error: insertError } = await auth.ctx.supabase
      .from('allocations_by_date')
      .insert(rowsToInsert)

    if (insertError) throw insertError

    const totalAllocated = await refreshDecisionAllocationSum(auth.ctx.supabase, groupKey)

    return NextResponse.json({ success: true, total_allocated: totalAllocated })
  } catch (error) {
    console.error('Error creating allocations:', error)
    return NextResponse.json({ error: 'Failed to create allocations' }, { status: 500 })
  }
}
