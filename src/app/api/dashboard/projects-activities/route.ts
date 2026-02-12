import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const MAX_SERIES = 10

async function fetchAllRows<T>(
  supabase: ReturnType<typeof getSupabaseRouteClient>,
  viewName: string,
  select: string,
  filter?: (query: ReturnType<ReturnType<typeof getSupabaseRouteClient>['from']>) => ReturnType<ReturnType<typeof getSupabaseRouteClient>['from']>
): Promise<T[]> {
  const allRows: T[] = []
  let from = 0
  const pageSize = 1000

  while (true) {
    let query = supabase.from(viewName).select(select).range(from, from + pageSize - 1)
    if (filter) {
      query = filter(query)
    }
    const { data, error } = await query
    if (error) throw error
    if (!data || data.length === 0) break
    allRows.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return allRows
}

export type ProjectsActivitiesRow = {
  date_transfer: string | null
  project_donor: string | null
  usd: number | null
}

function toDateKey(d: string | null): string | null {
  if (d == null || String(d).trim() === '') return null
  const s = String(d).trim()
  const parsed = new Date(s)
  return Number.isFinite(parsed.getTime()) ? s : null
}

/**
 * GET /api/dashboard/projects-activities
 * Fetches from projects_all_activities_view (date_transfer, project_donor, usd).
 * Returns data for stacked cumulative area chart: X = time (date_transfer), Y = usd,
 * one series per project_donor (top 10 by total usd). Values are cumulative over time.
 */
export async function GET() {
  try {
    const supabase = getSupabaseRouteClient()

    const rows = await fetchAllRows<ProjectsActivitiesRow>(
      supabase,
      'projects_all_activities_view',
      'date_transfer, project_donor, usd'
    )

    // Aggregate by (date, donor) -> sum(usd)
    const byDateDonor = new Map<string, Map<string, number>>()
    const donorTotals = new Map<string, number>()

    for (const row of rows ?? []) {
      const dateKey = toDateKey(row.date_transfer)
      const donor = row.project_donor?.trim() ?? ''
      if (!dateKey || !donor) continue
      const value = row.usd != null ? Number(row.usd) : 0
      if (!Number.isFinite(value) || value <= 0) continue

      if (!byDateDonor.has(dateKey)) byDateDonor.set(dateKey, new Map())
      const donorMap = byDateDonor.get(dateKey)!
      donorMap.set(donor, (donorMap.get(donor) ?? 0) + value)
      donorTotals.set(donor, (donorTotals.get(donor) ?? 0) + value)
    }

    const sortedDates = Array.from(byDateDonor.keys()).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    )
    const topDonors = Array.from(donorTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_SERIES)
      .map(([d]) => d)

    // Cumulative per donor: at each date, Y = amount accumulated up to that date.
    // e.g. period values 0, 10, 10 → line 0, 10, 20; 10, 0, 0 → line 10, 10, 10 (flat after first period).
    const cumulativeByDonor = new Map<string, Map<string, number>>()
    for (const donor of topDonors) {
      let cum = 0
      const map = new Map<string, number>()
      for (const date of sortedDates) {
        const inc = byDateDonor.get(date)?.get(donor) ?? 0
        cum += inc
        map.set(date, cum)
      }
      cumulativeByDonor.set(donor, map)
    }

    const chartData = sortedDates.map((date) => {
      const point: Record<string, string | number> = { date_transfer: date }
      for (const donor of topDonors) {
        point[donor] = cumulativeByDonor.get(donor)?.get(date) ?? 0
      }
      return point
    })

    return NextResponse.json(
      { chartData, series: topDonors },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  } catch (error) {
    console.error('Dashboard projects-activities error:', error)
    return NextResponse.json(
      { error: 'Failed to load projects activities' },
      { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  }
}
