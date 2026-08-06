import { NextRequest, NextResponse } from 'next/server'
import { requireGrantEditor } from '@/lib/grantManagement/requireGrantEditor'
import {
  TRANSFER_PURPOSES,
  normalizeTransferStatus,
  transferAmount,
} from '@/lib/grantManagement/fundTransferHelpers'

const TS_SELECT =
  'id, transfer_id, auto_number, fund_request_id, request_id, grant_id, fsp_id, decision_id_proposed, purpose, status, activity_amount, transfer_fee_amount, transfer_received_date, partner_name, comment, airtable_record_id, created_at, updated_at'

function mapRow(row: Record<string, unknown>) {
  return {
    ...row,
    transfer_amount: transferAmount(
      row.activity_amount as number | null,
      row.transfer_fee_amount as number | null
    ),
  }
}

/** PUT /api/transfer-segments/[id] */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireGrantEditor()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (typeof body.transfer_id === 'string') patch.transfer_id = body.transfer_id.trim()
    if ('grant_id' in body) patch.grant_id = body.grant_id?.trim() || null
    if ('fsp_id' in body) patch.fsp_id = body.fsp_id || null
    if ('decision_id_proposed' in body) {
      patch.decision_id_proposed = body.decision_id_proposed?.trim() || null
    }
    if ('purpose' in body) {
      patch.purpose =
        typeof body.purpose === 'string' &&
        (TRANSFER_PURPOSES as readonly string[]).includes(body.purpose)
          ? body.purpose
          : body.purpose?.trim() || null
    }
    if ('status' in body) patch.status = normalizeTransferStatus(body.status)
    if ('activity_amount' in body) {
      patch.activity_amount =
        body.activity_amount != null && body.activity_amount !== ''
          ? Number(body.activity_amount)
          : null
    }
    if ('transfer_fee_amount' in body) {
      patch.transfer_fee_amount =
        body.transfer_fee_amount != null && body.transfer_fee_amount !== ''
          ? Number(body.transfer_fee_amount)
          : null
    }
    if ('transfer_received_date' in body) {
      patch.transfer_received_date = body.transfer_received_date || null
    }
    if ('partner_name' in body) patch.partner_name = body.partner_name?.trim() || null
    if ('comment' in body) patch.comment = body.comment?.trim() || null
    if ('fund_request_id' in body) patch.fund_request_id = body.fund_request_id || null

    const { data, error } = await auth.ctx.supabase
      .from('transfer_segments')
      .update(patch)
      .eq('id', params.id)
      .select(TS_SELECT)
      .single()

    if (error) throw error
    return NextResponse.json(mapRow(data as Record<string, unknown>))
  } catch (error) {
    console.error('Error updating transfer segment:', error)
    return NextResponse.json({ error: 'Failed to update transfer segment' }, { status: 500 })
  }
}

/** DELETE /api/transfer-segments/[id] */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireGrantEditor()
  if (!auth.ok) return auth.response

  try {
    const { error } = await auth.ctx.supabase.from('transfer_segments').delete().eq('id', params.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting transfer segment:', error)
    return NextResponse.json({ error: 'Failed to delete transfer segment' }, { status: 500 })
  }
}
