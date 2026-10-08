import type { SupabaseClient } from '@supabase/supabase-js'
import { chunkGrantScopeIds } from '@/lib/userGrantAccess'

export const SUPABASE_IN_BATCH = 80

export function chunkIds<T extends string | number>(ids: T[]): T[][] {
  if (ids.length === 0) return []
  const out: T[][] = []
  for (let i = 0; i < ids.length; i += SUPABASE_IN_BATCH) {
    out.push(ids.slice(i, i + SUPABASE_IN_BATCH))
  }
  return out
}

export const SLIM_PROJECT_SELECT = `
  id,
  err_id,
  state,
  locality,
  grant_id,
  grant_serial_id,
  donor_id,
  mou_id,
  date_transfer,
  source,
  status,
  funding_status,
  f4_status,
  f5_status,
  grant_grid_id,
  emergency_room_id,
  emergency_rooms ( id, name, name_ar, err_code, type ),
  donors ( name, short_name )
`

export function sumPlanFromPlannedActivities(planned: unknown): number {
  try {
    const arr = Array.isArray(planned)
      ? planned
      : typeof planned === 'string'
        ? JSON.parse(planned || '[]')
        : []
    return (arr || []).reduce((s: number, a: { expenses?: { total?: number }[] }) => {
      const exps = Array.isArray(a?.expenses) ? a.expenses : []
      return s + exps.reduce((ss: number, e) => ss + (Number(e?.total) || 0), 0)
    }, 0)
  } catch {
    return 0
  }
}

export function sumPlanFromExpenses(expenses: unknown): number {
  try {
    const arr = Array.isArray(expenses)
      ? expenses
      : typeof expenses === 'string'
        ? JSON.parse(expenses || '[]')
        : []
    return (arr || []).reduce((s: number, e: { total_cost?: number }) => s + (Number(e?.total_cost) || 0), 0)
  } catch {
    return 0
  }
}

export function resolveRoom(row: unknown): { name?: string; name_ar?: string; err_code?: string } | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  const room = r.emergency_rooms
  if (Array.isArray(room)) return (room[0] as { name?: string; name_ar?: string; err_code?: string }) ?? null
  return (room as { name?: string; name_ar?: string; err_code?: string }) ?? null
}

export function resolveDonor(row: unknown): { name?: string; short_name?: string } | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  const donor = r.donors
  if (Array.isArray(donor)) return (donor[0] as { name?: string; short_name?: string }) ?? null
  return (donor as { name?: string; short_name?: string }) ?? null
}

export function baseRoomLabel(project: Record<string, unknown>): string | null {
  const room = resolveRoom(project)
  return room?.name || room?.name_ar || room?.err_code || null
}

export function donorLabel(project: Record<string, unknown>): string | null {
  const donor = resolveDonor(project)
  return donor?.name || donor?.short_name || null
}

export function grantAmountUsd(project: Record<string, unknown>): number {
  const source = project.source
  if (source === 'mutual_aid_portal') {
    return sumPlanFromExpenses(project.expenses)
  }
  return sumPlanFromPlannedActivities(project.planned_activities)
}

export function hasGrantReference(project: Record<string, unknown>): boolean {
  const grant = project.grant_serial_id ?? project.grant_id
  return grant != null && String(grant).trim() !== ''
}

export function computeF4ReportStatus(args: {
  has_f4_report: boolean
  activities_raw_import_id: unknown
  review_status: unknown
  f4_status?: unknown
}): string {
  if (args.activities_raw_import_id) return 'historical'
  if (!args.has_f4_report) {
    const f4Status = args.f4_status != null ? String(args.f4_status).trim().toLowerCase() : null
    if (f4Status === 'completed') return 'complete_no_report'
    return 'not_uploaded'
  }
  const status = String(args.review_status ?? 'pending_review').trim().toLowerCase()
  if (status === 'accepted') return 'accepted'
  if (status === 'rejected') return 'rejected'
  return 'pending_review'
}

export function isEligibleWithoutF4Report(project: Record<string, unknown>, hasSummary: boolean): boolean {
  if (hasSummary) return false
  const f4Status = project.f4_status != null ? String(project.f4_status).trim().toLowerCase() : null
  if (f4Status === 'completed') return true
  const status = String(project.status ?? '').trim().toLowerCase()
  if (status === 'active') return true
  if (status === 'approved' && project.funding_status === 'committed') return true
  if (project.funding_status === 'committed') return true
  if (project.date_transfer) return true
  if (project.mou_id) return true
  if (hasGrantReference(project)) return true
  return false
}

export function isEligibleWithoutF5Report(project: Record<string, unknown>, hasReport: boolean): boolean {
  if (hasReport) return false
  const f5Status = project.f5_status != null ? String(project.f5_status).trim().toLowerCase() : null
  if (f5Status === 'completed') return true
  const status = String(project.status ?? '').trim().toLowerCase()
  if (status === 'active') return true
  if (status === 'approved' && project.funding_status === 'committed') return true
  if (project.funding_status === 'committed') return true
  if (project.date_transfer) return true
  if (project.mou_id) return true
  if (hasGrantReference(project)) return true
  return false
}

export function grantCallIdForProject(
  project: Record<string, unknown>,
  gridGrantIdByUuid: Map<string, string>
): string | null {
  const gridId = project.grant_grid_id != null ? String(project.grant_grid_id) : ''
  if (!gridId) return null
  const grantId = gridGrantIdByUuid.get(gridId)
  return grantId != null && grantId.trim() !== '' ? grantId.trim() : null
}

export function grantNameForProject(
  project: Record<string, unknown>,
  gridById: Map<string, string>,
  gridByGrantKey: Map<string, string>
): string | null {
  const gridId = project.grant_grid_id != null ? String(project.grant_grid_id) : ''
  if (gridId && gridById.has(gridId)) return gridById.get(gridId) ?? null
  for (const key of [project.grant_serial_id, project.grant_id]) {
    if (key == null) continue
    const normalized = String(key).trim()
    if (normalized && gridByGrantKey.has(normalized)) {
      return gridByGrantKey.get(normalized) ?? null
    }
  }
  return null
}

export function uniqueGrantGridIdsFromProjects(projects: Record<string, unknown>[]): string[] {
  return [
    ...new Set(
      projects
        .map((p) => (p.grant_grid_id != null ? String(p.grant_grid_id) : ''))
        .filter(Boolean)
    ),
  ]
}

export function uniqueGrantKeysFromProjects(projects: Record<string, unknown>[]): string[] {
  return [
    ...new Set(
      projects.flatMap((p) => {
        const keys: string[] = []
        if (p.grant_serial_id) keys.push(String(p.grant_serial_id).trim())
        if (p.grant_id) keys.push(String(p.grant_id).trim())
        return keys.filter(Boolean)
      })
    ),
  ]
}

/** grid UUID → grants_grid_view.grant_id (canonical grant_call_id). */
export async function loadGrantCallIdMap(
  supabase: SupabaseClient,
  gridIds: string[]
): Promise<Map<string, string>> {
  const gridGrantIdByUuid = new Map<string, string>()
  if (!gridIds.length) return gridGrantIdByUuid
  for (const batch of chunkIds(gridIds)) {
    const { data } = await supabase
      .from('grants_grid_view')
      .select('id, grant_id')
      .in('id', batch)
    for (const row of data || []) {
      const id = String((row as { id: string }).id)
      const grantId = (row as { grant_id?: string | null }).grant_id
      if (grantId != null && String(grantId).trim() !== '') {
        gridGrantIdByUuid.set(id, String(grantId).trim())
      }
    }
  }
  return gridGrantIdByUuid
}

/** Display names + call-id map for a project subset (page enrichment / legacy fallback). */
export async function loadGrantDisplayNameMaps(
  supabase: SupabaseClient,
  projects: Record<string, unknown>[]
): Promise<{
  gridById: Map<string, string>
  gridByGrantKey: Map<string, string>
  gridGrantIdByUuid: Map<string, string>
}> {
  const gridById = new Map<string, string>()
  const gridByGrantKey = new Map<string, string>()
  const gridGrantIdByUuid = new Map<string, string>()

  const gridIds = uniqueGrantGridIdsFromProjects(projects)
  const grantKeys = uniqueGrantKeysFromProjects(projects)

  if (gridIds.length > 0) {
    for (const batch of chunkIds(gridIds)) {
      const { data } = await supabase
        .from('grants_grid_view')
        .select('id, project_name, grant_id')
        .in('id', batch)
      for (const row of data || []) {
        const id = String((row as { id: string }).id)
        const name = (row as { project_name?: string }).project_name
        const grantId = (row as { grant_id?: string | null }).grant_id
        if (grantId != null && String(grantId).trim() !== '') {
          gridGrantIdByUuid.set(id, String(grantId).trim())
        }
        if (name) gridById.set(id, name)
      }
    }
  }

  if (grantKeys.length > 0) {
    for (const batch of chunkIds(grantKeys)) {
      const { data } = await supabase
        .from('grants_grid_view')
        .select('project_name, grant_id')
        .in('grant_id', batch)
      for (const row of data || []) {
        const name = (row as { project_name?: string }).project_name
        const grantId = (row as { grant_id?: string }).grant_id
        if (name && grantId) {
          gridByGrantKey.set(String(grantId).trim(), name)
        }
      }
    }
  }

  return { gridById, gridByGrantKey, gridGrantIdByUuid }
}

export async function loadGrantNameMaps(
  supabase: SupabaseClient,
  projects: Record<string, unknown>[]
): Promise<{
  gridById: Map<string, string>
  gridByGrantKey: Map<string, string>
  gridGrantIdByUuid: Map<string, string>
}> {
  return loadGrantDisplayNameMaps(supabase, projects)
}

export async function buildGrantFilterMetaForProjects(
  supabase: SupabaseClient,
  projects: Record<string, unknown>[]
): Promise<{ value: string; label: string }[]> {
  const gridIds = uniqueGrantGridIdsFromProjects(projects)
  if (!gridIds.length) return []
  const gridGrantIdByUuid = await loadGrantCallIdMap(supabase, gridIds)
  const grants = new Set<string>()
  for (const gid of gridIds) {
    const callId = gridGrantIdByUuid.get(gid)
    if (callId) grants.add(callId)
  }
  return Array.from(grants)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map((value) => ({ value, label: value }))
}

export function portalProjectsForListRows(
  rows: Record<string, unknown>[],
  projectById: Map<string, Record<string, unknown>>
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const pid = row.project_id
    if (pid == null || String(pid).startsWith('historical_')) continue
    const id = String(pid)
    if (seen.has(id)) continue
    const project = projectById.get(id)
    if (project) {
      seen.add(id)
      out.push(project)
    }
  }
  return out
}

export function applyGrantCallIdToRows(
  rows: Record<string, unknown>[],
  projectById: Map<string, Record<string, unknown>>,
  gridGrantIdByUuid: Map<string, string>
) {
  for (const row of rows) {
    const pid = row.project_id
    if (pid == null || String(pid).startsWith('historical_')) continue
    const project = projectById.get(String(pid))
    if (!project) continue
    row.grant_call_id = grantCallIdForProject(project, gridGrantIdByUuid)
  }
}

export async function enrichPortalRowGrantFields(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[],
  projectById: Map<string, Record<string, unknown>>
) {
  const projects = portalProjectsForListRows(rows, projectById)
  if (!projects.length) return
  const { gridById, gridByGrantKey, gridGrantIdByUuid } = await loadGrantDisplayNameMaps(
    supabase,
    projects
  )
  for (const row of rows) {
    const pid = row.project_id
    if (pid == null || String(pid).startsWith('historical_')) continue
    const project = projectById.get(String(pid))
    if (!project) continue
    row.grant_call_id = grantCallIdForProject(project, gridGrantIdByUuid)
    row.grant_name = grantNameForProject(project, gridById, gridByGrantKey)
  }
}

export const EMPTY_GRANT_STRING_MAP = new Map<string, string>()

export function computeF4PlanNeeded(
  projectById: Map<string, Record<string, unknown>>,
  summaries: Record<string, unknown>[]
): Set<string> {
  const summaryProjectIds = new Set<string>()
  for (const s of summaries) {
    const pid = s.project_id
    if (pid) summaryProjectIds.add(String(pid))
  }
  const planNeeded = new Set<string>()
  for (const s of summaries) {
    const pid = s.project_id ? String(s.project_id) : ''
    if (pid && (s.total_grant == null || s.total_grant === '')) planNeeded.add(pid)
  }
  for (const [projectId, project] of projectById) {
    if (summaryProjectIds.has(projectId)) continue
    if (!isEligibleWithoutF4Report(project, false)) continue
    planNeeded.add(projectId)
  }
  return planNeeded
}

export function computeF5PlanNeeded(
  projectById: Map<string, Record<string, unknown>>,
  reports: Record<string, unknown>[]
): Set<string> {
  const reportProjectIds = new Set<string>()
  for (const r of reports) {
    const pid = r.project_id
    if (pid) reportProjectIds.add(String(pid))
  }
  const planNeeded = new Set<string>()
  for (const [projectId, project] of projectById) {
    if (reportProjectIds.has(projectId)) continue
    if (!isEligibleWithoutF5Report(project, false)) continue
    planNeeded.add(projectId)
  }
  for (const r of reports) {
    const pid = r.project_id ? String(r.project_id) : ''
    if (pid) planNeeded.add(pid)
  }
  return planNeeded
}

/** Page Path A: skip plan fetch when summary already supplies total_grant (amount_sdg stays null). */
export function computeF4PlanNeededForPageRows(pageRows: Record<string, unknown>[]): string[] {
  const ids = new Set<string>()
  for (const row of pageRows) {
    const pid = row.project_id
    if (pid == null || String(pid).startsWith('historical_')) continue
    const id = String(pid)
    if (row.has_f4_report === false) {
      ids.add(id)
      continue
    }
    if (row.total_grant == null || row.total_grant === '') {
      ids.add(id)
    }
  }
  return [...ids]
}

export function computeF5PlanNeededForPageRows(pageRows: Record<string, unknown>[]): string[] {
  const ids = new Set<string>()
  for (const row of pageRows) {
    const pid = row.project_id
    if (pid == null || String(pid).startsWith('historical_')) continue
    ids.add(String(pid))
  }
  return [...ids]
}

function mergedProjectWithPlan(
  projectId: string,
  projectById: Map<string, Record<string, unknown>>,
  planByProject: Map<string, Record<string, unknown>>
): Record<string, unknown> | null {
  const base = projectById.get(projectId)
  if (!base) return null
  const extra = planByProject.get(projectId)
  return extra ? { ...base, ...extra } : base
}

export function enrichF4ListPlanFinancialFields(
  pageRows: Record<string, unknown>[],
  projectById: Map<string, Record<string, unknown>>,
  planByProject: Map<string, Record<string, unknown>>,
  rateByProject: Record<string, number>
) {
  for (const row of pageRows) {
    const pid = row.project_id
    if (pid == null || String(pid).startsWith('historical_')) continue
    const projectId = String(pid)
    if (!planByProject.has(projectId)) continue
    const project = mergedProjectWithPlan(projectId, projectById, planByProject)
    if (!project) continue
    const planUsd = grantAmountUsd(project)
    const rate = rateByProject[projectId] ?? null
    const amountSdg = rate != null && planUsd > 0 ? Math.round(planUsd * rate) : null

    if (row.has_f4_report === false) {
      row.total_grant = planUsd > 0 ? planUsd : null
      row.amount_sdg = amountSdg
      continue
    }
    const hadSummaryGrant = row.total_grant != null && row.total_grant !== ''
    if (!hadSummaryGrant) {
      row.total_grant = planUsd > 0 ? planUsd : null
      row.amount_sdg = amountSdg
    }
  }
}

export function enrichF5ListPlanFinancialFields(
  pageRows: Record<string, unknown>[],
  projectById: Map<string, Record<string, unknown>>,
  planByProject: Map<string, Record<string, unknown>>,
  rateByProject: Record<string, number>
) {
  for (const row of pageRows) {
    const pid = row.project_id
    if (pid == null || String(pid).startsWith('historical_')) continue
    const projectId = String(pid)
    if (!planByProject.has(projectId)) continue
    const project = mergedProjectWithPlan(projectId, projectById, planByProject)
    if (!project) continue
    const planUsd = grantAmountUsd(project)
    const rate = rateByProject[projectId] ?? null
    row.amount_sdg = rate != null && planUsd > 0 ? Math.round(planUsd * rate) : null
  }
}

export async function fetchPlanJsonForProjects(
  supabase: SupabaseClient,
  projectIds: string[]
): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>()
  if (!projectIds.length) return out
  for (const batch of chunkIds(projectIds)) {
    const { data, error } = await supabase
      .from('err_projects')
      .select('id, expenses, planned_activities, source')
      .in('id', batch)
    if (error) throw error
    for (const row of data || []) {
      out.set(String((row as { id: string }).id), row as Record<string, unknown>)
    }
  }
  return out
}

/** PostgREST truncates a single request (often at 1000). Page until exhausted. */
const SCOPED_PROJECTS_PAGE_SIZE = 1000

async function fetchAllProjectRows(
  buildQuery: () => any
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []
  let from = 0
  for (;;) {
    const to = from + SCOPED_PROJECTS_PAGE_SIZE - 1
    const { data, error } = await buildQuery()
      .order('id', { ascending: true })
      .range(from, to)
    if (error) throw error
    const rows = (data || []) as unknown as Record<string, unknown>[]
    if (!rows.length) break
    out.push(...rows)
    if (rows.length < SCOPED_PROJECTS_PAGE_SIZE) break
    from += SCOPED_PROJECTS_PAGE_SIZE
  }
  return out
}

export async function fetchProjectIdsInStateScope(
  supabase: SupabaseClient,
  allowedStateNames: string[] | null
): Promise<string[]> {
  if (allowedStateNames !== null && allowedStateNames.length === 0) return []
  const rows = await fetchAllProjectRows(() => {
    let query = supabase.from('err_projects').select('id')
    if (allowedStateNames !== null && allowedStateNames.length > 0) {
      query = query.in('state', allowedStateNames)
    }
    return query
  })
  return rows.map((row) => String(row.id))
}

export async function fetchScopedProjects(
  supabase: SupabaseClient,
  opts: {
    grantGridIds: string[] | null
    allowedStateNames: string[] | null
    useStateScope: boolean
    emergencyRoomId: string | null
    /** Canvas org data plane — filter err_projects.organization_id when set */
    organizationId?: string | null
  }
): Promise<Record<string, unknown>[]> {
  const statusFilter = ['active', 'approved', 'completed'] as const
  const applyOrg = <T extends { eq: (c: string, v: string) => T }>(q: T): T =>
    opts.organizationId ? q.eq('organization_id', opts.organizationId) : q

  if (opts.grantGridIds !== null) {
    const projects: Record<string, unknown>[] = []
    for (const batch of chunkGrantScopeIds(opts.grantGridIds)) {
      const batchRows = await fetchAllProjectRows(() => {
        let q = supabase
          .from('err_projects')
          .select(SLIM_PROJECT_SELECT)
          .in('status', [...statusFilter])
          .in('grant_grid_id', batch)
        if (opts.emergencyRoomId) {
          q = q.eq('emergency_room_id', opts.emergencyRoomId)
        }
        q = applyOrg(q)
        return q
      })
      projects.push(...batchRows)
    }
    return projects
  }

  return fetchAllProjectRows(() => {
    let projectsQuery = supabase
      .from('err_projects')
      .select(SLIM_PROJECT_SELECT)
      .in('status', [...statusFilter])

    if (opts.emergencyRoomId) {
      projectsQuery = projectsQuery.eq('emergency_room_id', opts.emergencyRoomId)
    } else if (opts.useStateScope && opts.allowedStateNames !== null && opts.allowedStateNames.length > 0) {
      projectsQuery = projectsQuery.in('state', opts.allowedStateNames)
    }
    projectsQuery = applyOrg(projectsQuery)
    return projectsQuery
  })
}

export function grantSearchTexts(row: { grant_serial_id?: string | null; grant_id?: string | null }): string[] {
  return [row.grant_serial_id, row.grant_id]
    .filter((v) => v != null && String(v).trim() !== '')
    .map((v) => String(v).toLowerCase().trim())
}
