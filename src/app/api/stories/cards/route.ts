import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { getUserStateAccess } from '@/lib/userStateAccess'
import { getActivityAndCategoryLists } from '@/lib/plannedActivitiesExpenses'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const MAP_STATUSES = ['approved', 'active', 'pending', 'completed'] as const
const SNIPPET_LENGTH = 150

function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'other'
}

function snippet(text: string | null | undefined): string {
  if (text == null || typeof text !== 'string') return ''
  const t = text.trim()
  if (t.length <= SNIPPET_LENGTH) return t
  return t.slice(0, SNIPPET_LENGTH).trim() + '…'
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

/** Build a map from activity name to category from planned_activities. */
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

/** Sum expenses by category; use planned_activities to map activity -> category when expense has no category. */
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

/**
 * Spend diversity: 1 - Herfindahl index.
 * 0 = all spend in one category (focused), 1 = perfectly even across categories (spread out).
 */
function getSpendDiversity(byCategory: Map<string, number>): number {
  if (byCategory.size === 0) return 0
  const total = [...byCategory.values()].reduce((s, v) => s + v, 0)
  if (total <= 0) return 0
  if (byCategory.size === 1) return 0
  let herfindahl = 0
  for (const usd of byCategory.values()) {
    const share = usd / total
    herfindahl += share * share
  }
  return Math.min(1, Math.max(0, 1 - herfindahl))
}

/** Labels for expenses that resolved to "Other" (activity name or planned_activity_other), for display. */
function getOtherLabels(
  expenses: unknown,
  plannedActivities: unknown
): string[] {
  const exp = parseJsonArray(expenses)
  const activityToCategory = getActivityToCategory(plannedActivities)
  const labels: string[] = []
  for (const e of exp) {
    const cost = Number(e?.total_cost) || 0
    if (cost <= 0) continue
    const category =
      (e?.category ?? e?.Category)
        ?.trim?.() ||
      activityToCategory.get(String(e?.planned_activity ?? e?.activity ?? '').trim()) ||
      'Other'
    const key = category.trim() || 'Other'
    if (key !== 'Other') continue
    const activity = String(e?.planned_activity ?? e?.activity ?? '').trim()
    const otherText = String(e?.planned_activity_other ?? '').trim()
    const isOtherActivity =
      !activity || activity.toLowerCase().includes('other') || activity.includes('أخرى')
    const label = isOtherActivity && otherText ? otherText : activity || 'Other'
    if (label && label !== 'Other') labels.push(label)
  }
  return labels
}

/**
 * GET /api/stories/cards?state=Kassala | ?theme=community-kitchen
 * Returns story cards for Level 1. Requires state or theme; respects getUserStateAccess.
 */
export async function GET(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const { allowedStateNames } = await getUserStateAccess()
    const { searchParams } = new URL(request.url)
    const stateParam = searchParams.get('state')?.trim() || null
    const themeParam = searchParams.get('theme')?.trim() || null

    if (!stateParam && !themeParam) {
      return NextResponse.json(
        { summary: null, cards: [] },
        { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
      )
    }

    let projectsQuery = supabase
      .from('err_projects')
      .select('id, state, locality, project_name, project_objectives, planned_activities, estimated_beneficiaries, expenses')
      .eq('source', 'mutual_aid_portal')
      .in('status', MAP_STATUSES)

    if (allowedStateNames !== null && allowedStateNames.length > 0) {
      projectsQuery = projectsQuery.in('state', allowedStateNames)
    }
    if (stateParam) {
      projectsQuery = projectsQuery.eq('state', stateParam)
    }

    const { data: projects, error: projectsError } = await projectsQuery
    if (projectsError) {
      console.error('Stories cards projects error', projectsError)
      return NextResponse.json(
        { error: 'Failed to load story cards' },
        { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
      )
    }

    let filtered = (projects || []) as any[]
    if (themeParam) {
      filtered = filtered.filter((p) => {
        const { expense_category_list } = getActivityAndCategoryLists(
          p.planned_activities,
          null
        )
        return expense_category_list.some((label) => slugify(String(label).trim()) === themeParam)
      })
    }

    if (filtered.length === 0) {
      return NextResponse.json(
        { summary: null, cards: [] },
        { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
      )
    }

    const projectIds = filtered.map((p) => p.id)

    // Latest F5 report per project (by created_at desc)
    const { data: reports, error: reportsError } = await supabase
      .from('err_program_report')
      .select('id, project_id, report_date, reporting_person, positive_changes, created_at')
      .in('project_id', projectIds)
      .order('created_at', { ascending: false })

    if (reportsError) {
      console.error('Stories cards reports error', reportsError)
      return NextResponse.json(
        { error: 'Failed to load story cards' },
        { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
      )
    }

    const latestReportByProject = new Map<string, any>()
    for (const r of reports || []) {
      const pid = (r as any).project_id
      if (pid && !latestReportByProject.has(pid)) latestReportByProject.set(pid, r)
    }

    // Only show story cards for projects that have F5 (F1 + F5 available)
    const filteredWithF5 = filtered.filter((p) => latestReportByProject.has(p.id))

    const reportIds = Array.from(latestReportByProject.values()).map((r: any) => r.id)
    let reachByReport: Record<string, { individuals: number; households: number }> = {}
    if (reportIds.length > 0) {
      const { data: reachRows } = await supabase
        .from('err_program_reach')
        .select('report_id, individual_count, household_count')
        .in('report_id', reportIds)
      for (const row of reachRows || []) {
        const rid = (row as any).report_id
        const ind = (row as any).individual_count
        const hh = (row as any).household_count
        const individuals = ind != null && Number.isFinite(Number(ind)) ? Number(ind) : 0
        const households = hh != null && Number.isFinite(Number(hh)) ? Number(hh) : 0
        if (!reachByReport[rid]) reachByReport[rid] = { individuals: 0, households: 0 }
        reachByReport[rid].individuals += individuals
        reachByReport[rid].households += households
      }
    }

    const cards = filteredWithF5.map((p) => {
      const report = latestReportByProject.get(p.id)
      const reportId = report?.id
      const reach = reportId ? reachByReport[reportId] : null
      const beneficiaries_count =
        (reach?.individuals ?? 0) > 0
          ? reach!.individuals
          : p.estimated_beneficiaries != null && Number.isFinite(Number(p.estimated_beneficiaries))
            ? Number(p.estimated_beneficiaries)
            : null
      const { expense_category_list } = getActivityAndCategoryLists(
        p.planned_activities,
        null
      )
      const theme_labels = Array.from(new Set<string>(expense_category_list)).filter(Boolean)
      const projectByCat = getCategorySpend(p.expenses, p.planned_activities)
      const primary_category =
        projectByCat.size > 0
          ? [...projectByCat.entries()].sort((a, b) => b[1] - a[1])[0][0]
          : theme_labels[0] ?? 'Other'
      const spend_diversity = getSpendDiversity(projectByCat)

      return {
        project_id: p.id,
        project_name: p.project_name ?? null,
        state: p.state ?? null,
        locality: p.locality ?? null,
        objectives_snippet: snippet(p.project_objectives),
        positive_changes_snippet: report ? snippet(report.positive_changes) : '',
        report_date: report?.report_date ?? null, // err_program_report.report_date (used for scatter X axis)
        reporting_person: report?.reporting_person ?? null,
        beneficiaries_count,
        theme_labels,
        primary_category,
        spend_diversity,
      }
    })

    // Summary for story-telly intro (only projects with F5)
    const localities = Array.from(
      new Set(filteredWithF5.map((p) => (p.locality || '').trim()).filter(Boolean))
    ).sort()
    const totalBeneficiaries = cards.reduce((sum, c) => sum + (c.beneficiaries_count ?? 0), 0)
    let totalHouseholds = 0
    for (const p of filteredWithF5) {
      const report = latestReportByProject.get(p.id)
      if (report?.id && reachByReport[report.id])
        totalHouseholds += reachByReport[report.id].households
    }
    const projectIdsWithF5Set = new Set(filteredWithF5.map((p) => p.id))
    const total_reports = (reports || []).filter((r: any) =>
      projectIdsWithF5Set.has(r.project_id)
    ).length
    const total_usd = filteredWithF5.reduce((sum, p) => sum + sumExpensesUsd(p.expenses), 0)
    const categoryToUsd = new Map<string, number>()
    const otherLabelsCollect: string[] = []
    for (const p of filteredWithF5) {
      const projectByCat = getCategorySpend(p.expenses, p.planned_activities)
      for (const [cat, usd] of projectByCat) {
        categoryToUsd.set(cat, (categoryToUsd.get(cat) ?? 0) + usd)
      }
      otherLabelsCollect.push(...getOtherLabels(p.expenses, p.planned_activities))
    }
    const otherSubcategories = Array.from(new Set(otherLabelsCollect))
      .filter(Boolean)
      .slice(0, 8)
    const sorted = Array.from(categoryToUsd.entries())
      .map(([category, total_usd]) => ({ category, total_usd }))
      .sort((a, b) => b.total_usd - a.total_usd)
    const withOtherLast = [
      ...sorted.filter((x) => x.category !== 'Other'),
      ...sorted.filter((x) => x.category === 'Other'),
    ].slice(0, 5)
    const top_categories = withOtherLast.map((item) =>
      item.category === 'Other' && otherSubcategories.length > 0
        ? { ...item, other_subcategories: otherSubcategories }
        : item
    )
    const summary = {
      total_projects: filteredWithF5.length,
      total_reports,
      total_beneficiaries: totalBeneficiaries,
      total_households: totalHouseholds,
      total_usd,
      locality_count: localities.length,
      localities,
      top_categories,
    }

    return NextResponse.json(
      { summary, cards },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  } catch (e) {
    console.error('Stories cards error', e)
    return NextResponse.json(
      { error: 'Failed to load story cards' },
      { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  }
}
