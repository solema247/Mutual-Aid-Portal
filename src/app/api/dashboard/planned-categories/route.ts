import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { getUserStateAccess } from '@/lib/userStateAccess'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

type PlannedCategoriesRow = {
  date: string | null
  state: string | null
  planned_activities: unknown
}

function parseJsonArray(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw || '[]')
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

/**
 * GET /api/dashboard/planned-categories
 *
 * Data source: err_projects (portal projects only).
 *
 * - Sums planned activity cost by category from planned_activities JSONB.
 * - Uses the project-level `date` column for optional date-range filtering.
 *
 * Query params:
 * - from: ISO date (inclusive) – compared to err_projects.date
 * - to: ISO date (inclusive) – compared to err_projects.date
 *
 * Response:
 * {
 *   projectCount: number,
 *   categories: [ { category: string, total: number }, ... ]
 * }
 */
export async function GET(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const { allowedStateNames } = await getUserStateAccess()
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    let query = supabase
      .from('err_projects')
      .select('date, state, planned_activities, source')
      .in('status', ['approved', 'active', 'pending', 'completed'])

    // Restrict to portal projects (planned_activities JSONB lives there)
    query = query.eq('source', 'mutual_aid_portal')

    if (allowedStateNames !== null && allowedStateNames.length > 0) {
      query = query.in('state', allowedStateNames)
    }
    if (from) {
      query = query.gte('date', from)
    }
    if (to) {
      query = query.lte('date', to)
    }

    const { data, error } = await query
    if (error) {
      console.error('Dashboard planned-categories error:', error)
      return NextResponse.json(
        { error: 'Failed to load planned categories' },
        { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
      )
    }

    const totals = new Map<string, number>()
    let projectCount = 0

    for (const row of (data || []) as PlannedCategoriesRow[]) {
      const raw = parseJsonArray(row.planned_activities)
      if (!Array.isArray(raw) || raw.length === 0) continue
      let contributed = false

      for (const item of raw) {
        if (!item || typeof item !== 'object') continue
        const category = (item as any).category
        const costRaw = (item as any).planned_activity_cost
        const cost = costRaw != null ? Number(costRaw) : 0
        if (!Number.isFinite(cost) || cost <= 0) continue

        contributed = true
        const categoryName =
          category && typeof category === 'string' && category.trim()
            ? category.trim()
            : 'Uncategorized'

        totals.set(categoryName, (totals.get(categoryName) ?? 0) + cost)
      }
      if (contributed) projectCount += 1
    }

    const result = Array.from(totals.entries())
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total)

    return NextResponse.json({ projectCount, categories: result }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    })
  } catch (error) {
    console.error('Dashboard planned-categories error:', error)
    return NextResponse.json(
      { error: 'Failed to load planned categories' },
      { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  }
}

