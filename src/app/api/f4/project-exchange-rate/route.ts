import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

function rateFromPaymentFile(
  paymentConfirmationRaw: string | null | undefined,
  projectId: string
): number | null {
  if (!paymentConfirmationRaw || typeof paymentConfirmationRaw !== 'string') return null
  try {
    const parsed = JSON.parse(paymentConfirmationRaw)
    if (!parsed || typeof parsed !== 'object' || !(projectId in parsed)) return null
    const er = (parsed as Record<string, { exchange_rate?: number }>)[projectId]?.exchange_rate
    if (typeof er === 'number' && er > 0 && Number.isFinite(er)) return er
  } catch {
    // ignore invalid JSON
  }
  return null
}

/**
 * GET /api/f4/project-exchange-rate?project_id=<uuid>
 * Returns SDG per 1 USD from the project's MOU (payment confirmation or MOU-level rate).
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

    const { data: mou, error: mouErr } = await supabase
      .from('mous')
      .select('exchange_rate, payment_confirmation_file')
      .eq('id', project.mou_id)
      .maybeSingle()

    if (mouErr) throw mouErr
    if (!mou) {
      return NextResponse.json({ exchange_rate: null, source: null as 'payment_confirmation' | 'mou' | null })
    }

    const fromPayment = rateFromPaymentFile(mou.payment_confirmation_file, projectId)
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
