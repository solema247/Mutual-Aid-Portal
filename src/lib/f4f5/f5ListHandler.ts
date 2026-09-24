import { NextResponse } from 'next/server'
import type { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { requirePermission } from '@/lib/requirePermission'
import { resolveF4F5ListScope } from './listScope'
import {
  needsGrantMultiSelectForF5List,
  needsPaymentBeforePaginateF5List,
  needsPlanBeforePaginateF5List,
  needsReachForF5List,
  parseF5ListQueryFromApiUrl,
} from './listQueryParams'
import {
  buildPageProjectById,
  computeMouIdsForProjects,
  EMPTY_PAYMENT_MAPS,
  enrichF5ListPaymentFields,
  getPageProjectIdsForPayment,
} from './paymentSummary'
import {
  applyF5EndActivityListFilters,
  applyF5ListFilters,
  applyF5NonGrantMultiSelectListFilters,
  applyF5NonReachListFilters,
  applyGrantMultiSelectListFilters,
  buildFilterMeta,
  paginateRows,
  paginationMeta,
  sortF5Rows,
} from './listFilterSort'
import {
  baseRoomLabel,
  buildGrantFilterMetaForProjects,
  chunkIds,
  donorLabel,
  EMPTY_GRANT_STRING_MAP,
  computeF5PlanNeeded,
  computeF5PlanNeededForPageRows,
  enrichF5ListPlanFinancialFields,
  enrichPortalRowGrantFields,
  fetchPlanJsonForProjects,
  fetchProjectIdsInStateScope,
  grantAmountUsd,
  grantCallIdForProject,
  grantNameForProject,
  isEligibleWithoutF5Report,
  loadGrantCallIdMap,
  portalProjectsForListRows,
  applyGrantCallIdToRows,
  uniqueGrantGridIdsFromProjects,
} from './listCommon'
import { loadF5ReachForReports, loadMouPaymentMaps } from './listEnrichment'
import { fetchScopedProjectsCached } from './scopedProjectsCache'

const F5_REPORT_SELECT = `
  id,
  project_id,
  report_date,
  created_at
`

async function fetchF5PortalReports(
  supabase: ReturnType<typeof getSupabaseRouteClient>,
  scope: Awaited<ReturnType<typeof resolveF4F5ListScope>>,
  scopedProjectIds: string[]
): Promise<Record<string, unknown>[]> {
  if (scope.grantAccess.mode === 'partner' || scope.emergencyRoomId) {
    if (scopedProjectIds.length === 0) return []
    const out: Record<string, unknown>[] = []
    for (const batch of chunkIds(scopedProjectIds)) {
      const { data, error } = await supabase
        .from('err_program_report')
        .select(F5_REPORT_SELECT)
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
        .from('err_program_report')
        .select(F5_REPORT_SELECT)
        .in('project_id', batch)
        .order('created_at', { ascending: false })
      if (error) throw error
      out.push(...((data || []) as unknown as Record<string, unknown>[]))
    }
    return out
  }

  const { data, error } = await supabase
    .from('err_program_report')
    .select(F5_REPORT_SELECT)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []) as unknown as Record<string, unknown>[]
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

async function ensureProjectsForReports(
  supabase: ReturnType<typeof getSupabaseRouteClient>,
  projectById: Map<string, Record<string, unknown>>,
  reports: Record<string, unknown>[],
  scope: Awaited<ReturnType<typeof resolveF4F5ListScope>>
) {
  const missing: string[] = []
  for (const r of reports) {
    const pid = r.project_id ? String(r.project_id) : ''
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
      if (!projectInScope(p, scope)) continue
      projectById.set(String(p.id), p)
    }
  }
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

function collectUploadedReportIds(rows: Record<string, unknown>[]): string[] {
  const ids: string[] = []
  for (const row of rows) {
    if (row.id == null) continue
    if (row.has_f5_report === false) continue
    ids.push(String(row.id))
  }
  return ids
}

function applyReachFieldsToUploadedRows(
  rows: Record<string, unknown>[],
  reachCounts: Record<string, number>,
  reachHasEndDate: Record<string, boolean>
) {
  for (const row of rows) {
    if (row.id == null || row.has_f5_report === false) continue
    const reportId = String(row.id)
    row.activities_count = reachCounts[reportId] || 0
    row.end_activity_status = reachHasEndDate[reportId] ? 'complete' : 'missing'
  }
}

export async function handleF5ListGet(request: Request) {
  const perm = await requirePermission('f4_f5_view_page')
  if (perm instanceof NextResponse) return perm

  const scope = await resolveF4F5ListScope()
  const query = parseF5ListQueryFromApiUrl(new URL(request.url).searchParams)

  const emptyBody = {
    data: [] as Record<string, unknown>[],
    pagination: paginationMeta(0, query.page, query.pageSize),
    sort: { sortBy: query.sortBy, sortDir: query.sortDir },
    filterMeta: { baseRooms: [] as string[], states: [] as string[], grants: [] as { value: string; label: string }[] },
  }

  if (scope.isEmpty) {
    return NextResponse.json(emptyBody)
  }

  try {
    const supabase = (await import('@/lib/supabaseRouteClient')).getSupabaseRouteClient()

    const projects = await fetchScopedProjectsCached(supabase, scope, perm.user.id, 'f5')

    const projectById = new Map<string, Record<string, unknown>>()
    for (const p of projects) {
      projectById.set(String((p as { id: string }).id), p as Record<string, unknown>)
    }

    const scopedProjectIds = Array.from(projectById.keys())
    const reports = await fetchF5PortalReports(supabase, scope, scopedProjectIds)
    await ensureProjectsForReports(supabase, projectById, reports, scope)

    const allProjectsForGrants = Array.from(projectById.values())
    const emptyGrantMaps = EMPTY_GRANT_STRING_MAP
    const grantMultiSelect = needsGrantMultiSelectForF5List(query)
    const planBeforePaginate = needsPlanBeforePaginateF5List(query)
    const paymentBeforePaginate = needsPaymentBeforePaginateF5List(query)

    const reportProjectIds = new Set<string>()
    for (const r of reports) {
      const pid = r.project_id
      if (pid) reportProjectIds.add(String(pid))
    }

    let planByProject = new Map<string, Record<string, unknown>>()
    if (planBeforePaginate) {
      planByProject = await fetchPlanJsonForProjects(
        supabase,
        Array.from(computeF5PlanNeeded(projectById, reports))
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

    const rows: Record<string, unknown>[] = []

    for (const r of reports) {
      const projectId = r.project_id ? String(r.project_id) : null
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
        id: r.id,
        project_id: projectId,
        ...fields,
        report_date: r.report_date ?? null,
        activities_count: 0,
        updated_at: r.created_at,
        has_f5_report: true,
        f5_status: project.f5_status != null ? String(project.f5_status).trim().toLowerCase() : null,
        report_status: 'uploaded',
        end_activity_status: null,
      })
    }

    for (const [projectId, projectRaw] of projectById) {
      if (reportProjectIds.has(projectId)) continue
      if (!isEligibleWithoutF5Report(projectRaw, false)) continue
      const project = mergePlan(projectId, projectRaw)
      const planUsd = grantAmountUsd(project)
      const f5Status = project.f5_status != null ? String(project.f5_status).trim().toLowerCase() : null

      rows.push({
        id: null,
        project_id: projectId,
        ...projectRowFields(
          project,
          projectId,
          emptyGrantMaps,
          emptyGrantMaps,
          emptyGrantMaps,
          transferDateByProject,
          rateByProject,
          planUsd
        ),
        report_date: null,
        activities_count: 0,
        updated_at: null,
        has_f5_report: false,
        f5_status: f5Status,
        report_status: f5Status === 'completed' ? 'complete_no_report' : 'not_uploaded',
        end_activity_status: null,
      })
    }

    const metaBase = buildFilterMeta(rows)
    const grantFilterOptions = await buildGrantFilterMetaForProjects(
      supabase,
      portalProjectsForListRows(rows, projectById)
    )
    const filterMeta = { ...metaBase, grants: grantFilterOptions }

    const reachDependent = needsReachForF5List(query)

    async function resolveAndApplyGrantMultiSelect(filtered: Record<string, unknown>[]) {
      const projectsAfterNonGrant = portalProjectsForListRows(filtered, projectById)
      const gridIds = uniqueGrantGridIdsFromProjects(projectsAfterNonGrant)
      const gridGrantIdByUuid = await loadGrantCallIdMap(supabase, gridIds)
      applyGrantCallIdToRows(filtered, projectById, gridGrantIdByUuid)
      return applyGrantMultiSelectListFilters(filtered, query.filters.grants)
    }

    let pageRows: Record<string, unknown>[]
    let pagination: ReturnType<typeof paginationMeta>

    if (!reachDependent && !grantMultiSelect) {
      const filtered = applyF5ListFilters(rows, query.filters)
      const sorted = sortF5Rows(filtered, query.sortBy, query.sortDir)
      pagination = paginationMeta(sorted.length, query.page, query.pageSize)
      pageRows = paginateRows(sorted, pagination.page, pagination.pageSize)

      const pageReportIds = collectUploadedReportIds(pageRows)
      if (pageReportIds.length > 0) {
        const { reachCounts, reachHasEndDate } = await loadF5ReachForReports(supabase, pageReportIds)
        applyReachFieldsToUploadedRows(pageRows, reachCounts, reachHasEndDate)
      }
    } else if (!reachDependent && grantMultiSelect) {
      let filtered = applyF5NonGrantMultiSelectListFilters(rows, query.filters)
      filtered = await resolveAndApplyGrantMultiSelect(filtered)
      const sorted = sortF5Rows(filtered, query.sortBy, query.sortDir)
      pagination = paginationMeta(sorted.length, query.page, query.pageSize)
      pageRows = paginateRows(sorted, pagination.page, pagination.pageSize)

      const pageReportIds = collectUploadedReportIds(pageRows)
      if (pageReportIds.length > 0) {
        const { reachCounts, reachHasEndDate } = await loadF5ReachForReports(supabase, pageReportIds)
        applyReachFieldsToUploadedRows(pageRows, reachCounts, reachHasEndDate)
      }
    } else if (reachDependent && !grantMultiSelect) {
      let filtered = applyF5NonReachListFilters(rows, query.filters)
      const reportIdsForReach = collectUploadedReportIds(filtered)
      if (reportIdsForReach.length > 0) {
        const { reachCounts, reachHasEndDate } = await loadF5ReachForReports(supabase, reportIdsForReach)
        applyReachFieldsToUploadedRows(filtered, reachCounts, reachHasEndDate)
      }
      if (query.filters.endActivityStatuses.length > 0) {
        filtered = applyF5EndActivityListFilters(filtered, query.filters.endActivityStatuses)
      }
      const sorted = sortF5Rows(filtered, query.sortBy, query.sortDir)
      pagination = paginationMeta(sorted.length, query.page, query.pageSize)
      pageRows = paginateRows(sorted, pagination.page, pagination.pageSize)
    } else {
      let filtered = applyF5NonReachListFilters(rows, {
        ...query.filters,
        grants: [],
      })
      filtered = await resolveAndApplyGrantMultiSelect(filtered)
      const reportIdsForReach = collectUploadedReportIds(filtered)
      if (reportIdsForReach.length > 0) {
        const { reachCounts, reachHasEndDate } = await loadF5ReachForReports(supabase, reportIdsForReach)
        applyReachFieldsToUploadedRows(filtered, reachCounts, reachHasEndDate)
      }
      if (query.filters.endActivityStatuses.length > 0) {
        filtered = applyF5EndActivityListFilters(filtered, query.filters.endActivityStatuses)
      }
      const sorted = sortF5Rows(filtered, query.sortBy, query.sortDir)
      pagination = paginationMeta(sorted.length, query.page, query.pageSize)
      pageRows = paginateRows(sorted, pagination.page, pagination.pageSize)
    }

    let pagePlanByProject: Map<string, Record<string, unknown>> | undefined
    if (!planBeforePaginate) {
      const pagePlanIds = computeF5PlanNeededForPageRows(pageRows)
      if (pagePlanIds.length > 0) {
        pagePlanByProject = await fetchPlanJsonForProjects(supabase, pagePlanIds)
        enrichF5ListPlanFinancialFields(
          pageRows,
          projectById,
          pagePlanByProject,
          EMPTY_PAYMENT_MAPS.rateByProject
        )
      }
    }

    if (!paymentBeforePaginate) {
      const pageProjectIds = getPageProjectIdsForPayment(pageRows)
      if (pageProjectIds.length > 0) {
        const pageProjectById = buildPageProjectById(pageProjectIds, projectById)
        const pageMouIds = computeMouIdsForProjects(pageProjectById.values())
        const pagePayment = await loadMouPaymentMaps(supabase, pageMouIds, pageProjectById)
        enrichF5ListPaymentFields(
          pageRows,
          projectById,
          pagePayment.transferDateByProject,
          pagePayment.rateByProject,
          pagePlanByProject
        )
      }
    }

    await enrichPortalRowGrantFields(supabase, pageRows, projectById)

    return NextResponse.json({
      data: pageRows,
      pagination,
      sort: { sortBy: query.sortBy, sortDir: query.sortDir },
      filterMeta,
    })
  } catch (e) {
    console.error('F5 list error', e)
    return NextResponse.json({ error: 'Failed to fetch F5 list' }, { status: 500 })
  }
}
