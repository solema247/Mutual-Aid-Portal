import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

type MonthReceivingMagRow = {
  month: string | null
  receiving_mag: string | null
  amount: number | null
}

/**
 * GET /api/forecast/receiving-mag-by-month
 * Returns rows { month, receiving_mag, amount } for the Receiving MAG by month area chart.
 * Calls get_forecast_summary('month_receiving_mag') — view must expose receiving_mag.
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()

    const { data: rows, error } = await supabase.rpc('get_forecast_summary', {
      p_chart_type: 'month_receiving_mag',
    })

    if (error) {
      console.error('Forecast receiving-mag-by-month fetch error:', error)
      return NextResponse.json(
        { error: 'Failed to load receiving-mag-by-month data', details: error.message },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const payload = rows as unknown
    if (payload && typeof payload === 'object' && 'error' in payload && typeof (payload as { error: unknown }).error === 'string') {
      return NextResponse.json(
        { error: (payload as { error: string }).error },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const all = (Array.isArray(rows) ? rows : []) as MonthReceivingMagRow[]
    return NextResponse.json(all, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    })
  } catch (err) {
    console.error('Forecast receiving-mag-by-month error:', err)
    return NextResponse.json(
      { error: 'Failed to load receiving-mag-by-month data' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
