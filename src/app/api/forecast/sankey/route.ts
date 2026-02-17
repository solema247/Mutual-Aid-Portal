import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

type SourceTransferStateRow = {
  source: string | null
  transfer_method: string | null
  state_name: string | null
  amount: number | null
}

/**
 * GET /api/forecast/sankey
 * Calls get_forecast_summary('org_transfer_state') and returns Recharts Sankey format:
 * { nodes: [{ name }], links: [{ source, target, value }] }
 * Flow: source (col 0) -> transfer_method (col 1) -> state_name (col 2).
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()

    const { data: rows, error } = await supabase.rpc('get_forecast_summary', {
      p_chart_type: 'org_transfer_state',
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

    const all = (Array.isArray(rows) ? rows : []) as SourceTransferStateRow[]

    const sources = new Map<string, number>()
    const transferMethods = new Map<string, number>()
    const stateNames = new Map<string, number>()
    const linksSourceToMethod = new Map<string, number>()
    const linksMethodToState = new Map<string, number>()

    for (const row of all) {
      const src = String(row.source ?? '').trim() || 'Unknown'
      const method = String(row.transfer_method ?? '').trim() || 'Unknown'
      const state = String(row.state_name ?? '').trim() || 'Unknown'
      const amount = typeof row.amount === 'number' && !Number.isNaN(row.amount) ? row.amount : 0
      if (amount <= 0) continue
      if (!sources.has(src)) sources.set(src, sources.size)
      if (!transferMethods.has(method)) transferMethods.set(method, transferMethods.size)
      if (!stateNames.has(state)) stateNames.set(state, stateNames.size)
      const keySM = `${src}|${method}`
      const keyMS = `${method}|${state}`
      linksSourceToMethod.set(keySM, (linksSourceToMethod.get(keySM) ?? 0) + amount)
      linksMethodToState.set(keyMS, (linksMethodToState.get(keyMS) ?? 0) + amount)
    }

    const sourceList = Array.from(sources.keys())
    const methodList = Array.from(transferMethods.keys())
    const stateList = Array.from(stateNames.keys())
    const nSource = sourceList.length
    const nMethod = methodList.length
    const nodes = [
      ...sourceList.map((name) => ({ name })),
      ...methodList.map((name) => ({ name })),
      ...stateList.map((name) => ({ name })),
    ]
    const links: { source: number; target: number; value: number }[] = []
    for (const [key, value] of linksSourceToMethod.entries()) {
      const [src, method] = key.split('|')
      const sourceIdx = sources.get(src) ?? 0
      const target = nSource + (transferMethods.get(method) ?? 0)
      links.push({ source: sourceIdx, target, value })
    }
    for (const [key, value] of linksMethodToState.entries()) {
      const [method, state] = key.split('|')
      const sourceIdx = nSource + (transferMethods.get(method) ?? 0)
      const target = nSource + nMethod + (stateNames.get(state) ?? 0)
      links.push({ source: sourceIdx, target, value })
    }

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
