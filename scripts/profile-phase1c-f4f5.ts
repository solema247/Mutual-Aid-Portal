/**
 * Phase 1C read-only query-replay profiling (NOT HTTP E2E).
 * Uses production Supabase via .env.local service role — same DB as Phase 1A.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { F4F5ListScope } from '../src/lib/f4f5/listScope'
import {
  chunkIds,
  computeF4PlanNeeded,
  computeF4PlanNeededForPageRows,
  computeF5PlanNeeded,
  computeF5PlanNeededForPageRows,
  enrichF4ListPlanFinancialFields,
  enrichF5ListPlanFinancialFields,
  fetchPlanJsonForProjects,
  fetchScopedProjects,
  isEligibleWithoutF4Report,
  isEligibleWithoutF5Report,
  buildGrantFilterMetaForProjects,
  enrichPortalRowGrantFields,
  portalProjectsForListRows,
} from '../src/lib/f4f5/listCommon'
import {
  filterGrantAssignedProjects,
  filterProjectsByF4Completion,
  filterProjectsByF5Completion,
  shouldIncludeHistoricalF4Rows,
} from '../src/lib/f4f5/listGates'
import { loadF4AttachmentCounts, loadF5ReachForReports, loadMouPaymentMaps } from '../src/lib/f4f5/listEnrichment'
import {
  buildPageProjectById,
  computeMouIdsForProjects,
  getPageProjectIdsForPayment,
} from '../src/lib/f4f5/paymentSummary'
import {
  applyF4ListFilters,
  applyF5EndActivityListFilters,
  applyF5ListFilters,
  applyF5NonReachListFilters,
  paginateRows,
  paginationMeta,
  sortF4Rows,
  sortF5Rows,
} from '../src/lib/f4f5/listFilterSort'
import {
  needsPaymentBeforePaginateF4List,
  needsPaymentBeforePaginateF5List,
  needsPlanBeforePaginateF4List,
  needsPlanBeforePaginateF5List,
  needsReachForF5List,
  type F4ListQuery,
  type F5ListQuery,
} from '../src/lib/f4f5/listQueryParams'

function loadEnvLocal() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (!m) continue
    process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

function ms(label: string, t0: number) {
  return { label, ms: Date.now() - t0 }
}

async function discoverScenarios(supabase: SupabaseClient) {
  const adminScope: F4F5ListScope = {
    grantAccess: { mode: 'all', partnerId: null, grantGridIds: null, grantIds: null },
    allowedStateNames: null,
    roomAccess: { applies: false, mode: 'n/a', emergencyRoomId: null },
    grantGridIds: null,
    emergencyRoomId: null,
    useStateScope: true,
    isEmpty: false,
  }

  const { data: partnerUser } = await supabase
    .from('users')
    .select('partner_id')
    .eq('role', 'partner')
    .not('partner_id', 'is', null)
    .limit(1)
    .maybeSingle()
  let partnerScope: F4F5ListScope | null = null
  if (partnerUser?.partner_id) {
    const { data: grants } = await supabase
      .from('grants_grid_view')
      .select('id')
      .eq('partner_id', partnerUser.partner_id)
    const gridIds = (grants || []).map((g) => String((g as { id: string }).id))
    partnerScope = {
      grantAccess: {
        mode: 'partner',
        partnerId: String(partnerUser.partner_id),
        grantGridIds: gridIds,
        grantIds: [],
      },
      allowedStateNames: null,
      roomAccess: { applies: false, mode: 'n/a', emergencyRoomId: null },
      grantGridIds: gridIds,
      emergencyRoomId: null,
      useStateScope: true,
      isEmpty: gridIds.length === 0,
    }
  }

  const { data: stateUser } = await supabase
    .from('users')
    .select('visible_states, can_see_all_states')
    .eq('role', 'state_err')
    .eq('can_see_all_states', false)
    .limit(1)
    .maybeSingle()
  let stateScope: F4F5ListScope | null = null
  if (stateUser) {
    let visibleStateIds: string[] = (stateUser.visible_states as string[]) || []
    if (typeof stateUser.visible_states === 'string') {
      try {
        visibleStateIds = JSON.parse(stateUser.visible_states)
      } catch {
        visibleStateIds = []
      }
    }
    const { data: states } = await supabase.from('states').select('state_name').in('id', visibleStateIds)
    const allowed = (states || []).map((s) => String((s as { state_name: string }).state_name))
    stateScope = {
      grantAccess: { mode: 'all', partnerId: null, grantGridIds: null, grantIds: null },
      allowedStateNames: allowed,
      roomAccess: { applies: false, mode: 'n/a', emergencyRoomId: null },
      grantGridIds: null,
      emergencyRoomId: null,
      useStateScope: true,
      isEmpty: allowed.length === 0,
    }
  }

  let baseRoomScope: F4F5ListScope | null = null
  const { data: roomRows } = await supabase
    .from('err_projects')
    .select('emergency_room_id')
    .not('emergency_room_id', 'is', null)
    .in('status', ['active', 'approved', 'completed'])
  const roomCounts = new Map<string, number>()
  for (const row of roomRows || []) {
    const rid = String((row as { emergency_room_id: string }).emergency_room_id)
    roomCounts.set(rid, (roomCounts.get(rid) || 0) + 1)
  }
  const sampleRoom = [...roomCounts.entries()].sort((a, b) => a[1] - b[1]).find(([, n]) => n >= 1 && n <= 5)?.[0]
  if (sampleRoom) {
    baseRoomScope = {
      grantAccess: { mode: 'all', partnerId: null, grantGridIds: null, grantIds: null },
      allowedStateNames: null,
      roomAccess: { applies: true, mode: 'room', emergencyRoomId: sampleRoom },
      grantGridIds: null,
      emergencyRoomId: sampleRoom,
      useStateScope: false,
      isEmpty: false,
    }
  }

  const baseNullScope: F4F5ListScope = {
    grantAccess: { mode: 'all', partnerId: null, grantGridIds: null, grantIds: null },
    allowedStateNames: null,
    roomAccess: { applies: true, mode: 'none', emergencyRoomId: null },
    grantGridIds: null,
    emergencyRoomId: null,
    useStateScope: false,
    isEmpty: true,
  }

  return {
    A: adminScope,
    B: stateScope,
    C: partnerScope,
    D: baseRoomScope,
    E: baseNullScope,
  }
}

const F4_SUMMARY_SELECT = `
  id, project_id, activities_raw_import_id, report_date, total_grant, total_expenses, remainder,
  created_at, review_status, review_comment, reviewed_at
`
const F5_REPORT_SELECT = `id, project_id, report_date, created_at`

async function fetchF4Summaries(supabase: SupabaseClient, _scope: F4F5ListScope, scopedProjectIds: string[]) {
  if (scopedProjectIds.length === 0) return []
  const out: Record<string, unknown>[] = []
  for (const batch of chunkIds(scopedProjectIds)) {
    const { data, error } = await supabase
      .from('err_summary')
      .select(F4_SUMMARY_SELECT)
      .is('activities_raw_import_id', null)
      .in('project_id', batch)
    if (error) throw error
    out.push(...((data || []) as Record<string, unknown>[]))
  }
  return out
}

async function fetchF5Reports(supabase: SupabaseClient, _scope: F4F5ListScope, scopedProjectIds: string[]) {
  if (scopedProjectIds.length === 0) return []
  const out: Record<string, unknown>[] = []
  for (const batch of chunkIds(scopedProjectIds)) {
    const { data, error } = await supabase
      .from('err_program_report')
      .select(F5_REPORT_SELECT)
      .in('project_id', batch)
    if (error) throw error
    out.push(...((data || []) as Record<string, unknown>[]))
  }
  return out
}

function defaultF5Query(): F5ListQuery {
  return {
    page: 1,
    pageSize: 20,
    sortBy: 'report_date',
    sortDir: 'desc',
    completion: 'active',
    filters: {
      grantIdText: '',
      baseRooms: [],
      states: [],
      localities: [],
      grants: [],
      reportStatuses: [],
      endActivityStatuses: [],
    },
  }
}

function collectUploadedReportIds(rows: Record<string, unknown>[]) {
  return rows.filter((r) => r.id != null && r.has_f5_report !== false).map((r) => String(r.id))
}

async function loadReachTimed(supabase: SupabaseClient, reportIds: string[]) {
  const t0 = Date.now()
  let reachRows = 0
  const reachCounts: Record<string, number> = {}
  const reachHasEndDate: Record<string, boolean> = {}
  if (reportIds.length) {
    for (const batch of chunkIds(reportIds)) {
      const { data } = await supabase.from('err_program_reach').select('report_id, end_date').in('report_id', batch)
      for (const row of data || []) {
        reachRows++
        const sid = String((row as { report_id: string }).report_id)
        reachCounts[sid] = (reachCounts[sid] || 0) + 1
        if ((row as { end_date: string | null }).end_date) reachHasEndDate[sid] = true
      }
    }
  }
  return { ms: Date.now() - t0, reachRows, result: { reachCounts, reachHasEndDate } }
}

function defaultF4Query(): F4ListQuery {
  return {
    page: 1,
    pageSize: 20,
    sortBy: 'report_date',
    sortDir: 'desc',
    completion: 'active',
    filters: {
      grantIdText: '',
      baseRooms: [],
      states: [],
      localities: [],
      grants: [],
      reportStatuses: [],
    },
  }
}

async function profileF4(
  supabase: SupabaseClient,
  scope: F4F5ListScope,
  scenarioKey: string,
  query: F4ListQuery = defaultF4Query(),
  variant = 'default'
) {
  if (scope.isEmpty) {
    return { scenarioKey, empty: true }
  }
  const phases: Record<string, number | string> = {}
  const tTotal = Date.now()
  const t0 = Date.now()
  const scopedProjects = await fetchScopedProjects(supabase as never, {
    grantGridIds: scope.grantGridIds,
    allowedStateNames: scope.allowedStateNames,
    useStateScope: scope.useStateScope,
    emergencyRoomId: scope.emergencyRoomId,
  })
  phases.projectFetch = ms('', t0).ms
  phases.scopedProjects = scopedProjects.length

  const { projects: grantAssigned } = await filterGrantAssignedProjects(
    supabase as never,
    scopedProjects as Record<string, unknown>[]
  )
  phases.postGrantProjects = grantAssigned.length
  const projects = filterProjectsByF4Completion(grantAssigned, query.completion)
  phases.postCompletionProjects = projects.length
  phases.completionMode = query.completion

  const projectById = new Map(projects.map((p) => [String((p as { id: string }).id), p as Record<string, unknown>]))
  const scopedProjectIds = [...projectById.keys()]

  let t = Date.now()
  const summaries = await fetchF4Summaries(supabase, scope, scopedProjectIds)
  phases.summaryFetch = Date.now() - t

  t = Date.now()
  let historicalCount = 0
  if (
    shouldIncludeHistoricalF4Rows(query.completion) &&
    scope.grantAccess.mode === 'all' &&
    !scope.emergencyRoomId
  ) {
    const { data: historicalSummaries } = await supabase
      .from('err_summary')
      .select(`
        id, project_id, activities_raw_import_id, report_date, total_grant, total_expenses, remainder, created_at, review_status,
        activities_raw_import ( id, "ERR CODE", "ERR Name", "State", "Project Donor", "Serial Number" )
      `)
      .not('activities_raw_import_id', 'is', null)
      .is('project_id', null)
    historicalCount = (historicalSummaries || []).length
  }
  phases.historicalF4 = Date.now() - t
  phases.historicalRows = historicalCount

  const summaryProjectIds = new Set<string>()
  for (const s of summaries) {
    if (s.project_id) summaryProjectIds.add(String(s.project_id))
  }
  const planBeforePaginate = needsPlanBeforePaginateF4List(query)
  phases.planPath = planBeforePaginate ? 'B' : 'A'

  let planByProject = new Map<string, Record<string, unknown>>()
  if (planBeforePaginate) {
    const planNeeded = computeF4PlanNeeded(projectById, summaries)
    t = Date.now()
    planByProject = await fetchPlanJsonForProjects(supabase as never, [...planNeeded])
    phases.planJson = Date.now() - t
    phases.planProjectIds = planNeeded.size
  } else {
    phases.planJson = 0
    phases.planProjectIds = 0
  }

  const paymentBeforePaginate = needsPaymentBeforePaginateF4List(query)
  phases.paymentPath = paymentBeforePaginate ? 'B' : 'A'
  phases.paymentProjectIds = paymentBeforePaginate ? projectById.size : 0

  if (paymentBeforePaginate) {
    const mouIds = computeMouIdsForProjects(projectById.values())
    t = Date.now()
    await loadMouPaymentMaps(supabase as never, mouIds, projectById)
    phases.mouPayment = Date.now() - t
    phases.mouIds = mouIds.length
  } else {
    phases.mouPayment = 0
    phases.mouIds = 0
  }

  t = Date.now()
  const rows: Record<string, unknown>[] = []
  for (const s of summaries) {
    const projectId = s.project_id ? String(s.project_id) : ''
    if (!projectId || !projectById.has(projectId)) continue
    rows.push({
      id: s.id,
      project_id: projectId,
      report_date: s.report_date,
      has_f4_report: true,
      total_grant: s.total_grant ?? null,
    })
  }
  for (const [projectId, project] of projectById) {
    if (summaryProjectIds.has(projectId)) continue
    if (!isEligibleWithoutF4Report(project, false)) continue
    rows.push({ id: null, project_id: projectId, has_f4_report: false, total_grant: null })
  }
  phases.rowBuild = Date.now() - t
  phases.candidateRows = rows.length + historicalCount

  t = Date.now()
  await buildGrantFilterMetaForProjects(
    supabase as never,
    portalProjectsForListRows(rows, projectById)
  )
  phases.grantFilterMeta = Date.now() - t

  t = Date.now()
  const filtered = applyF4ListFilters(rows, query.filters)
  const sorted = sortF4Rows(filtered, query.sortBy, query.sortDir)
  const pagination = paginationMeta(sorted.length, query.page, query.pageSize)
  const pageRows = paginateRows(sorted, pagination.page, pagination.pageSize)
  phases.filterSortPage = Date.now() - t

  if (!planBeforePaginate) {
    const pagePlanIds = computeF4PlanNeededForPageRows(pageRows)
    phases.planPageProjectIds = pagePlanIds.length
    t = Date.now()
    if (pagePlanIds.length > 0) {
      const pagePlan = await fetchPlanJsonForProjects(supabase as never, pagePlanIds)
      enrichF4ListPlanFinancialFields(pageRows, projectById, pagePlan, {})
    }
    phases.planJson = Date.now() - t
    phases.planProjectIds = pagePlanIds.length
  }

  if (!paymentBeforePaginate) {
    const pageProjectIds = getPageProjectIdsForPayment(pageRows)
    phases.paymentPageProjectIds = pageProjectIds.length
    t = Date.now()
    if (pageProjectIds.length > 0) {
      const pageProjectById = buildPageProjectById(pageProjectIds, projectById)
      const pageMouIds = computeMouIdsForProjects(pageProjectById.values())
      await loadMouPaymentMaps(supabase as never, pageMouIds, pageProjectById)
    }
    phases.mouPayment = Date.now() - t
    phases.paymentProjectIds = pageProjectIds.length
  }

  t = Date.now()
  await enrichPortalRowGrantFields(supabase as never, pageRows, projectById)
  phases.grantPageEnrich = Date.now() - t
  phases.grantMaps = (phases.grantFilterMeta as number) + (phases.grantPageEnrich as number)

  t = Date.now()
  const attachIds = pageRows.map((r) => r.id).filter((id) => id != null).map(Number).filter((n) => !Number.isNaN(n))
  await loadF4AttachmentCounts(supabase as never, attachIds)
  phases.pageEnrichment = Date.now() - t
  phases.returnedRows = pageRows.length
  phases.reach = 'N/A'
  phases.total = Date.now() - tTotal

  return { scenarioKey, variant, phases }
}

async function profileF5(
  supabase: SupabaseClient,
  scope: F4F5ListScope,
  scenarioKey: string,
  query: F5ListQuery,
  variant: string
) {
  if (scope.isEmpty) {
    return { scenarioKey, variant, empty: true }
  }
  const phases: Record<string, number | string> = {}
  const tTotal = Date.now()

  let t = Date.now()
  const scopedProjects = await fetchScopedProjects(supabase as never, {
    grantGridIds: scope.grantGridIds,
    allowedStateNames: scope.allowedStateNames,
    useStateScope: scope.useStateScope,
    emergencyRoomId: scope.emergencyRoomId,
  })
  phases.projectFetch = Date.now() - t
  phases.scopedProjects = scopedProjects.length

  const { projects: grantAssigned } = await filterGrantAssignedProjects(
    supabase as never,
    scopedProjects as Record<string, unknown>[]
  )
  phases.postGrantProjects = grantAssigned.length
  const projects = filterProjectsByF5Completion(grantAssigned, query.completion)
  phases.postCompletionProjects = projects.length
  phases.completionMode = query.completion

  const projectById = new Map(projects.map((p) => [String((p as { id: string }).id), p as Record<string, unknown>]))
  const scopedProjectIds = [...projectById.keys()]

  t = Date.now()
  const reports = await fetchF5Reports(supabase, scope, scopedProjectIds)
  phases.reportFetch = Date.now() - t

  const planBeforePaginate = needsPlanBeforePaginateF5List(query)
  phases.planPath = planBeforePaginate ? 'B' : 'A'

  if (planBeforePaginate) {
    const planNeeded = computeF5PlanNeeded(projectById, reports)
    t = Date.now()
    await fetchPlanJsonForProjects(supabase as never, [...planNeeded])
    phases.planJson = Date.now() - t
    phases.planProjectIds = planNeeded.size
  } else {
    phases.planJson = 0
    phases.planProjectIds = 0
  }

  const paymentBeforePaginate = needsPaymentBeforePaginateF5List(query)
  phases.paymentPath = paymentBeforePaginate ? 'B' : 'A'
  phases.paymentProjectIds = paymentBeforePaginate ? projectById.size : 0

  if (paymentBeforePaginate) {
    const mouIds = computeMouIdsForProjects(projectById.values())
    t = Date.now()
    await loadMouPaymentMaps(supabase as never, mouIds, projectById)
    phases.mouPayment = Date.now() - t
    phases.mouIds = mouIds.length
  } else {
    phases.mouPayment = 0
    phases.mouIds = 0
  }

  const reportProjectIds = new Set<string>()
  for (const r of reports) {
    if (r.project_id) reportProjectIds.add(String(r.project_id))
  }

  t = Date.now()
  const rows: Record<string, unknown>[] = []
  for (const r of reports) {
    const projectId = r.project_id ? String(r.project_id) : ''
    if (!projectId || !projectById.has(projectId)) continue
    rows.push({
      id: r.id,
      project_id: projectId,
      report_date: r.report_date,
      updated_at: r.created_at,
      has_f5_report: true,
      activities_count: 0,
      end_activity_status: null,
    })
  }
  for (const [projectId, project] of projectById) {
    if (reportProjectIds.has(projectId)) continue
    if (!isEligibleWithoutF5Report(project, false)) continue
    rows.push({
      id: null,
      project_id: projectId,
      has_f5_report: false,
      activities_count: 0,
      end_activity_status: null,
    })
  }
  phases.rowBuild = Date.now() - t
  phases.candidateRows = rows.length

  t = Date.now()
  await buildGrantFilterMetaForProjects(
    supabase as never,
    portalProjectsForListRows(rows, projectById)
  )
  phases.grantFilterMeta = Date.now() - t

  const reachDependent = needsReachForF5List(query)
  phases.path = reachDependent ? 'B' : 'A'

  t = Date.now()
  let pageRows: Record<string, unknown>[]
  if (!reachDependent) {
    const filtered = applyF5ListFilters(rows, query.filters)
    const sorted = sortF5Rows(filtered, query.sortBy, query.sortDir)
    const pagination = paginationMeta(sorted.length, query.page, query.pageSize)
    pageRows = paginateRows(sorted, pagination.page, pagination.pageSize)
    phases.filterSortPage = Date.now() - t

    const pageReportIds = collectUploadedReportIds(pageRows)
    phases.reachReportIds = pageReportIds.length
    const reachT = Date.now()
    const { reachRows } = await loadReachTimed(supabase, pageReportIds)
    phases.reach = Date.now() - reachT
    phases.reachRows = reachRows
    phases.returnedRows = pageRows.length
  } else {
    let filtered = applyF5NonReachListFilters(rows, query.filters)
    phases.afterNonReachFilters = filtered.length
    const reportIdsForReach = collectUploadedReportIds(filtered)
    phases.reachReportIds = reportIdsForReach.length
    const reachT = Date.now()
    const { reachRows, result } = await loadReachTimed(supabase, reportIdsForReach)
    phases.reach = Date.now() - reachT
    phases.reachRows = reachRows
    for (const row of filtered) {
      if (row.id == null || row.has_f5_report === false) continue
      const rid = String(row.id)
      row.activities_count = result.reachCounts[rid] || 0
      row.end_activity_status = result.reachHasEndDate[rid] ? 'complete' : 'missing'
    }
    if (query.filters.endActivityStatuses.length) {
      filtered = applyF5EndActivityListFilters(filtered, query.filters.endActivityStatuses)
    }
    phases.afterEndActivityFilter = filtered.length
    const sorted = sortF5Rows(filtered, query.sortBy, query.sortDir)
    pageRows = paginateRows(sorted, 1, query.pageSize)
    phases.filterSortPage = Date.now() - t
    phases.returnedRows = pageRows.length
  }

  if (!planBeforePaginate) {
    const pagePlanIds = computeF5PlanNeededForPageRows(pageRows)
    phases.planPageProjectIds = pagePlanIds.length
    t = Date.now()
    if (pagePlanIds.length > 0) {
      const pagePlan = await fetchPlanJsonForProjects(supabase as never, pagePlanIds)
      enrichF5ListPlanFinancialFields(pageRows, projectById, pagePlan, {})
    }
    phases.planJson = Date.now() - t
    phases.planProjectIds = pagePlanIds.length
  }

  if (!paymentBeforePaginate) {
    const pageProjectIds = getPageProjectIdsForPayment(pageRows)
    phases.paymentPageProjectIds = pageProjectIds.length
    t = Date.now()
    if (pageProjectIds.length > 0) {
      const pageProjectById = buildPageProjectById(pageProjectIds, projectById)
      const pageMouIds = computeMouIdsForProjects(pageProjectById.values())
      await loadMouPaymentMaps(supabase as never, pageMouIds, pageProjectById)
    }
    phases.mouPayment = Date.now() - t
    phases.paymentProjectIds = pageProjectIds.length
  }

  t = Date.now()
  await enrichPortalRowGrantFields(supabase as never, pageRows, projectById)
  phases.grantPageEnrich = Date.now() - t
  phases.grantMaps = (phases.grantFilterMeta as number) + (phases.grantPageEnrich as number)

  phases.historicalF4 = 'N/A'
  phases.total = Date.now() - tTotal
  return { scenarioKey, variant, phases }
}

async function main() {
  loadEnvLocal()
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
  const scenarios = await discoverScenarios(supabase)

  console.log(JSON.stringify({ methodology: 'query-replay via service role; NOT HTTP E2E', ref: process.env.NEXT_PUBLIC_SUPABASE_URL }, null, 2))

  const f4Results = []
  for (const [key, scope] of Object.entries(scenarios)) {
    if (!scope) continue
    f4Results.push(await profileF4(supabase, scope, key, defaultF4Query(), 'default'))
  }

  const admin = scenarios.A
  const f4AdminVariants = []
  if (admin) {
    const q = defaultF4Query()
    f4AdminVariants.push(
      await profileF4(supabase, admin, 'A', { ...q, sortBy: 'amount_sdg', sortDir: 'desc' }, 'sort_amount_sdg')
    )
    f4AdminVariants.push(
      await profileF4(supabase, admin, 'A', { ...q, sortBy: 'total_grant', sortDir: 'desc' }, 'sort_total_grant')
    )
    f4AdminVariants.push(
      await profileF4(supabase, admin, 'A', { ...q, sortBy: 'payment_date', sortDir: 'desc' }, 'sort_payment_date')
    )
    f4AdminVariants.push(
      await profileF4(supabase, admin, 'A', { ...q, sortBy: 'exchange_rate', sortDir: 'desc' }, 'sort_exchange_rate')
    )
    f4AdminVariants.push(await profileF4(supabase, admin, 'A', { ...q, completion: 'all' }, 'completion_all'))
  }

  const f5Default = []
  for (const [key, scope] of Object.entries(scenarios)) {
    if (!scope) continue
    f5Default.push(await profileF5(supabase, scope, key, defaultF5Query(), 'default'))
  }

  const f5Variants = []
  if (admin) {
    const q = defaultF5Query()
    f5Variants.push(await profileF5(supabase, admin, 'A', { ...q, filters: { ...q.filters, endActivityStatuses: ['complete'] } }, 'end_complete'))
    f5Variants.push(await profileF5(supabase, admin, 'A', { ...q, filters: { ...q.filters, endActivityStatuses: ['missing'] } }, 'end_missing'))
    f5Variants.push(await profileF5(supabase, admin, 'A', { ...q, sortBy: 'activities_count', sortDir: 'desc' }, 'sort_activities'))
    f5Variants.push(await profileF5(supabase, admin, 'A', { ...q, sortBy: 'amount_sdg', sortDir: 'desc' }, 'sort_amount_sdg'))
    f5Variants.push(await profileF5(supabase, admin, 'A', { ...q, sortBy: 'payment_date', sortDir: 'desc' }, 'sort_payment_date'))
    f5Variants.push(await profileF5(supabase, admin, 'A', { ...q, sortBy: 'exchange_rate', sortDir: 'desc' }, 'sort_exchange_rate'))
    f5Variants.push(await profileF5(supabase, admin, 'A', { ...q, completion: 'all' }, 'completion_all'))
  }

  console.log('\n--- F4 default ---')
  console.log(JSON.stringify(f4Results, null, 2))
  console.log('\n--- F4 admin sort variants ---')
  console.log(JSON.stringify(f4AdminVariants, null, 2))
  console.log('\n--- F5 default ---')
  console.log(JSON.stringify(f5Default, null, 2))
  console.log('\n--- F5 admin variants ---')
  console.log(JSON.stringify(f5Variants, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
