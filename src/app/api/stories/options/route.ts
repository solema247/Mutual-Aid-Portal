import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { getUserStateAccess } from '@/lib/userStateAccess'
import { getActivityAndCategoryLists } from '@/lib/plannedActivitiesExpenses'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const MAP_STATUSES = ['approved', 'active', 'pending', 'completed'] as const

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
 * Only MAP projects; respects getUserStateAccess.
 */
export async function GET() {
  const t0 = Date.now()
  console.log('[stories/options] start')
  try {
    const supabase = getSupabaseRouteClient()
    const { allowedStateNames } = await getUserStateAccess()
    console.log('[stories/options] getUserStateAccess', Date.now() - t0, 'ms')

    let projectsQuery = supabase
      .from('err_projects')
      .select('id, state, planned_activities')
      .eq('source', 'mutual_aid_portal')
      .in('status', MAP_STATUSES)

    if (allowedStateNames !== null && allowedStateNames.length > 0) {
      projectsQuery = projectsQuery.in('state', allowedStateNames)
    }

    const { data: projects, error: projectsError } = await projectsQuery
    console.log('[stories/options] projects query', Date.now() - t0, 'ms', (projects?.length ?? 0), 'rows')
    if (projectsError) {
      console.error('Stories options projects error:', projectsError)
      return NextResponse.json(
        { error: 'Failed to load stories options' },
        { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
      )
    }

    const projectIds = (projects || []).map((p: any) => p.id).filter(Boolean)
    if (projectIds.length === 0) {
      return NextResponse.json(
        { states: [], themes: [] },
        { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
      )
    }

    // Only projects that have at least one F5 report (story cards require F1 + F5)
    const { data: reportRows } = await supabase
      .from('err_program_report')
      .select('project_id')
      .in('project_id', projectIds)
    const projectIdsWithF5 = new Set<string>()
    const reportsByProject = new Map<string, number>()
    for (const r of reportRows || []) {
      const pid = (r as any).project_id
      if (pid) {
        projectIdsWithF5.add(pid)
        reportsByProject.set(pid, (reportsByProject.get(pid) || 0) + 1)
      }
    }
    const projectsWithF5 = (projects || []).filter((p: any) => projectIdsWithF5.has(p.id))

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
