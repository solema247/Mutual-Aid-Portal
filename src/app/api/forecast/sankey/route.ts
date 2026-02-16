import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

type TransferStateRow = {
  transfer_method: string | null
  state_name: string | null
  amount: number | null
}

/**
 * GET /api/forecast/sankey
 * Calls get_forecast_summary('transfer_state') and returns Recharts Sankey format:
 * { nodes: [{ name }], links: [{ source, target, value }] }
 * Origin = transfer_method, destination = state_name, value = amount.
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()

    const { data: rows, error } = await supabase.rpc('get_forecast_summary', {
      p_chart_type: 'transfer_state',
    })

    if (error) {
      console.error('Forecast sankey fetch error:', error)
      return NextResponse.json(
        { error: 'Failed to load sankey data', details: error.message },
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

    const all = (Array.isArray(rows) ? rows : []) as TransferStateRow[]

    const transferMethods = new Map<string, number>()
    const stateNames = new Map<string, number>()
    const linkKeys = new Map<string, number>()

    for (const row of all) {
      const method = String(row.transfer_method ?? '').trim() || 'Unknown'
      const state = String(row.state_name ?? '').trim() || 'Unknown'
      const amount = typeof row.amount === 'number' && !Number.isNaN(row.amount) ? row.amount : 0
      if (amount <= 0) continue
      if (!transferMethods.has(method)) transferMethods.set(method, transferMethods.size)
      if (!stateNames.has(state)) stateNames.set(state, stateNames.size)
      const key = `${method}|${state}`
      linkKeys.set(key, (linkKeys.get(key) ?? 0) + amount)
    }

    const methodList = Array.from(transferMethods.keys())
    const stateList = Array.from(stateNames.keys())
    const nodes = [
      ...methodList.map((name) => ({ name })),
      ...stateList.map((name) => ({ name })),
    ]
    const methodCount = methodList.length
    const links = Array.from(linkKeys.entries()).map(([key, value]) => {
      const [method, state] = key.split('|')
      const source = transferMethods.get(method) ?? 0
      const target = (stateNames.get(state) ?? 0) + methodCount
      return { source, target, value }
    })

    return NextResponse.json(
      { nodes, links },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  } catch (err) {
    console.error('Forecast sankey error:', err)
    return NextResponse.json(
      { error: 'Failed to load sankey data' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
