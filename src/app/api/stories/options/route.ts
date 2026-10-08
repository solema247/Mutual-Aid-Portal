import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { getUserStateAccess } from '@/lib/userStateAccess'
import {
  applyGrantGridIdFilter,
  chunkGrantScopeIds,
  getUserGrantAccess,
} from '@/lib/userGrantAccess'
import { getUserRoomAccess } from '@/lib/userRoomAccess'
import { getActivityAndCategoryLists } from '@/lib/plannedActivitiesExpenses'
import {
  applyOrganizationIdFilter,
  filterRowsByDisclosureStates,
  getUserOrgScope,
  isDisclosedCoordinator,
  orgScopeBlocksAllData,
  orgScopeBlocksResourceType,
} from '@/lib/canvas/orgScope'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const MAP_STATUSES = ['approved', 'active', 'pending', 'completed'] as const
const PAGE_SIZE = 1000
/** Same as stories/cards & geojson: huge `.in()` lists exceed PostgREST URL limits. */
const REPORT_PROJECT_ID_CHUNK = 120

async function fetchAllPages(
  buildQuery: (from: number, to: number) => any
): Promise<any[]> {
  const all: any[] = []
  let from = 0
  for (;;) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1)
    if (error) throw error
    if (!data?.length) break
    all.push(...data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'other'
}

/**
 * GET /api/stories/options
 * Returns states and themes for Mutual Aid Stories Level 1 (Option C).
 * Only MAP projects. Partner scope is grant-based; other roles keep getUserStateAccess.
 */
export async function GET() {
  const t0 = Date.now()
  console.log('[stories/options] start')
  try {
    const supabase = getSupabaseRouteClient()
    const [grantAccess, roomAccess, orgScope] = await Promise.all([
      getUserGrantAccess(),
      getUserRoomAccess(),
      getUserOrgScope(),
    ])
    const emptyOptions = () =>
      NextResponse.json(
        { states: [], themes: [] },
        { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
      )
    if (orgScopeBlocksAllData(orgScope) || orgScopeBlocksResourceType(orgScope, 'f5')) {
      return emptyOptions()
    }
    if (roomAccess.mode === 'none') return emptyOptions()
    if (
      !isDisclosedCoordinator(orgScope) &&
      roomAccess.mode !== 'room' &&
      grantAccess.mode === 'none'
    ) {
      return emptyOptions()
    }

    const projectSelect = 'id, organization_id, state, planned_activities'
    let projects: {
      id: string
      organization_id?: string | null
      state?: string | null
      planned_activities?: unknown
    }[] = []

    if (roomAccess.mode === 'room') {
      // Base ERR: emergency_room_id only (never state scope)
      let projectsQuery = supabase
        .from('err_projects')
        .select(projectSelect)
        .eq('source', 'mutual_aid_portal')
        .in('status', MAP_STATUSES)
        .eq('emergency_room_id', roomAccess.emergencyRoomId)
      projectsQuery = applyOrganizationIdFilter(
        projectsQuery,
        orgScope,
        'organization_id',
        'f5'
      )
      const { data, error: projectsError } = await projectsQuery
      if (projectsError) {
        console.error('Stories options projects error:', projectsError)
        return NextResponse.json(
          { error: 'Failed to load stories options' },
          { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
        )
      }
      projects = data || []
    } else if (grantAccess.mode === 'partner' && !isDisclosedCoordinator(orgScope)) {
      console.log('[stories/options] partner grant scope', Date.now() - t0, 'ms')
      for (const batch of chunkGrantScopeIds(grantAccess.grantGridIds)) {
        let projectsQuery = supabase
          .from('err_projects')
          .select(projectSelect)
          .eq('source', 'mutual_aid_portal')
          .in('status', MAP_STATUSES)
        projectsQuery = applyGrantGridIdFilter(projectsQuery, {
          ...grantAccess,
          grantGridIds: batch,
        })
        projectsQuery = applyOrganizationIdFilter(
          projectsQuery,
          orgScope,
          'organization_id',
          'f5'
        )
        const { data, error: projectsError } = await projectsQuery
        if (projectsError) {
          console.error('Stories options projects error:', projectsError)
          return NextResponse.json(
            { error: 'Failed to load stories options' },
            { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
          )
        }
        if (data?.length) projects.push(...data)
      }
    } else {
      const { allowedStateNames } = await getUserStateAccess()
      console.log('[stories/options] getUserStateAccess', Date.now() - t0, 'ms')
      try {
        projects = await fetchAllPages((from, to) => {
          let projectsQuery = supabase
            .from('err_projects')
            .select(projectSelect)
            .eq('source', 'mutual_aid_portal')
            .in('status', MAP_STATUSES)
            .order('id', { ascending: true })
            .range(from, to)

          projectsQuery = applyOrganizationIdFilter(
            projectsQuery,
            orgScope,
            'organization_id',
            'f5'
          )
          if (
            !isDisclosedCoordinator(orgScope) &&
            allowedStateNames !== null &&
            allowedStateNames.length > 0
          ) {
            projectsQuery = projectsQuery.in('state', allowedStateNames)
          }
          return projectsQuery
        })
      } catch (projectsError) {
        console.error('Stories options projects error:', projectsError)
        return NextResponse.json(
          { error: 'Failed to load stories options' },
          { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
        )
      }
    }

    if (isDisclosedCoordinator(orgScope)) {
      projects = filterRowsByDisclosureStates(projects, orgScope, 'f5')
    }

    console.log('[stories/options] projects query', Date.now() - t0, 'ms', projects.length, 'rows')

    const projectIds = projects.map((p) => p.id).filter(Boolean)
    if (projectIds.length === 0) {
      return NextResponse.json(
        { states: [], themes: [] },
        { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
      )
    }

    // Only projects that have at least one F5 report (story cards require F1 + F5)
    const reportRows: { project_id?: string }[] = []
    for (const chunk of chunkArray(projectIds, REPORT_PROJECT_ID_CHUNK)) {
      try {
        const rows = await fetchAllPages((from, to) =>
          supabase
            .from('err_program_report')
            .select('project_id')
            .in('project_id', chunk)
            .order('id', { ascending: true })
            .range(from, to)
        )
        reportRows.push(...rows)
      } catch (reportErr) {
        console.error('[stories/options] reports error:', reportErr)
        return NextResponse.json(
          { error: 'Failed to load stories options' },
          { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
        )
      }
    }
    const projectIdsWithF5 = new Set<string>()
    const reportsByProject = new Map<string, number>()
    for (const r of reportRows || []) {
      const pid = (r as any).project_id
      if (pid) {
        projectIdsWithF5.add(pid)
        reportsByProject.set(pid, (reportsByProject.get(pid) || 0) + 1)
      }
    }
    const projectsWithF5 = projects.filter((p: any) => projectIdsWithF5.has(p.id))

    // States: distinct state, project_count (with F5 only), report_count
    const stateMap = new Map<string, { project_count: number; report_count: number }>()
    for (const p of projectsWithF5) {
      const state = (p as any).state
      if (!state || typeof state !== 'string') continue
      const name = state.trim()
      if (!name) continue
      const prev = stateMap.get(name) ?? { project_count: 0, report_count: 0 }
      stateMap.set(name, {
        project_count: prev.project_count + 1,
        report_count: prev.report_count + (reportsByProject.get((p as any).id) || 0),
      })
    }
    const states = Array.from(stateMap.entries())
      .map(([state, counts]) => ({ state, ...counts }))
      .sort((a, b) => a.state.localeCompare(b.state))

    // Themes: from planned_activities category only; only projects with F5
    const themeSlugToLabel = new Map<string, string>()
    const themeProjectIds = new Map<string, Set<string>>()
    for (const p of projectsWithF5) {
      const { expense_category_list } = getActivityAndCategoryLists(
        (p as any).planned_activities,
        null
      )
      const labels = new Set<string>(expense_category_list)
      for (const label of labels) {
        if (!label || !String(label).trim()) continue
        const trimmed = String(label).trim()
        const slug = slugify(trimmed)
        themeSlugToLabel.set(slug, trimmed)
        if (!themeProjectIds.has(slug)) themeProjectIds.set(slug, new Set())
        themeProjectIds.get(slug)!.add((p as any).id)
      }
    }
    const themes = Array.from(themeProjectIds.entries())
      .map(([id, ids]) => ({
        id,
        label: themeSlugToLabel.get(id) ?? id,
        project_count: ids.size,
      }))
      .filter((t) => t.label)
      .sort((a, b) => a.label.localeCompare(b.label))

    console.log('[stories/options] total', Date.now() - t0, 'ms', 'states:', states.length, 'themes:', themes.length)
    return NextResponse.json(
      { states, themes },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  } catch (e) {
    console.error('[stories/options] error', Date.now() - t0, 'ms', e)
    return NextResponse.json(
      { error: 'Failed to load stories options' },
      { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  }
}
