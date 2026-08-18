import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { loadProjectPaymentSummaries } from '@/lib/mouPaymentConfirmations'

/**
 * GET /api/f4/project-exchange-rate?project_id=<uuid>
 * Returns SDG per 1 USD from the project's payment confirmations or MOU-level rate.
 * When multiple confirmations exist, uses the latest rate (by transfer_date / created_at).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')?.trim()
    if (!projectId) {
      return NextResponse.json({ error: 'Query parameter project_id is required' }, { status: 400 })
    }

    const supabase = getSupabaseRouteClient()
    const { data: project, error: projErr } = await supabase
      .from('err_projects')
      .select('id, mou_id')
      .eq('id', projectId)
      .maybeSingle()

    if (projErr) throw projErr
    if (!project?.mou_id) {
      return NextResponse.json({ exchange_rate: null, source: null as 'payment_confirmation' | 'mou' | null })
    }

    const summaries = await loadProjectPaymentSummaries(supabase, {
      projectIds: [projectId],
      mouIds: [project.mou_id],
    })
    const fromPayment = summaries[projectId]?.exchange_rate ?? null

    const { data: mou, error: mouErr } = await supabase
      .from('mous')
      .select('exchange_rate')
      .eq('id', project.mou_id)
      .maybeSingle()

    if (mouErr) throw mouErr
    if (!mou) {
      return NextResponse.json({ exchange_rate: null, source: null as 'payment_confirmation' | 'mou' | null })
    }

    const fromMouCol =
      typeof mou.exchange_rate === 'number' && mou.exchange_rate > 0 && Number.isFinite(mou.exchange_rate)
        ? mou.exchange_rate
        : null
    const rate = fromPayment ?? fromMouCol
    const source: 'payment_confirmation' | 'mou' | null =
      rate == null ? null : fromPayment != null ? 'payment_confirmation' : 'mou'

    return NextResponse.json({ exchange_rate: rate, source })
  } catch (e) {
    console.error('F4 project-exchange-rate error', e)
    return NextResponse.json({ error: 'Failed to resolve exchange rate' }, { status: 500 })
  }
}
