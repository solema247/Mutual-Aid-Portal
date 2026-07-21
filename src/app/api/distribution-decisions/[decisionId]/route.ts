import { NextResponse } from 'next/server'
import { requireGrantEditor } from '@/lib/grantManagement/requireGrantEditor'
import { findDecisionByIdentifier } from '@/lib/grantManagement/resolveDecisionKey'
import {
  airtableMeta,
  removeDecisionFromAirtable,
  syncDecisionToAirtable,
} from '@/lib/grantManagement/pushToAirtable'
import { SYNC_STATUS } from '@/lib/grantManagement/syncStatus'
import {
  buildDecisionDocument,
  normalizeDecisionDocuments,
  primaryFileFields,
  type DecisionDocument,
} from '@/lib/grantManagement/decisionDocument'

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
  decision_documents?: unknown
}) {
  const documents = normalizeDecisionDocuments(row)
  const primary = primaryFileFields(documents)
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
    file_name: primary.file_name ?? row.file_name ?? null,
    file_link: primary.file_link ?? row.file_link ?? null,
    documents,
  }
}

const DECISION_SELECT =
  'id, decision_id_proposed, decision_id, grant_name, restriction, sum_allocation_amount, decision_amount, decision_date, partner, notes, file_name, file_link, decision_documents'

function parseAddDocuments(body: any): DecisionDocument[] {
  const items = Array.isArray(body.add_documents)
    ? body.add_documents
    : Array.isArray(body.documents)
      ? body.documents
      : null

  if (!items) {
    // Legacy single-file replace/add
    if (typeof body.file_link === 'string' && body.file_link.trim()) {
      return [
        buildDecisionDocument({
          file_name:
            typeof body.file_name === 'string' && body.file_name.trim()
              ? body.file_name.trim()
              : 'Document',
          file_link: body.file_link.trim(),
          source: 'portal',
        }),
      ]
    }
    return []
  }

  const out: DecisionDocument[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const file_link = typeof item.file_link === 'string' ? item.file_link.trim() : ''
    if (!file_link) continue
    out.push(
      buildDecisionDocument({
        file_name:
          typeof item.file_name === 'string' && item.file_name.trim()
            ? item.file_name.trim()
            : 'Document',
        file_link,
        source: 'portal',
      })
    )
  }
  return out
}

/**
 * PATCH /api/distribution-decisions/[decisionId]
 * Add/remove decision documents (multi-file). Keeps file_name/file_link as primary for Airtable.
 *
 * Body:
 * - add_documents: [{ file_name, file_link }]
 * - remove_document_ids: string[]
 * - legacy: file_name + file_link (appends one document)
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

    const { data: current, error: currentError } = await auth.ctx.supabase
      .from('distribution_decision_master_sheet_1')
      .select(DECISION_SELECT)
      .eq('id', decision.id)
      .single()

    if (currentError || !current) {
      return NextResponse.json({ error: 'Distribution decision not found' }, { status: 404 })
    }

    const body = await request.json()
    let documents = normalizeDecisionDocuments(current)

    const removeIds = Array.isArray(body.remove_document_ids)
      ? body.remove_document_ids
          .filter((id: unknown): id is string => typeof id === 'string' && Boolean(id.trim()))
          .map((id: string) => id.trim())
      : typeof body.remove_document_id === 'string' && body.remove_document_id.trim()
        ? [body.remove_document_id.trim()]
        : []

    if (removeIds.length > 0) {
      const removeSet = new Set(removeIds)
      documents = documents.filter((d) => !removeSet.has(d.id))
    }

    const toAdd = parseAddDocuments(body)
    if (toAdd.length > 0) {
      documents = [...documents, ...toAdd]
    }

    if (removeIds.length === 0 && toAdd.length === 0) {
      return NextResponse.json(
        {
          error:
            'No document changes provided (add_documents / remove_document_ids / file_name+file_link)',
        },
        { status: 400 }
      )
    }

    const primary = primaryFileFields(documents)
    const { data, error } = await auth.ctx.supabase
      .from('distribution_decision_master_sheet_1')
      .update({
        decision_documents: documents,
        file_name: primary.file_name,
        file_link: primary.file_link,
        sync_status: SYNC_STATUS.PENDING,
      })
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
