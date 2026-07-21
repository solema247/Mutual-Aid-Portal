import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { getUserStateAccess } from '@/lib/userStateAccess'

const SUPABASE_IN_BATCH = 80

function chunkIds<T extends string | number>(ids: T[]): T[][] {
  if (ids.length === 0) return []
  const out: T[][] = []
  for (let i = 0; i < ids.length; i += SUPABASE_IN_BATCH) {
    out.push(ids.slice(i, i + SUPABASE_IN_BATCH))
  }
  return out
}

function sumPlanFromPlannedActivities(planned: unknown): number {
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

function sumPlanFromExpenses(expenses: unknown): number {
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

function resolveRoom(row: unknown): { name?: string; name_ar?: string; err_code?: string } | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  const room = r.emergency_rooms
  if (Array.isArray(room)) return (room[0] as { name?: string; name_ar?: string; err_code?: string }) ?? null
  return (room as { name?: string; name_ar?: string; err_code?: string }) ?? null
}

function resolveDonor(row: unknown): { name?: string; short_name?: string } | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  const donor = r.donors
  if (Array.isArray(donor)) return (donor[0] as { name?: string; short_name?: string }) ?? null
  return (donor as { name?: string; short_name?: string }) ?? null
}

function baseRoomLabel(project: Record<string, unknown>): string | null {
  const room = resolveRoom(project)
  return room?.name || room?.name_ar || room?.err_code || null
}

function donorLabel(project: Record<string, unknown>): string | null {
  const donor = resolveDonor(project)
  return donor?.name || donor?.short_name || null
}

function grantCallIdForProject(
  project: Record<string, unknown>,
  gridGrantIdByUuid: Map<string, string>
): string | null {
  const gridId = project.grant_grid_id != null ? String(project.grant_grid_id) : ''
  if (!gridId) return null
  const grantId = gridGrantIdByUuid.get(gridId)
  return grantId != null && grantId.trim() !== '' ? grantId.trim() : null
}

function grantNameForProject(
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

async function loadGrantNameMaps(
  supabase: ReturnType<typeof getSupabaseRouteClient>,
  projects: Record<string, unknown>[]
): Promise<{
  gridById: Map<string, string>
  gridByGrantKey: Map<string, string>
  gridGrantIdByUuid: Map<string, string>
}> {
  const gridById = new Map<string, string>()
  const gridByGrantKey = new Map<string, string>()
  const gridGrantIdByUuid = new Map<string, string>()

  const gridIds = [
    ...new Set(
      projects
        .map((p) => (p.grant_grid_id != null ? String(p.grant_grid_id) : ''))
        .filter(Boolean)
    ),
  ]
  const grantKeys = [
    ...new Set(
      projects.flatMap((p) => {
        const keys: string[] = []
        if (p.grant_serial_id) keys.push(String(p.grant_serial_id).trim())
        if (p.grant_id) keys.push(String(p.grant_id).trim())
        return keys.filter(Boolean)
      })
    ),
  ]

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
        if (name) {
          gridById.set(id, name)
        }
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

function grantAmountUsd(project: Record<string, unknown>): number {
  const source = project.source
  if (source === 'mutual_aid_portal') {
    return sumPlanFromExpenses(project.expenses)
  }
  return sumPlanFromPlannedActivities(project.planned_activities)
}

function hasGrantReference(project: Record<string, unknown>): boolean {
  const grant = project.grant_serial_id ?? project.grant_id
  return grant != null && String(grant).trim() !== ''
}

function isEligibleWithoutF5Report(project: Record<string, unknown>, hasReport: boolean): boolean {
  if (hasReport) return false

  // Marked complete in err_projects but no uploaded F5 — include as complete_no_report
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

async function fetchProjectIdsInScope(
  supabase: ReturnType<typeof getSupabaseRouteClient>,
  allowedStateNames: string[] | null
): Promise<string[]> {
  if (allowedStateNames !== null && allowedStateNames.length === 0) {
    return []
  }

  let query = supabase.from('err_projects').select('id')
  if (allowedStateNames !== null && allowedStateNames.length > 0) {
    query = query.in('state', allowedStateNames)
  }

  const { data, error } = await query
  if (error) throw error
  return (data || []).map((row: { id: string }) => row.id)
}

async function fetchPortalReports(
  supabase: ReturnType<typeof getSupabaseRouteClient>,
  allowedStateNames: string[] | null,
  portalSelect: string
): Promise<Record<string, unknown>[]> {
  if (allowedStateNames !== null && allowedStateNames.length === 0) {
    return []
  }

  if (allowedStateNames === null) {
    const { data, error } = await supabase
      .from('err_program_report')
      .select(portalSelect)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data || []) as unknown as Record<string, unknown>[]
  }

  const projectIds = await fetchProjectIdsInScope(supabase, allowedStateNames)
  if (projectIds.length === 0) return []

  const reports: Record<string, unknown>[] = []
  for (const batch of chunkIds(projectIds)) {
    const { data, error } = await supabase
      .from('err_program_report')
      .select(portalSelect)
      .in('project_id', batch)
      .order('created_at', { ascending: false })
    if (error) throw error
    reports.push(...((data || []) as unknown as Record<string, unknown>[]))
  }
  return reports
}

function buildProjectRowFields(
  project: Record<string, unknown>,
  projectId: string,
  gridById: Map<string, string>,
  gridByGrantKey: Map<string, string>,
  gridGrantIdByUuid: Map<string, string>,
  transferDateByProject: Record<string, string>,
  rateByProject: Record<string, number>
) {
  const planUsd = grantAmountUsd(project)
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

export async function GET() {
  try {
    const supabase = getSupabaseRouteClient()
    const { allowedStateNames } = await getUserStateAccess()

    const projectSelect = `
      id,
      err_id,
      state,
      grant_id,
      grant_serial_id,
      donor_id,
      mou_id,
      date_transfer,
      expenses,
      planned_activities,
      source,
      status,
      funding_status,
      f5_status,
      grant_grid_id,
      emergency_room_id,
      emergency_rooms ( id, name, name_ar, err_code, type ),
      donors ( name, short_name )
    `

    if (allowedStateNames !== null && allowedStateNames.length === 0) {
      return NextResponse.json([])
    }

    let projectsQuery = supabase
      .from('err_projects')
      .select(projectSelect)
      .in('status', ['active', 'approved', 'completed'])

    if (allowedStateNames !== null && allowedStateNames.length > 0) {
      projectsQuery = projectsQuery.in('state', allowedStateNames)
    }

    const { data: projects, error: projectsError } = await projectsQuery
    if (projectsError) throw projectsError

    const projectById = new Map<string, Record<string, unknown>>()
    for (const p of projects || []) {
      projectById.set(String((p as { id: string }).id), p as Record<string, unknown>)
    }

    const portalSelect = `
        id,
        project_id,
        report_date,
        created_at,
        err_projects (
          err_id,
          state,
          donor_id,
          grant_id,
          grant_serial_id,
          mou_id,
          date_transfer,
          expenses,
          planned_activities,
          source,
          status,
          funding_status,
          f5_status,
          grant_grid_id,
          emergency_room_id,
          emergency_rooms ( id, name, name_ar, err_code, type ),
          donors ( name, short_name )
        )
      `

    const reports = await fetchPortalReports(supabase, allowedStateNames, portalSelect)

    const allProjectsForGrants = Array.from(projectById.values())
    const { gridById, gridByGrantKey, gridGrantIdByUuid } = await loadGrantNameMaps(supabase, allProjectsForGrants)

    const mouIds = Array.from(
      new Set(
        [...(projects || []), ...reports.map((r) => r.err_projects)].flatMap((item) => {
          const p = item as Record<string, unknown> | null | undefined
          if (!p) return []
          const mouId = p.mou_id
          return mouId ? [String(mouId)] : []
        })
      )
    )

    const transferDateByProject: Record<string, string> = {}
    const rateByProject: Record<string, number> = {}

    if (mouIds.length > 0) {
      for (const batch of chunkIds(mouIds)) {
        const { data: mousRows } = await supabase
          .from('mous')
          .select('id, exchange_rate, payment_confirmation_file')
          .in('id', batch)
        for (const mou of mousRows || []) {
          const raw = (mou as { payment_confirmation_file?: string }).payment_confirmation_file
          if (raw && typeof raw === 'string') {
            try {
              const parsed = JSON.parse(raw) as Record<string, { transfer_date?: string; exchange_rate?: number }>
              for (const [projectId, data] of Object.entries(parsed)) {
                const d = data?.transfer_date
                if (d && typeof d === 'string') transferDateByProject[projectId] = d
                const rateVal = data?.exchange_rate
                if (rateVal != null && !Number.isNaN(Number(rateVal))) {
                  rateByProject[projectId] = Number(rateVal)
                }
              }
            } catch {
              // ignore invalid JSON
            }
          }
          const mouRate = (mou as { exchange_rate?: number }).exchange_rate
          if (typeof mouRate === 'number' && mouRate > 0) {
            for (const [pid, project] of projectById) {
              if (String(project.mou_id) === String((mou as { id: string }).id) && rateByProject[pid] == null) {
                rateByProject[pid] = mouRate
              }
            }
          }
        }
      }
    }

    for (const r of reports) {
      const pid = r.project_id
      if (pid && !projectById.has(String(pid))) {
        const prj = (Array.isArray(r.err_projects) ? r.err_projects[0] : r.err_projects) as Record<string, unknown> | null
        if (prj) projectById.set(String(pid), prj)
      }
    }

    const reportProjectIds = new Set<string>()
    for (const r of reports) {
      const pid = r.project_id
      if (pid) reportProjectIds.add(String(pid))
    }

    const reachCounts: Record<string, number> = {}
    const reachHasEndDate: Record<string, boolean> = {}
    const reportIds = reports.map((r) => r.id).filter(Boolean) as string[]
    if (reportIds.length) {
      for (const batch of chunkIds(reportIds)) {
        const { data: reach } = await supabase
          .from('err_program_reach')
          .select('report_id, end_date')
          .in('report_id', batch)
        for (const row of reach || []) {
          const sid = String((row as { report_id: string }).report_id)
          reachCounts[sid] = (reachCounts[sid] || 0) + 1
          if ((row as { end_date: string | null }).end_date) {
            reachHasEndDate[sid] = true
          }
        }
      }
    }

    const rows: Record<string, unknown>[] = []

    for (const r of reports) {
      const prj = (Array.isArray(r.err_projects) ? r.err_projects[0] : r.err_projects) as Record<string, unknown> | null
      const projectId = r.project_id ? String(r.project_id) : null
      const project = (projectId && projectById.get(projectId)) || prj || {}
      const fields = projectId
        ? buildProjectRowFields(
            project,
            projectId,
            gridById,
            gridByGrantKey,
            gridGrantIdByUuid,
            transferDateByProject,
            rateByProject
          )
        : {
            base_room_name: baseRoomLabel(project),
            err_id: project.err_id ?? null,
            grant_serial_id: project.grant_serial_id ?? project.grant_id ?? null,
            grant_id: project.grant_id ?? null,
            grant_call_id: grantCallIdForProject(project, gridGrantIdByUuid),
            grant_name: grantNameForProject(project, gridById, gridByGrantKey),
            state: project.state ?? null,
            donor: donorLabel(project),
            payment_date: null,
            amount_sdg: null,
            exchange_rate: null,
          }

      const reportId = String(r.id)
      rows.push({
        id: r.id,
        project_id: projectId,
        ...fields,
        report_date: r.report_date ?? null,
        activities_count: reachCounts[reportId] || 0,
        updated_at: r.created_at,
        has_f5_report: true,
        report_status: 'uploaded',
        end_activity_status: reachHasEndDate[reportId] ? 'complete' : 'missing',
      })
    }

    for (const [projectId, project] of projectById) {
      if (reportProjectIds.has(projectId)) continue
      if (!isEligibleWithoutF5Report(project, false)) continue

      const f5Status =
        project.f5_status != null ? String(project.f5_status).trim().toLowerCase() : null

      rows.push({
        id: null,
        project_id: projectId,
        ...buildProjectRowFields(
          project,
          projectId,
          gridById,
          gridByGrantKey,
          gridGrantIdByUuid,
          transferDateByProject,
          rateByProject
        ),
        report_date: null,
        activities_count: 0,
        updated_at: null,
        has_f5_report: false,
        report_status: f5Status === 'completed' ? 'complete_no_report' : 'not_uploaded',
        end_activity_status: null,
      })
    }

    rows.sort((a, b) => {
      const ta = a.updated_at ? new Date(String(a.updated_at)).getTime() : 0
      const tb = b.updated_at ? new Date(String(b.updated_at)).getTime() : 0
      return tb - ta
    })

    return NextResponse.json(rows)
  } catch (e) {
    console.error('F5 list error', e)
    return NextResponse.json({ error: 'Failed to fetch F5 list' }, { status: 500 })
  }
}
