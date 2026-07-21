import { NextResponse } from 'next/server'
import { requireGrantEditor } from '@/lib/grantManagement/requireGrantEditor'
import { findDecisionByIdentifier } from '@/lib/grantManagement/resolveDecisionKey'
import {
  airtableMeta,
  removeDecisionFromAirtable,
  syncDecisionToAirtable,
} from '@/lib/grantManagement/pushToAirtable'
import { SYNC_STATUS } from '@/lib/grantManagement/syncStatus'

function mapDecisionRow(row: {
  id: string
  decision_id: string | null
  decision_id_proposed: string | null
  grant_name: string | null
  restriction: string | null
  sum_allocation_amount: number | null
  decision_amount: number | null
  decision_date: string | null
  partner: string | null
  notes: string | null
  file_name: string | null
  file_link: string | null
}) {
  return {
    id: row.id,
    decision_id: row.decision_id ?? null,
    decision_id_proposed: row.decision_id_proposed ?? null,
    grant_name: row.grant_name ?? null,
    restriction: row.restriction ?? null,
    sum_allocation_amount:
      row.sum_allocation_amount != null ? Number(row.sum_allocation_amount) : null,
    decision_amount: row.decision_amount != null ? Number(row.decision_amount) : null,
    decision_date: row.decision_date ?? null,
    partner: row.partner ?? null,
    notes: row.notes ?? null,
    file_name: row.file_name ?? null,
    file_link: row.file_link ?? null,
  }
}

const DECISION_SELECT =
  'id, decision_id_proposed, decision_id, grant_name, restriction, sum_allocation_amount, decision_amount, decision_date, partner, notes, file_name, file_link'

/**
 * PATCH /api/distribution-decisions/[decisionId]
 * Update decision document fields (and optionally other editable metadata).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ decisionId: string }> }
) {
  const auth = await requireGrantEditor()
  if (!auth.ok) return auth.response

  try {
    const { decisionId: rawDecisionId } = await params
    const decisionId = rawDecisionId.trim()
    const decision = await findDecisionByIdentifier(auth.ctx.supabase, decisionId)
    if (!decision) {
      return NextResponse.json({ error: 'Distribution decision not found' }, { status: 404 })
    }

    const body = await request.json()
    const updates: Record<string, string | null> = {}

    if ('file_name' in body) {
      updates.file_name =
        typeof body.file_name === 'string' ? body.file_name.trim() || null : null
    }
    if ('file_link' in body) {
      updates.file_link =
        typeof body.file_link === 'string' ? body.file_link.trim() || null : null
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No supported fields to update (file_name, file_link)' },
        { status: 400 }
      )
    }

    updates.sync_status = SYNC_STATUS.PENDING

    const { data, error } = await auth.ctx.supabase
      .from('distribution_decision_master_sheet_1')
      .update(updates)
      .eq('id', decision.id)
      .select(DECISION_SELECT)
      .single()

    if (error) throw error

    const push = await syncDecisionToAirtable(auth.ctx.supabase, data.id)

    return NextResponse.json({
      ...mapDecisionRow(data),
      ...airtableMeta(push),
    })
  } catch (error) {
    console.error('Error updating distribution decision:', error)
    return NextResponse.json({ error: 'Failed to update distribution decision' }, { status: 500 })
  }
}

// DELETE /api/distribution-decisions/[decisionId] - delete a decision (cascading allocations via FK)
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ decisionId: string }> }
) {
  const auth = await requireGrantEditor()
  if (!auth.ok) return auth.response

  try {
    const { decisionId: rawDecisionId } = await params
    const decisionId = rawDecisionId.trim()
    const decision = await findDecisionByIdentifier(auth.ctx.supabase, decisionId)

    if (!decision) {
      return NextResponse.json({ error: 'Distribution decision not found' }, { status: 404 })
    }

    const { data: fullRow, error: fullError } = await auth.ctx.supabase
      .from('distribution_decision_master_sheet_1')
      .select('id, decision_id_proposed, airtable_record_id, last_pushed_at')
      .eq('id', decision.id)
      .single()

    if (fullError || !fullRow) {
      return NextResponse.json({ error: 'Distribution decision not found' }, { status: 404 })
    }

    const push = await removeDecisionFromAirtable(
      auth.ctx.supabase,
      fullRow.decision_id_proposed ?? decisionId,
      fullRow.airtable_record_id,
      fullRow.last_pushed_at
    )

    const { error: deleteError } = await auth.ctx.supabase
      .from('distribution_decision_master_sheet_1')
      .delete()
      .eq('id', fullRow.id)

    if (deleteError) throw deleteError

    return NextResponse.json({ success: true, ...airtableMeta(push) })
  } catch (error) {
    console.error('Error deleting distribution decision:', error)
    return NextResponse.json({ error: 'Failed to delete distribution decision' }, { status: 500 })
  }
}
