import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

type MonthStateRow = {
  month: string | null
  state_name: string | null
  amount: number | null
}

/**
 * GET /api/forecast/state-support
 * Returns rows { month, state_name, amount } for the State-level Support stacked bar chart.
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()
    const { data: rows, error } = await supabase.rpc('get_forecast_summary', {
      p_chart_type: 'month_state',
    })

    if (error) {
      console.error('Forecast state-support fetch error:', error)
      return NextResponse.json(
        { error: 'Failed to load state-support data', details: error.message },
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

    const all = (Array.isArray(rows) ? rows : []) as MonthStateRow[]
    return NextResponse.json(all, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    })
  } catch (err) {
    console.error('Forecast state-support error:', err)
    return NextResponse.json(
      { error: 'Failed to load state-support data' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
