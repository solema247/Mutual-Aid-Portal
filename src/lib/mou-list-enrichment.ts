import type { MouAssignmentStatus } from '@/app/err-portal/f3-mous/types'

export interface MouProjectListRow {
  mou_id: string | null
  grant_id?: string | null
  grant_grid_id?: string | null
  funding_status?: string | null
  status?: string | null
  expenses?: unknown
}

export interface MouListEnrichment {
  grantIds: Record<string, string>
  projectCounts: Record<string, number>
  paymentProjectCounts: Record<string, number>
  assignmentStatus: Record<string, MouAssignmentStatus>
}

export interface MousListApiResponse {
  mous: unknown[]
  grantIds: Record<string, string>
  projectCounts: Record<string, number>
  paymentProjectCounts: Record<string, number>
  assignmentStatus: Record<string, MouAssignmentStatus>
}

export function sumProjectExpenses(exp: unknown): number {
  const arr =
    typeof exp === 'string'
      ? JSON.parse(exp || '[]')
      : Array.isArray(exp)
        ? exp
        : []
  return arr.reduce((sum: number, e: { total_cost?: number }) => sum + (e?.total_cost || 0), 0)
}

export function computeAssignmentStatus(
  projects: { grant_id: string | null }[]
): MouAssignmentStatus {
  const projectCount = projects.length
  const hasUnassigned =
    projectCount > 0 &&
    projects.some((p) => !p.grant_id || !p.grant_id.startsWith('LCC-'))
  const hasAssigned =
    projectCount > 0 &&
    projects.some((p) => p.grant_id && p.grant_id.startsWith('LCC-'))
  return { hasUnassigned, hasAssigned, projectCount }
}

export function aggregateMouEnrichment(
  projects: MouProjectListRow[],
  grantIdByGridId: Record<string, string> = {}
): MouListEnrichment {
  const byMouId = new Map<string, MouProjectListRow[]>()

  for (const project of projects) {
    if (!project.mou_id) continue
    const list = byMouId.get(project.mou_id) ?? []
    list.push(project)
    byMouId.set(project.mou_id, list)
  }

  const grantIds: Record<string, string> = {}
  const projectCounts: Record<string, number> = {}
  const paymentProjectCounts: Record<string, number> = {}
  const assignmentStatus: Record<string, MouAssignmentStatus> = {}

  for (const [mouId, mouProjects] of byMouId) {
    assignmentStatus[mouId] = computeAssignmentStatus(
      mouProjects.map((p) => ({ grant_id: p.grant_id ?? null }))
    )
    paymentProjectCounts[mouId] = mouProjects.length
    projectCounts[mouId] = mouProjects.filter(
      (p) =>
        p.funding_status === 'committed' &&
        (p.status === 'approved' || p.status === 'completed')
    ).length

    const gridId = mouProjects.find((p) => p.grant_grid_id)?.grant_grid_id
    if (gridId && grantIdByGridId[gridId]) {
      grantIds[mouId] = grantIdByGridId[gridId]
    }
  }

  return { grantIds, projectCounts, paymentProjectCounts, assignmentStatus }
}

export function sumExpensesByMouId(projects: MouProjectListRow[]): Record<string, number> {
  const totalByMouId: Record<string, number> = {}
  for (const project of projects) {
    if (!project.mou_id) continue
    totalByMouId[project.mou_id] =
      (totalByMouId[project.mou_id] || 0) + sumProjectExpenses(project.expenses)
  }
  return totalByMouId
}

const emptyEnrichment = (): MouListEnrichment => ({
  grantIds: {},
  projectCounts: {},
  paymentProjectCounts: {},
  assignmentStatus: {},
})

/** Accept enriched `{ mous, ... }` or legacy bare MOU array. */
export function parseMousListResponse(data: unknown): MousListApiResponse {
  if (Array.isArray(data)) {
    return { mous: data, ...emptyEnrichment() }
  }
  if (data && typeof data === 'object' && 'mous' in data) {
    const payload = data as Partial<MousListApiResponse>
    return {
      mous: Array.isArray(payload.mous) ? payload.mous : [],
      grantIds: payload.grantIds ?? {},
      projectCounts: payload.projectCounts ?? {},
      paymentProjectCounts: payload.paymentProjectCounts ?? {},
      assignmentStatus: payload.assignmentStatus ?? {},
    }
  }
  return { mous: [], ...emptyEnrichment() }
}
