import { NextResponse } from 'next/server'
import type { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { requirePermission } from '@/lib/requirePermission'
import { resolveF4F5ListScope } from './listScope'
import {
  needsGrantMultiSelectForF4List,
  needsPaymentBeforePaginateF4List,
  needsPlanBeforePaginateF4List,
  parseF4ListQueryFromApiUrl,
} from './listQueryParamsCore'
import {
  buildPageProjectById,
  computeMouIdsForProjects,
  EMPTY_PAYMENT_MAPS,
  enrichF4ListPaymentFields,
  getPageProjectIdsForPayment,
} from './paymentSummary'
import {
  applyF4ListFilters,
  applyF4NonGrantMultiSelectListFilters,
  applyGrantMultiSelectListFilters,
  buildFilterMeta,
  paginateRows,
  paginationMeta,
  sortF4Rows,
} from './listFilterSort'
import {
  baseRoomLabel,
  buildGrantFilterMetaForProjects,
  chunkIds,
  computeF4ReportStatus,
  donorLabel,
  EMPTY_GRANT_STRING_MAP,
  computeF4PlanNeeded,
  computeF4PlanNeededForPageRows,
  enrichF4ListPlanFinancialFields,
  enrichPortalRowGrantFields,
  fetchPlanJsonForProjects,
  fetchProjectIdsInStateScope,
  grantAmountUsd,
  grantCallIdForProject,
  grantNameForProject,
  isEligibleWithoutF4Report,
  loadGrantCallIdMap,
  portalProjectsForListRows,
  applyGrantCallIdToRows,
  uniqueGrantGridIdsFromProjects,
} from './listCommon'
import { loadF4AttachmentCounts, loadMouPaymentMaps } from './listEnrichment'
import { fetchScopedProjectsCached } from './scopedProjectsCache'
import { computeF4ListSummary, EMPTY_REPORTING_LIST_SUMMARY } from './listSummary'

const F4_SUMMARY_SELECT = `
  id,
  project_id,
  activities_raw_import_id,
  report_date,
  total_grant,
  total_expenses,
  remainder,
  created_at,
  review_status,
  review_comment,
  reviewed_at
`

export type F4ListRow = Record<string, unknown>

async function fetchF4PortalSummaries(
  supabase: ReturnType<typeof getSupabaseRouteClient>,
  scope: Awaited<ReturnType<typeof resolveF4F5ListScope>>,
  scopedProjectIds: string[]
): Promise<Record<string, unknown>[]> {
  if (scope.grantAccess.mode === 'partner' || scope.emergencyRoomId) {
    if (scopedProjectIds.length === 0) return []
    const out: Record<string, unknown>[] = []
    for (const batch of chunkIds(scopedProjectIds)) {
      const { data, error } = await supabase
        .from('err_summary')
        .select(F4_SUMMARY_SELECT)
        .is('activities_raw_import_id', null)
        .in('project_id', batch)
        .order('created_at', { ascending: false })
      if (error) throw error
      out.push(...((data || []) as unknown as Record<string, unknown>[]))
    }
    return out
  }

  if (scope.useStateScope && scope.allowedStateNames !== null) {
    if (scope.allowedStateNames.length === 0) return []
    const projectIds = await fetchProjectIdsInStateScope(supabase, scope.allowedStateNames)
    if (projectIds.length === 0) return []
    const out: Record<string, unknown>[] = []
    for (const batch of chunkIds(projectIds)) {
      const { data, error } = await supabase
        .from('err_summary')
        .select(F4_SUMMARY_SELECT)
        .is('activities_raw_import_id', null)
        .in('project_id', batch)
        .order('created_at', { ascending: false })
      if (error) throw error
      out.push(...((data || []) as unknown as Record<string, unknown>[]))
    }
    return out
  }

  const { data, error } = await supabase
    .from('err_summary')
    .select(F4_SUMMARY_SELECT)
    .is('activities_raw_import_id', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []) as unknown as Record<string, unknown>[]
}

async function ensureProjectsForSummaries(
  supabase: ReturnType<typeof getSupabaseRouteClient>,
  projectById: Map<string, Record<string, unknown>>,
  summaries: Record<string, unknown>[],
  scope: Awaited<ReturnType<typeof resolveF4F5ListScope>>
) {
  const missing: string[] = []
  for (const s of summaries) {
    const pid = s.project_id ? String(s.project_id) : ''
    if (pid && !projectById.has(pid)) missing.push(pid)
  }
  if (!missing.length) return

  for (const batch of chunkIds(missing)) {
    const { data, error } = await supabase
      .from('err_projects')
      .select(
        `id, err_id, state, grant_id, grant_serial_id, donor_id, mou_id, date_transfer, source, status, funding_status, f4_status, f5_status, grant_grid_id, emergency_room_id, emergency_rooms ( id, name, name_ar, err_code, type ), donors ( name, short_name )`
      )
      .in('id', batch)
    if (error) throw error
    for (const row of data || []) {
      const p = row as Record<string, unknown>
      const id = String(p.id)
      if (!projectInScope(p, scope)) continue
      projectById.set(id, p)
    }
  }
}

function projectInScope(project: Record<string, unknown>, scope: Awaited<ReturnType<typeof resolveF4F5ListScope>>): boolean {
  if (scope.grantAccess.mode === 'partner') {
    const gridId = project.grant_grid_id != null ? String(project.grant_grid_id) : ''
    return gridId !== '' && scope.grantAccess.grantGridIds.includes(gridId)
  }
  if (scope.emergencyRoomId) {
    return String(project.emergency_room_id) === scope.emergencyRoomId
  }
  if (scope.useStateScope && scope.allowedStateNames !== null && scope.allowedStateNames.length > 0) {
    const st = project.state != null ? String(project.state) : ''
    return st !== '' && scope.allowedStateNames.includes(st)
  }
  return true
}

function projectRowFields(
  project: Record<string, unknown>,
  projectId: string,
  gridById: Map<string, string>,
  gridByGrantKey: Map<string, string>,
  gridGrantIdByUuid: Map<string, string>,
  transferDateByProject: Record<string, string>,
  rateByProject: Record<string, number>,
  planUsd: number
) {
  const rate = rateByProject[projectId] ?? null
  const paymentDate = transferDateByProject[projectId] || (project.date_transfer as string | null) || null
  const amountSdg = rate != null && planUsd > 0 ? Math.round(planUsd * rate) : null
  return {
    base_room_name: baseRoomLabel(project),
    err_id: project.err_id ?? null,
    grant_serial_id: project.grant_serial_id ?? project.grant_id ?? null,
    grant_id: project.grant_id ?? null,
    grant_call_id: grantCallIdForProject(project, gridGrantIdByUuid),
    grant_name: grantNameForProject(project, gridById, gridByGrantKey),
    state: project.state ?? null,
    donor: donorLabel(project),
    payment_date: paymentDate,
    amount_sdg: amountSdg,
    exchange_rate: rate,
  }
}

export async function handleF4ListGet(request: Request) {
  const perm = await requirePermission('f4_f5_view_page')
  if (perm instanceof NextResponse) return perm

  const scope = await resolveF4F5ListScope()
  const query = parseF4ListQueryFromApiUrl(new URL(request.url).searchParams)

  const emptyBody = {
    data: [] as F4ListRow[],
    pagination: paginationMeta(0, query.page, query.pageSize),
    sort: { sortBy: query.sortBy, sortDir: query.sortDir },
    filterMeta: { baseRooms: [] as string[], states: [] as string[], grants: [] as { value: string; label: string }[] },
    summary: EMPTY_REPORTING_LIST_SUMMARY,
  }

  if (scope.isEmpty) {
    return NextResponse.json(emptyBody)
  }

  try {
    const supabase = (await import('@/lib/supabaseRouteClient')).getSupabaseRouteClient()

    const projects = await fetchScopedProjectsCached(supabase, scope, perm.user.id, 'f4')

    const projectById = new Map<string, Record<string, unknown>>()
    for (const p of projects) {
      projectById.set(String((p as { id: string }).id), p as Record<string, unknown>)
    }

    const scopedProjectIds = Array.from(projectById.keys())
    const summaries = await fetchF4PortalSummaries(supabase, scope, scopedProjectIds)
    await ensureProjectsForSummaries(supabase, projectById, summaries, scope)

    let filteredHistorical: Record<string, unknown>[] = []
    const importById: Record<string, Record<string, unknown>> = {}
    if (scope.grantAccess.mode === 'all' && !scope.emergencyRoomId) {
      const { data: historicalSummaries } = await supabase
        .from('err_summary')
        .select(`
        id,
        project_id,
        activities_raw_import_id,
        report_date,
        total_grant,
        total_expenses,
        remainder,
        created_at,
        review_status,
        review_comment,
        reviewed_at,
        activities_raw_import (
          id,
          "ERR CODE",
          "ERR Name",
          "State",
          "Project Donor",
          "Serial Number"
        )
      `)
        .not('activities_raw_import_id', 'is', null)
        .is('project_id', null)
        .order('created_at', { ascending: false })

      const impIds = [
        ...new Set(
          (historicalSummaries || [])
            .map((s: { activities_raw_import_id?: string }) => s.activities_raw_import_id)
            .filter(Boolean)
        ),
      ] as string[]

      if (impIds.length) {
        const { data: impRows } = await supabase
          .from('activities_raw_import')
          .select('id, "Serial Number", "ERR CODE", "ERR Name", "State", "Project Donor"')
          .in('id', impIds)
        for (const row of impRows || []) {
          importById[String((row as { id: string }).id)] = row as Record<string, unknown>
        }
      }

      filteredHistorical = historicalSummaries || []
      if (scope.useStateScope && scope.allowedStateNames !== null && scope.allowedStateNames.length > 0) {
        filteredHistorical = (historicalSummaries || []).filter((s: Record<string, unknown>) => {
          const raw = s.activities_raw_import
          const nested = (Array.isArray(raw) ? raw[0] : raw) || {}
          const imp = importById[String(s.activities_raw_import_id)] || {}
          const state = (nested as Record<string, unknown>)['State'] ?? imp['State']
          return state && scope.allowedStateNames!.includes(String(state))
        })
      }
    }

    const allProjectsForGrants = Array.from(projectById.values())
    const emptyGrantMaps = EMPTY_GRANT_STRING_MAP
    const grantMultiSelect = needsGrantMultiSelectForF4List(query)
    const planBeforePaginate = needsPlanBeforePaginateF4List(query)
    const paymentBeforePaginate = needsPaymentBeforePaginateF4List(query)

    const summaryProjectIds = new Set<string>()
    for (const s of summaries) {
      const pid = s.project_id
      if (pid) summaryProjectIds.add(String(pid))
    }

    let planByProject = new Map<string, Record<string, unknown>>()
    if (planBeforePaginate) {
      planByProject = await fetchPlanJsonForProjects(
        supabase,
        Array.from(computeF4PlanNeeded(projectById, summaries))
      )
    }
    const mergePlan = (projectId: string, project: Record<string, unknown>) => {
      const extra = planByProject.get(projectId)
      if (!extra) return project
      return { ...project, ...extra }
    }

    let transferDateByProject: Record<string, string> = EMPTY_PAYMENT_MAPS.transferDateByProject
    let rateByProject: Record<string, number> = EMPTY_PAYMENT_MAPS.rateByProject
    if (paymentBeforePaginate) {
      const mouIds = computeMouIdsForProjects(allProjectsForGrants)
      const maps = await loadMouPaymentMaps(supabase, mouIds, projectById)
      transferDateByProject = maps.transferDateByProject
      rateByProject = maps.rateByProject
    }

    const rows: F4ListRow[] = []

    for (const s of summaries) {
      const projectId = s.project_id ? String(s.project_id) : null
      if (!projectId || !projectById.has(projectId)) continue
      const project = mergePlan(projectId, projectById.get(projectId)!)
      const planUsd = grantAmountUsd(project)
      const fields = projectRowFields(
        project,
        projectId,
        emptyGrantMaps,
        emptyGrantMaps,
        emptyGrantMaps,
        transferDateByProject,
        rateByProject,
        planUsd
      )

      rows.push({
        id: s.id,
        project_id: projectId,
        activities_raw_import_id: null,
        ...fields,
        report_date: s.report_date ?? null,
        total_grant: s.total_grant ?? planUsd ?? null,
        total_expenses: s.total_expenses ?? null,
        remainder: s.remainder ?? null,
        attachments_count: 0,
        updated_at: s.created_at,
        review_status: s.review_status || 'pending_review',
        review_comment: s.review_comment ?? null,
        reviewed_at: s.reviewed_at ?? null,
        has_f4_report: true,
        f4_status: project.f4_status != null ? String(project.f4_status).trim().toLowerCase() : null,
        report_status: computeF4ReportStatus({
          has_f4_report: true,
          activities_raw_import_id: null,
          review_status: s.review_status || 'pending_review',
          f4_status: project.f4_status,
        }),
      })
    }

    for (const [projectId, projectRaw] of projectById) {
      if (summaryProjectIds.has(projectId)) continue
      if (!isEligibleWithoutF4Report(projectRaw, false)) continue
      const project = mergePlan(projectId, projectRaw)
      const planUsd = grantAmountUsd(project)
      const fields = projectRowFields(
        project,
        projectId,
        emptyGrantMaps,
        emptyGrantMaps,
        emptyGrantMaps,
        transferDateByProject,
        rateByProject,
        planUsd
      )

      rows.push({
        id: null,
        project_id: projectId,
        activities_raw_import_id: null,
        ...fields,
        report_date: null,
        total_grant: planUsd > 0 ? planUsd : null,
        total_expenses: null,
        remainder: null,
        attachments_count: 0,
        updated_at: null,
        review_status: null,
        review_comment: null,
        reviewed_at: null,
        has_f4_report: false,
        f4_status: project.f4_status != null ? String(project.f4_status).trim().toLowerCase() : null,
        report_status: computeF4ReportStatus({
          has_f4_report: false,
          activities_raw_import_id: null,
          review_status: null,
          f4_status: project.f4_status,
        }),
      })
    }

    for (const s of filteredHistorical) {
      const rawImp = s.activities_raw_import
      const nested = (Array.isArray(rawImp) ? rawImp[0] : rawImp) || {}
      const hist = {
        ...importById[String(s.activities_raw_import_id)],
        ...(nested as Record<string, unknown>),
      }
      const serial =
        hist['Serial Number'] != null && String(hist['Serial Number']).trim() !== ''
          ? String(hist['Serial Number']).trim()
          : null

      rows.push({
        id: s.id,
        project_id: `historical_${s.activities_raw_import_id}`,
        activities_raw_import_id: s.activities_raw_import_id,
        base_room_name: (hist['ERR Name'] as string) || (hist['ERR CODE'] as string) || null,
        err_id: hist['ERR CODE'] || hist['ERR Name'] || null,
        grant_serial_id: serial,
        grant_id: serial,
        grant_call_id: null,
        grant_name: serial,
        state: hist['State'] || null,
        donor: hist['Project Donor'] || null,
        payment_date: null,
        amount_sdg: null,
        exchange_rate: null,
        report_date: s.report_date,
        total_grant: s.total_grant,
        total_expenses: s.total_expenses,
        remainder: s.remainder,
        attachments_count: 0,
        updated_at: s.created_at,
        review_status: s.review_status || 'pending_review',
        review_comment: s.review_comment ?? null,
        reviewed_at: s.reviewed_at ?? null,
        has_f4_report: true,
        report_status: computeF4ReportStatus({
          has_f4_report: true,
          activities_raw_import_id: s.activities_raw_import_id,
          review_status: s.review_status || 'pending_review',
        }),
      })
    }

    const metaBase = buildFilterMeta(rows)
    const grantFilterOptions = await buildGrantFilterMetaForProjects(
      supabase,
      portalProjectsForListRows(rows, projectById)
    )
    const filterMeta = { ...metaBase, grants: grantFilterOptions }

    let filtered: F4ListRow[]
    if (grantMultiSelect) {
      filtered = applyF4NonGrantMultiSelectListFilters(rows, query.filters)
      const projectsAfterNonGrant = portalProjectsForListRows(filtered, projectById)
      const gridIds = uniqueGrantGridIdsFromProjects(projectsAfterNonGrant)
      const gridGrantIdByUuid = await loadGrantCallIdMap(supabase, gridIds)
      applyGrantCallIdToRows(filtered, projectById, gridGrantIdByUuid)
      filtered = applyGrantMultiSelectListFilters(filtered, query.filters.grants)
    } else {
      filtered = applyF4ListFilters(rows, query.filters)
    }

    const summary = computeF4ListSummary(filtered)
    const sorted = sortF4Rows(filtered, query.sortBy, query.sortDir)
    const pagination = paginationMeta(sorted.length, query.page, query.pageSize)
    const pageRows = paginateRows(sorted, pagination.page, pagination.pageSize)

    let pagePlanByProject: Map<string, Record<string, unknown>> | undefined
    let pagePlanIdsForAmount: Set<string> | undefined
    if (!planBeforePaginate) {
      const pagePlanIds = computeF4PlanNeededForPageRows(pageRows)
      pagePlanIdsForAmount = new Set(pagePlanIds)
      if (pagePlanIds.length > 0) {
        pagePlanByProject = await fetchPlanJsonForProjects(supabase, pagePlanIds)
        enrichF4ListPlanFinancialFields(pageRows, projectById, pagePlanByProject, EMPTY_PAYMENT_MAPS.rateByProject)
      }
    }

    if (!paymentBeforePaginate) {
      const pageProjectIds = getPageProjectIdsForPayment(pageRows)
      if (pageProjectIds.length > 0) {
        const pageProjectById = buildPageProjectById(pageProjectIds, projectById)
        const pageMouIds = computeMouIdsForProjects(pageProjectById.values())
        const pagePayment = await loadMouPaymentMaps(supabase, pageMouIds, pageProjectById)
        enrichF4ListPaymentFields(
          pageRows,
          projectById,
          pagePayment.transferDateByProject,
          pagePayment.rateByProject,
          pagePlanByProject,
          pagePlanIdsForAmount
        )
      }
    }

    await enrichPortalRowGrantFields(supabase, pageRows, projectById)

    const summaryIdsForAttach = pageRows
      .map((r) => r.id)
      .filter((id) => id != null)
      .map((id) => Number(id))
      .filter((id) => !Number.isNaN(id))
    const attachCounts = await loadF4AttachmentCounts(supabase, summaryIdsForAttach)
    for (const row of pageRows) {
      if (row.id != null && typeof row.id === 'number') {
        row.attachments_count = attachCounts[row.id] || 0
      }
    }

    return NextResponse.json({
      data: pageRows,
      pagination,
      sort: { sortBy: query.sortBy, sortDir: query.sortDir },
      filterMeta,
      summary,
    })
  } catch (e) {
    console.error('F4 list error', e)
    return NextResponse.json({ error: 'Failed to fetch F4 list' }, { status: 500 })
  }
}
