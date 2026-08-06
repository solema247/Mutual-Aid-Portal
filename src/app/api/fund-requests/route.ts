import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireGrantEditor } from '@/lib/grantManagement/requireGrantEditor'
import { transferAmount } from '@/lib/grantManagement/fundTransferHelpers'

const FR_SELECT =
  'id, request_id, date_submitted, requested_amount, partner_name, file_name, file_link, airtable_record_id, created_at, updated_at'

async function enrichFundRequests(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  rows: Array<Record<string, unknown>>
) {
  if (!rows.length) return []
  const ids = rows.map((r) => r.id as string)

  const [{ data: links }, { data: transfers }] = await Promise.all([
    supabase.from('fund_request_decisions').select('fund_request_id, decision_id_proposed').in('fund_request_id', ids),
    supabase
      .from('transfer_segments')
      .select('id, fund_request_id, transfer_id, activity_amount, transfer_fee_amount, status, grant_id, fsp_id')
      .in('fund_request_id', ids),
  ])

  const decisionsByFr = new Map<string, string[]>()
  for (const l of links || []) {
    const list = decisionsByFr.get(l.fund_request_id) || []
    list.push(l.decision_id_proposed)
    decisionsByFr.set(l.fund_request_id, list)
  }

  const transfersByFr = new Map<string, typeof transfers>()
  for (const t of transfers || []) {
    const frId = t.fund_request_id as string
    if (!frId) continue
    const list = transfersByFr.get(frId) || []
    list.push(t)
    transfersByFr.set(frId, list)
  }

  return rows.map((r) => {
    const frId = r.id as string
    const segs = transfersByFr.get(frId) || []
    const rollup = segs.reduce((sum, t) => sum + (transferAmount(t.activity_amount, t.transfer_fee_amount) || 0), 0)
    const requested = r.requested_amount != null ? Number(r.requested_amount) : null
    return {
      ...r,
      decision_ids: decisionsByFr.get(frId) || [],
      transfer_count: segs.length,
      transfer_amount_rollup: rollup,
      variance: requested != null ? requested - rollup : null,
      transfers: segs.map((t) => ({
        ...t,
        transfer_amount: transferAmount(t.activity_amount, t.transfer_fee_amount),
      })),
    }
  })
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

/** GET /api/fund-requests */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('fund_requests')
      .select(FR_SELECT)
      .order('date_submitted', { ascending: false, nullsFirst: false })
    if (error) throw error
    const enriched = await enrichFundRequests(supabase, (data || []) as Record<string, unknown>[])
    return NextResponse.json(enriched)
  } catch (error) {
    console.error('Error fetching fund requests:', error)
    return NextResponse.json({ error: 'Failed to fetch fund requests' }, { status: 500 })
  }
}

/** POST /api/fund-requests */
export async function POST(request: NextRequest) {
  const auth = await requireGrantEditor()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const request_id = typeof body.request_id === 'string' ? body.request_id.trim() : ''
    if (!request_id) {
      return NextResponse.json({ error: 'request_id is required' }, { status: 400 })
    }

    const { data, error } = await auth.ctx.supabase
      .from('fund_requests')
      .insert({
        request_id,
        date_submitted: body.date_submitted || null,
        requested_amount:
          body.requested_amount != null && body.requested_amount !== ''
            ? Number(body.requested_amount)
            : null,
        partner_name: body.partner_name?.trim() || null,
        file_name: body.file_name?.trim() || null,
        file_link: body.file_link?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .select(FR_SELECT)
      .single()

    if (error) throw error

    const decisionIds: string[] = Array.isArray(body.decision_ids) ? body.decision_ids : []
    if (decisionIds.length) {
      await setDecisions(auth.ctx.supabase, data.id, decisionIds)
    }

    const [enriched] = await enrichFundRequests(auth.ctx.supabase, [data as Record<string, unknown>])
    return NextResponse.json(enriched, { status: 201 })
  } catch (error) {
    console.error('Error creating fund request:', error)
    return NextResponse.json({ error: 'Failed to create fund request' }, { status: 500 })
  }
}
