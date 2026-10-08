import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireGrantEditor } from '@/lib/grantManagement/requireGrantEditor'
import { transferAmount } from '@/lib/grantManagement/fundTransferHelpers'
import {
  coordinatorWriteForbiddenResponse,
  getUserOrgScope,
  isDisclosedCoordinator,
} from '@/lib/canvas/orgScope'
import {
  applyTreasuryOrgFilter,
  stampTreasuryOrganizationId,
  treasuryListBlocked,
} from '@/lib/grantManagement/orgTreasuryScope'

const FR_SELECT =
  'id, organization_id, request_id, date_submitted, requested_amount, partner_name, file_name, file_link, airtable_record_id, created_at, updated_at'

const SUPABASE_IN_BATCH = 80
const PAGE_SIZE = 1000

function chunkIds(ids: string[]): string[][] {
  if (!ids.length) return []
  const out: string[][] = []
  for (let i = 0; i < ids.length; i += SUPABASE_IN_BATCH) {
    out.push(ids.slice(i, i + SUPABASE_IN_BATCH))
  }
  return out
}

async function fetchAllPages(
  buildQuery: (from: number, to: number) => any
): Promise<any[]> {
  const all: any[] = []
  let from = 0
  for (;;) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1)
    if (error) throw error
    if (!data?.length) break
    all.push(...data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

async function enrichFundRequests(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  rows: Array<Record<string, unknown>>
) {
  if (!rows.length) return []
  const ids = rows.map((r) => r.id as string)

  const links: Array<{ fund_request_id: string; decision_id_proposed: string }> = []
  type TransferSeg = {
    id: string
    fund_request_id: string
    transfer_id?: string | null
    activity_amount?: number | null
    transfer_fee_amount?: number | null
    status?: string | null
    grant_id?: string | null
    fsp_id?: string | null
    transfer_received_date?: string | null
    purpose?: string | null
    comment?: string | null
    file_name?: string | null
    file_link?: string | null
  }
  const transfers: TransferSeg[] = []
  for (const batch of chunkIds(ids)) {
    const [linkPage, transferPage] = await Promise.all([
      fetchAllPages((from, to) =>
        supabase
          .from('fund_request_decisions')
          .select('fund_request_id, decision_id_proposed')
          .in('fund_request_id', batch)
          .order('fund_request_id', { ascending: true })
          .order('decision_id_proposed', { ascending: true })
          .range(from, to)
      ),
      fetchAllPages((from, to) =>
        supabase
          .from('transfer_segments')
          .select(
            'id, fund_request_id, transfer_id, activity_amount, transfer_fee_amount, status, grant_id, fsp_id, transfer_received_date, purpose, comment, file_name, file_link'
          )
          .in('fund_request_id', batch)
          .order('id', { ascending: true })
          .range(from, to)
      ),
    ])
    links.push(...(linkPage as Array<{ fund_request_id: string; decision_id_proposed: string }>))
    transfers.push(...(transferPage as TransferSeg[]))
  }

  const decisionsByFr = new Map<string, string[]>()
  for (const l of links) {
    const list = decisionsByFr.get(l.fund_request_id) || []
    list.push(l.decision_id_proposed)
    decisionsByFr.set(l.fund_request_id, list)
  }

  const transfersByFr = new Map<string, TransferSeg[]>()
  for (const t of transfers) {
    const frId = t.fund_request_id
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
    const orgScope = await getUserOrgScope()
    if (treasuryListBlocked(orgScope, 'fund_requests')) {
      return NextResponse.json([])
    }

    const supabase = getSupabaseAdmin()
    const data = await fetchAllPages((from, to) => {
      let q = supabase
        .from('fund_requests')
        .select(FR_SELECT)
        .order('date_submitted', { ascending: false, nullsFirst: false })
        .order('id', { ascending: true })
      q = applyTreasuryOrgFilter(q, orgScope, 'fund_requests')
      return q.range(from, to)
    })
    const enriched = await enrichFundRequests(supabase, data as Record<string, unknown>[])
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

  const orgScope = await getUserOrgScope(auth.ctx.supabase)
  if (isDisclosedCoordinator(orgScope)) {
    return coordinatorWriteForbiddenResponse()
  }
  if (treasuryListBlocked(orgScope, 'fund_requests')) {
    return coordinatorWriteForbiddenResponse()
  }

  try {
    const body = await request.json()
    const request_id = typeof body.request_id === 'string' ? body.request_id.trim() : ''
    if (!request_id) {
      return NextResponse.json({ error: 'request_id is required' }, { status: 400 })
    }

    const payload = stampTreasuryOrganizationId(
      {
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
      },
      orgScope
    )

    const { data, error } = await auth.ctx.supabase
      .from('fund_requests')
      .insert(payload)
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
