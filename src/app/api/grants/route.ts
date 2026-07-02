import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireGrantEditor } from '@/lib/grantManagement/requireGrantEditor'
import { airtableMeta, syncGrantToAirtable } from '@/lib/grantManagement/pushToAirtable'
import { SYNC_STATUS } from '@/lib/grantManagement/syncStatus'

const GRANT_SELECT =
  'id, grant_id, donor_id, donor_name, partner_name, project_name, grant_start_date, grant_end_date, status, total_transferred_amount_usd, sum_activity_amount, sum_transfer_fee_amount'

function mapGrantRow(item: Record<string, unknown>) {
  return {
    id: item.id as string,
    grant_id: item.grant_id ?? null,
    donor_id: item.donor_id ?? null,
    donor_name: item.donor_name ?? null,
    partner_name: item.partner_name ?? null,
    project_name: item.project_name ?? null,
    grant_start_date: item.grant_start_date ?? null,
    grant_end_date: item.grant_end_date ?? null,
    status: item.status ?? null,
    total_transferred_amount_usd: item.total_transferred_amount_usd ?? null,
    sum_activity_amount: item.sum_activity_amount ?? null,
    sum_transfer_fee_amount: item.sum_transfer_fee_amount ?? null,
  }
}

function computeTransferFee(
  totalTransferred: number | null | undefined,
  sumActivity: number | null | undefined,
  explicitFee: number | null | undefined
): number | null {
  if (explicitFee != null && !Number.isNaN(explicitFee)) return explicitFee
  if (
    totalTransferred != null &&
    sumActivity != null &&
    !Number.isNaN(totalTransferred) &&
    !Number.isNaN(sumActivity)
  ) {
    return totalTransferred - sumActivity
  }
  return null
}

function parseGrantBody(body: Record<string, unknown>) {
  const grant_id = typeof body.grant_id === 'string' ? body.grant_id.trim() : ''
  if (!grant_id) {
    return { error: 'grant_id is required' as const }
  }

  const donor_id = typeof body.donor_id === 'string' ? body.donor_id.trim() : ''
  const donor_name = typeof body.donor_name === 'string' ? body.donor_name.trim() : ''
  if (!donor_id || !donor_name) {
    return { error: 'donor_id and donor_name are required' as const }
  }

  const total_transferred_amount_usd =
    body.total_transferred_amount_usd != null ? Number(body.total_transferred_amount_usd) : null
  const sum_activity_amount =
    body.sum_activity_amount != null ? Number(body.sum_activity_amount) : null
  const sum_transfer_fee_amount = computeTransferFee(
    total_transferred_amount_usd,
    sum_activity_amount,
    body.sum_transfer_fee_amount != null ? Number(body.sum_transfer_fee_amount) : null
  )

  return {
    payload: {
      grant_id,
      donor_id,
      donor_name,
      partner_name: typeof body.partner_name === 'string' ? body.partner_name.trim() || null : null,
      project_name: typeof body.project_name === 'string' ? body.project_name.trim() || null : null,
      grant_start_date: typeof body.grant_start_date === 'string' ? body.grant_start_date || null : null,
      grant_end_date: typeof body.grant_end_date === 'string' ? body.grant_end_date || null : null,
      status: typeof body.status === 'string' ? body.status || 'Active' : 'Active',
      total_transferred_amount_usd:
        total_transferred_amount_usd != null && !Number.isNaN(total_transferred_amount_usd)
          ? total_transferred_amount_usd
          : null,
      sum_activity_amount:
        sum_activity_amount != null && !Number.isNaN(sum_activity_amount) ? sum_activity_amount : null,
      sum_transfer_fee_amount,
      sync_status: SYNC_STATUS.PENDING,
    },
  }
}

/**
 * GET /api/grants - List grants from grants_grid_view (portal canonical).
 * Query: ?status=all|Active|Complete (default all)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') ?? 'all'

    let query = supabase.from('grants_grid_view').select(GRANT_SELECT).order('grant_start_date', {
      ascending: false,
    })

    if (status !== 'all') {
      query = query.eq('status', status)
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json((data || []).map((item) => mapGrantRow(item as Record<string, unknown>)))
  } catch (error) {
    console.error('Error fetching grants:', error)
    return NextResponse.json({ error: 'Failed to fetch grants' }, { status: 500 })
  }
}

/** POST /api/grants - Create a grant in grants_grid_view (Supabase only; sync_status = pending). */
export async function POST(request: NextRequest) {
  const auth = await requireGrantEditor()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const parsed = parseGrantBody(body)
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const { data, error } = await auth.ctx.supabase
      .from('grants_grid_view')
      .insert(parsed.payload)
      .select(GRANT_SELECT)
      .single()

    if (error) throw error

    const push = await syncGrantToAirtable(auth.ctx.supabase, data.id)

    return NextResponse.json(
      { ...mapGrantRow(data as Record<string, unknown>), ...airtableMeta(push) },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating grant:', error)
    return NextResponse.json({ error: 'Failed to create grant' }, { status: 500 })
  }
}
