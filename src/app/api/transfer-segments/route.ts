import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireGrantEditor } from '@/lib/grantManagement/requireGrantEditor'
import {
  TRANSFER_PURPOSES,
  TRANSFER_STATUSES,
  buildTransferId,
  computeTransferFeeAmount,
  normalizeTransferStatus,
  transferAmount,
} from '@/lib/grantManagement/fundTransferHelpers'

const TS_SELECT =
  'id, transfer_id, auto_number, fund_request_id, request_id, grant_id, fsp_id, decision_id_proposed, purpose, status, activity_amount, transfer_fee_amount, transfer_received_date, partner_name, comment, file_name, file_link, airtable_record_id, created_at, updated_at'

function mapRow(row: Record<string, unknown>) {
  return {
    ...row,
    transfer_amount: transferAmount(
      row.activity_amount as number | null,
      row.transfer_fee_amount as number | null
    ),
  }
}

async function resolveTransferFeeAmount(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  fspId: string | null | undefined,
  activityAmount: number | null
): Promise<number | null> {
  if (activityAmount == null) return null
  if (!fspId) return computeTransferFeeAmount(activityAmount, 0)
  const { data } = await supabase
    .from('fsps')
    .select('transfer_fee_percent')
    .eq('id', fspId)
    .maybeSingle()
  return computeTransferFeeAmount(
    activityAmount,
    (data?.transfer_fee_percent as number | null | undefined) ?? 0
  )
}

async function nextAutoNumber(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<number> {
  const { data } = await supabase
    .from('transfer_segments')
    .select('auto_number')
    .order('auto_number', { ascending: false, nullsFirst: false })
    .limit(1)
  const max = data?.[0]?.auto_number
  return (typeof max === 'number' ? max : 0) + 1
}

/** GET /api/transfer-segments?fund_request_id= */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    const fundRequestId = new URL(request.url).searchParams.get('fund_request_id')
    let query = supabase.from('transfer_segments').select(TS_SELECT).order('transfer_id')
    if (fundRequestId) query = query.eq('fund_request_id', fundRequestId)
    const { data, error } = await query
    if (error) throw error
    return NextResponse.json((data || []).map((r) => mapRow(r as Record<string, unknown>)))
  } catch (error) {
    console.error('Error fetching transfer segments:', error)
    return NextResponse.json({ error: 'Failed to fetch transfer segments' }, { status: 500 })
  }
}

/** POST /api/transfer-segments */
export async function POST(request: NextRequest) {
  const auth = await requireGrantEditor()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const fund_request_id =
      typeof body.fund_request_id === 'string' ? body.fund_request_id.trim() : ''
    if (!fund_request_id) {
      return NextResponse.json({ error: 'fund_request_id is required' }, { status: 400 })
    }

    const { data: fr, error: frError } = await auth.ctx.supabase
      .from('fund_requests')
      .select('id, request_id, date_submitted, partner_name')
      .eq('id', fund_request_id)
      .single()
    if (frError || !fr) {
      return NextResponse.json({ error: 'Fund request not found' }, { status: 404 })
    }

    const partner_name =
      (typeof body.partner_name === 'string' && body.partner_name.trim()) || fr.partner_name || null
    const auto_number =
      body.auto_number != null && body.auto_number !== ''
        ? Number(body.auto_number)
        : await nextAutoNumber(auth.ctx.supabase)

    const transfer_id =
      typeof body.transfer_id === 'string' && body.transfer_id.trim()
        ? body.transfer_id.trim()
        : buildTransferId(partner_name, fr.date_submitted, auto_number)

    const purpose =
      typeof body.purpose === 'string' && (TRANSFER_PURPOSES as readonly string[]).includes(body.purpose)
        ? body.purpose
        : body.purpose?.trim() || null
    const status = normalizeTransferStatus(body.status) || 'Requested'
    if (!(TRANSFER_STATUSES as readonly string[]).includes(status) && status !== 'Requested') {
      // allow cleaned values; already normalized
    }

    const activity_amount =
      body.activity_amount != null && body.activity_amount !== '' ? Number(body.activity_amount) : null
    const fsp_id = body.fsp_id || null
    const transfer_fee_amount = await resolveTransferFeeAmount(
      auth.ctx.supabase,
      fsp_id,
      activity_amount
    )

    const { data, error } = await auth.ctx.supabase
      .from('transfer_segments')
      .insert({
        transfer_id,
        auto_number,
        fund_request_id,
        request_id: fr.request_id,
        grant_id: body.grant_id?.trim() || null,
        fsp_id,
        decision_id_proposed: body.decision_id_proposed?.trim() || null,
        purpose,
        status,
        activity_amount,
        transfer_fee_amount,
        transfer_received_date: body.transfer_received_date || null,
        partner_name,
        comment: body.comment?.trim() || null,
        file_name: typeof body.file_name === 'string' ? body.file_name.trim() || null : null,
        file_link: typeof body.file_link === 'string' ? body.file_link.trim() || null : null,
        updated_at: new Date().toISOString(),
      })
      .select(TS_SELECT)
      .single()

    if (error) throw error
    return NextResponse.json(mapRow(data as Record<string, unknown>), { status: 201 })
  } catch (error) {
    console.error('Error creating transfer segment:', error)
    return NextResponse.json({ error: 'Failed to create transfer segment' }, { status: 500 })
  }
}
