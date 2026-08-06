import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireGrantEditor } from '@/lib/grantManagement/requireGrantEditor'
import { transferAmount } from '@/lib/grantManagement/fundTransferHelpers'

const FR_SELECT =
  'id, request_id, date_submitted, requested_amount, partner_name, file_name, file_link, airtable_record_id, created_at, updated_at'

async function enrichOne(supabase: ReturnType<typeof getSupabaseAdmin>, row: Record<string, unknown>) {
  const frId = row.id as string
  const [{ data: links }, { data: transfers }] = await Promise.all([
    supabase.from('fund_request_decisions').select('decision_id_proposed').eq('fund_request_id', frId),
    supabase.from('transfer_segments').select('*').eq('fund_request_id', frId).order('transfer_id'),
  ])
  const segs = transfers || []
  const rollup = segs.reduce(
    (sum, t) => sum + (transferAmount(t.activity_amount, t.transfer_fee_amount) || 0),
    0
  )
  const requested = row.requested_amount != null ? Number(row.requested_amount) : null
  return {
    ...row,
    decision_ids: (links || []).map((l) => l.decision_id_proposed),
    transfer_count: segs.length,
    transfer_amount_rollup: rollup,
    variance: requested != null ? requested - rollup : null,
    transfers: segs.map((t) => ({
      ...t,
      transfer_amount: transferAmount(t.activity_amount, t.transfer_fee_amount),
    })),
  }
}

async function setDecisions(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  fundRequestId: string,
  decisionIds: string[]
) {
  await supabase.from('fund_request_decisions').delete().eq('fund_request_id', fundRequestId)
  const unique = [...new Set(decisionIds.map((d) => d.trim()).filter(Boolean))]
  if (!unique.length) return
  const { error } = await supabase.from('fund_request_decisions').insert(
    unique.map((decision_id_proposed) => ({ fund_request_id: fundRequestId, decision_id_proposed }))
  )
  if (error) throw error
}

/** GET /api/fund-requests/[id] */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase.from('fund_requests').select(FR_SELECT).eq('id', params.id).single()
    if (error) throw error
    return NextResponse.json(await enrichOne(supabase, data as Record<string, unknown>))
  } catch (error) {
    console.error('Error fetching fund request:', error)
    return NextResponse.json({ error: 'Failed to fetch fund request' }, { status: 500 })
  }
}

/** PUT /api/fund-requests/[id] */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireGrantEditor()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (typeof body.request_id === 'string') patch.request_id = body.request_id.trim()
    if ('date_submitted' in body) patch.date_submitted = body.date_submitted || null
    if ('requested_amount' in body) {
      patch.requested_amount =
        body.requested_amount != null && body.requested_amount !== ''
          ? Number(body.requested_amount)
          : null
    }
    if ('partner_name' in body) patch.partner_name = body.partner_name?.trim() || null
    if ('file_name' in body) patch.file_name = body.file_name?.trim() || null
    if ('file_link' in body) patch.file_link = body.file_link?.trim() || null

    const { data, error } = await auth.ctx.supabase
      .from('fund_requests')
      .update(patch)
      .eq('id', params.id)
      .select(FR_SELECT)
      .single()

    if (error) throw error

    if (Array.isArray(body.decision_ids)) {
      await setDecisions(auth.ctx.supabase, params.id, body.decision_ids)
    }

    return NextResponse.json(await enrichOne(auth.ctx.supabase, data as Record<string, unknown>))
  } catch (error) {
    console.error('Error updating fund request:', error)
    return NextResponse.json({ error: 'Failed to update fund request' }, { status: 500 })
  }
}

/** DELETE /api/fund-requests/[id] */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireGrantEditor()
  if (!auth.ok) return auth.response

  try {
    // Explicit cleanup so transfers go even if FK is still ON DELETE SET NULL
    const { error: tsError } = await auth.ctx.supabase
      .from('transfer_segments')
      .delete()
      .eq('fund_request_id', params.id)
    if (tsError) throw tsError

    const { error } = await auth.ctx.supabase.from('fund_requests').delete().eq('id', params.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting fund request:', error)
    return NextResponse.json({ error: 'Failed to delete fund request' }, { status: 500 })
  }
}
