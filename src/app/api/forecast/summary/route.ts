import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

type SummaryRow = { month: string | null; status: string | null; amount: number | null }

/** Normalize month to YYYY-MM so 2025-06-30 and 2025-06-01 collapse to one row per month */
function normalizeMonth(value: string | null): string {
  if (value == null || value === '') return ''
  const str = String(value).trim()
  const match = str.match(/^(\d{4})-(\d{2})(?:-\d{2})?/)
  if (match) return `${match[1]}-${match[2]}`
  return str
}

/**
 * GET /api/forecast/summary
 * Calls public.get_forecast_summary() RPC which reads partners.donor_forecasts_summary_view
 * (partners schema is not exposed in API; RPC runs with definer rights).
 * Returns array of { month, ...statusSums } for horizontal bar chart.
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()

    const { data: rows, error } = await supabase.rpc('get_forecast_summary')

    if (error) {
      console.error('Forecast summary fetch error:', error)
      return NextResponse.json(
        { error: 'Failed to load forecast summary', details: error.message },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    // RPC can return error payload (e.g. unknown chart type or exception)
    const payload = rows as unknown
    if (payload && typeof payload === 'object' && 'error' in payload && typeof (payload as { error: unknown }).error === 'string') {
      return NextResponse.json(
        { error: (payload as { error: string }).error },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const all = (Array.isArray(rows) ? rows : []) as SummaryRow[]

    // Aggregate by normalized month (YYYY-MM) and status so we get one row per calendar month
    const byMonth = new Map<string, Record<string, number>>()
    for (const row of all) {
      const month = normalizeMonth(row.month)
      const status = (row.status ?? 'unknown').toLowerCase()
      const amount = typeof row.amount === 'number' && !Number.isNaN(row.amount) ? row.amount : 0
      if (!byMonth.has(month)) byMonth.set(month, {})
      const statuses = byMonth.get(month)!
      statuses[status] = (statuses[status] ?? 0) + amount
    }

    const sortedMonths = Array.from(byMonth.keys()).filter(Boolean).sort()
    const statusSet = new Set<string>()
    byMonth.forEach((statuses) => Object.keys(statuses).forEach((s) => statusSet.add(s)))
    const statusKeys = Array.from(statusSet).sort()

    const chartData = sortedMonths.map((month) => {
      const statuses = byMonth.get(month) ?? {}
      const row: Record<string, string | number> = { month }
      for (const key of statusKeys) {
        row[key] = statuses[key] ?? 0
      }
      return row
    })

    return NextResponse.json(chartData, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    })
  } catch (err) {
    console.error('Forecast summary error:', err)
    return NextResponse.json(
      { error: 'Failed to load forecast summary' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
