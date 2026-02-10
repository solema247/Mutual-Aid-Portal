import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

/**
 * GET /api/grants - List grants from public.grants (foreign table / Airtable).
 * Uses service role so the foreign table is readable regardless of anon GRANTs.
 * Query: ?status=all|Active|Complete (default all)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') ?? 'all'

    let query = supabase
      .from('grants')
      .select(
        'grant_id, project_name, grant_start_date, grant_end_date, status, total_transferred_amount_usd, sum_activity_amount, sum_transfer_fee_amount'
      )
      .order('grant_start_date', { ascending: false })

    if (status !== 'all') {
      query = query.eq('status', status)
    }

    const { data, error } = await query
    if (error) throw error

    const list = (data || []).map((item: Record<string, unknown>, index: number) => ({
      id: `grant-${index}-${String(item.grant_id ?? '').slice(0, 20)}`,
      grant_id: item.grant_id ?? null,
      project_name: item.project_name ?? null,
      grant_start_date: item.grant_start_date ?? null,
      grant_end_date: item.grant_end_date ?? null,
      status: item.status ?? null,
      total_transferred_amount_usd: item.total_transferred_amount_usd ?? null,
      sum_activity_amount: item.sum_activity_amount ?? null,
      sum_transfer_fee_amount: item.sum_transfer_fee_amount ?? null,
    }))

    return NextResponse.json(list)
  } catch (error) {
    console.error('Error fetching grants:', error)
    return NextResponse.json({ error: 'Failed to fetch grants' }, { status: 500 })
  }
}
