import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { getUserStateAccess } from '@/lib/userStateAccess'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const MAP_STATUSES = ['approved', 'active', 'pending', 'completed'] as const

/** API state name -> GeoJSON state name (for centroid lookup) */
const API_STATE_TO_GEO: Record<string, string> = {
  Gezira: 'Al Jazirah',
}

function getGeoStateName(apiState: string): string {
  return API_STATE_TO_GEO[apiState] ?? apiState
}

/** Compute centroid [lng, lat] from polygon ring (first ring only, exclude closing vertex). */
function polygonCentroid(ring: [number, number][]): [number, number] {
  const pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring.slice(0, -1)
    : ring
  if (pts.length === 0) return [0, 0]
  const lng = pts.reduce((s, c) => s + c[0], 0) / pts.length
  const lat = pts.reduce((s, c) => s + c[1], 0) / pts.length
  return [lng, lat]
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

function sumExpensesUsd(expenses: unknown): number {
  const arr = parseJsonArray(expenses)
  return arr.reduce((s: number, e: any) => s + (Number(e?.total_cost) || 0), 0)
}

function getActivityToCategory(plannedActivities: unknown): Map<string, string> {
  const planned = parseJsonArray(plannedActivities)
  const map = new Map<string, string>()
  for (const item of planned) {
    const activity = item?.activity ?? item?.Activity
    const category = item?.category ?? item?.Category
    if (activity != null && String(activity).trim() && category != null && String(category).trim())
      map.set(String(activity).trim(), String(category).trim())
  }
  return map
}

function getCategorySpend(
  expenses: unknown,
  plannedActivities: unknown
): Map<string, number> {
  const exp = parseJsonArray(expenses)
  const activityToCategory = getActivityToCategory(plannedActivities)
  const byCategory = new Map<string, number>()
  for (const e of exp) {
    const cost = Number(e?.total_cost) || 0
    if (cost <= 0) continue
    const category =
      (e?.category ?? e?.Category)
        ?.trim?.() ||
      activityToCategory.get(String(e?.planned_activity ?? e?.activity ?? '').trim()) ||
      'Other'
    const key = category.trim() || 'Other'
    byCategory.set(key, (byCategory.get(key) ?? 0) + cost)
  }
  return byCategory
}

function getPrimaryCategoryAndUsd(
  expenses: unknown,
  plannedActivities: unknown
): { primary_category: string; total_usd: number } {
  const byCat = getCategorySpend(expenses, plannedActivities)
  const total_usd = [...byCat.values()].reduce((s, v) => s + v, 0)
  const primary_category =
    byCat.size > 0
      ? [...byCat.entries()].sort((a, b) => b[1] - a[1])[0][0]
      : 'Other'
  return { primary_category, total_usd }
}

/**
 * GET /api/stories/geojson
 * Returns a GeoJSON FeatureCollection of Point features for each MAP project with F5.
 * Coordinates use state centroids (from sudan-states.json) with small jitter so clusters render.
 */
export async function GET() {
  const t0 = Date.now()
  console.log('[stories/geojson] start')
  try {
    const supabase = getSupabaseRouteClient()
    const { allowedStateNames } = await getUserStateAccess()
    console.log('[stories/geojson] getUserStateAccess', Date.now() - t0, 'ms')

    const geoPath = join(process.cwd(), 'public', 'geo', 'sudan-states.json')
    const geo = JSON.parse(readFileSync(geoPath, 'utf-8')) as {
      type: string
      features: Array<{
        type: string
        properties: { name?: string }
        geometry: { type: string; coordinates: number[][][] }
      }>
    }

    const stateCentroids = new Map<string, [number, number]>()
    for (const f of geo.features || []) {
      const name = f.properties?.name
      if (!name || f.geometry?.type !== 'Polygon' || !f.geometry.coordinates?.[0]) continue
      const ring = f.geometry.coordinates[0] as [number, number][]
      const centroid = polygonCentroid(ring)
      stateCentroids.set(name, centroid)
    }

    let projectsQuery = supabase
      .from('err_projects')
      .select('id, state, locality, project_name, planned_activities, expenses')
      .eq('source', 'mutual_aid_portal')
      .in('status', MAP_STATUSES)

    if (allowedStateNames !== null && allowedStateNames.length > 0) {
      projectsQuery = projectsQuery.in('state', allowedStateNames)
    }

    const { data: projects, error: projectsError } = await projectsQuery
    console.log('[stories/geojson] projects query', Date.now() - t0, 'ms', (projects?.length ?? 0), 'rows')
    if (projectsError) {
      console.error('[stories/geojson] projects error:', projectsError)
      return NextResponse.json(
        { error: 'Failed to load projects' },
        { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
      )
    }

    const projectIds = (projects || []).map((p: any) => p.id).filter(Boolean)
    if (projectIds.length === 0) {
      return NextResponse.json(
        { type: 'FeatureCollection', features: [] },
        { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
      )
    }

    const { data: reportRows } = await supabase
      .from('err_program_report')
      .select('project_id')
      .in('project_id', projectIds)
    console.log('[stories/geojson] report rows', Date.now() - t0, 'ms', (reportRows?.length ?? 0), 'rows')
    const projectIdsWithF5 = new Set<string>()
    for (const r of reportRows || []) {
      const pid = (r as any).project_id
      if (pid) projectIdsWithF5.add(pid)
    }

    const projectsWithF5 = (projects || []).filter((p: any) => projectIdsWithF5.has(p.id))
    const jitter = 0.04 // ~4 km spread so points don't stack exactly

    function seededOffset(id: string): [number, number] {
      let h = 0
      for (let i = 0; i < id.length; i++) {
        h = (h * 31 + id.charCodeAt(i)) >>> 0
      }
      const u = (h % 1000) / 1000
      const v = ((h >> 10) % 1000) / 1000
      return [(u - 0.5) * jitter, (v - 0.5) * jitter]
    }

    type Props = {
      project_id: string
      project_name: string | null
      state: string | null
      locality: string | null
      primary_category: string
      total_usd: number
    }
    const features: GeoJSON.Feature<GeoJSON.Point, Props>[] = []
    for (const p of projectsWithF5) {
      const state = (p as any).state?.trim() || null
      const geoName = state ? getGeoStateName(state) : null
      const center = geoName ? stateCentroids.get(geoName) : null
      if (!center) continue
      const { primary_category, total_usd } = getPrimaryCategoryAndUsd(
        (p as any).expenses,
        (p as any).planned_activities
      )
      const [lng, lat] = center
      const [dLng, dLat] = seededOffset((p as any).id)
      const jitterLng = lng + dLng
      const jitterLat = lat + dLat
      features.push({
        type: 'Feature',
        properties: {
          project_id: (p as any).id,
          project_name: (p as any).project_name ?? null,
          state,
          locality: (p as any).locality?.trim() || null,
          primary_category,
          total_usd,
        },
        geometry: {
          type: 'Point',
          coordinates: [jitterLng, jitterLat],
        },
      })
    }

    const featureCollection: GeoJSON.FeatureCollection<GeoJSON.Point> = {
      type: 'FeatureCollection',
      features,
    }

    console.log('[stories/geojson] total', Date.now() - t0, 'ms', 'features:', features.length)
    return NextResponse.json(featureCollection, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    })
  } catch (e) {
    console.error('[stories/geojson] error', Date.now() - t0, 'ms', e)
    return NextResponse.json(
      { error: 'Failed to build GeoJSON' },
      { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  }
}
