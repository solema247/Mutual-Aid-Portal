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

function computeReportStatus(args: {
  has_f4_report: boolean
  activities_raw_import_id: unknown
  review_status: unknown
}): string {
  if (args.activities_raw_import_id) return 'historical'
  if (!args.has_f4_report) return 'not_uploaded'
  const status = String(args.review_status ?? 'pending_review').trim().toLowerCase()
  if (status === 'accepted') return 'accepted'
  if (status === 'rejected') return 'rejected'
  return 'pending_review'
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
): Promise<{ gridById: Map<string, string>; gridByGrantKey: Map<string, string> }> {
  const gridById = new Map<string, string>()
  const gridByGrantKey = new Map<string, string>()

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
        const name = (row as { project_name?: string }).project_name
        if (name) {
          gridById.set(String((row as { id: string }).id), name)
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

  return { gridById, gridByGrantKey }
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

/** Projects that should appear with Upload F4 when no err_summary exists (aligned with UploadF4Modal). */
function isEligibleWithoutF4Report(project: Record<string, unknown>, hasSummary: boolean): boolean {
  if (hasSummary) return false

  const f4Status = project.f4_status != null ? String(project.f4_status).trim().toLowerCase() : null
  if (f4Status === 'completed') return false

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

async function fetchPortalSummaries(
  supabase: ReturnType<typeof getSupabaseRouteClient>,
  allowedStateNames: string[] | null,
  portalSelect: string
): Promise<Record<string, unknown>[]> {
  if (allowedStateNames !== null && allowedStateNames.length === 0) {
    return []
  }

  if (allowedStateNames === null) {
    const { data, error } = await supabase
      .from('err_summary')
      .select(portalSelect)
      .is('activities_raw_import_id', null)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data || []) as unknown as Record<string, unknown>[]
  }

  const projectIds = await fetchProjectIdsInScope(supabase, allowedStateNames)
  if (projectIds.length === 0) return []

  const summaries: Record<string, unknown>[] = []
  for (const batch of chunkIds(projectIds)) {
    const { data, error } = await supabase
      .from('err_summary')
      .select(portalSelect)
      .is('activities_raw_import_id', null)
      .in('project_id', batch)
      .order('created_at', { ascending: false })
    if (error) throw error
    summaries.push(...((data || []) as unknown as Record<string, unknown>[]))
  }
  return summaries
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
      f4_status,
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
      .in('status', ['active', 'approved'])

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
        activities_raw_import_id,
        report_date,
        total_grant,
        total_expenses,
        remainder,
        created_at,
        review_status,
        review_comment,
        reviewed_at,
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
          f4_status,
          grant_grid_id,
          emergency_room_id,
          emergency_rooms ( id, name, name_ar, err_code, type ),
          donors ( name, short_name )
        )
      `

    const summaries = await fetchPortalSummaries(supabase, allowedStateNames, portalSelect)

    const allProjectsForGrants = Array.from(projectById.values())
    const { gridById, gridByGrantKey } = await loadGrantNameMaps(supabase, allProjectsForGrants)

    // Historical F4 reports (unchanged)
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

    const importById: Record<string, Record<string, unknown>> = {}
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

    let filteredHistorical = historicalSummaries || []
    if (allowedStateNames !== null && allowedStateNames.length > 0) {
      filteredHistorical = (historicalSummaries || []).filter((s: Record<string, unknown>) => {
        const raw = s.activities_raw_import
        const nested = (Array.isArray(raw) ? raw[0] : raw) || {}
        const imp = importById[String(s.activities_raw_import_id)] || {}
        const state = (nested as Record<string, unknown>)['State'] ?? imp['State']
        return state && allowedStateNames.includes(String(state))
      })
    }

    const mouIds = Array.from(
      new Set(
        [...(projects || []), ...summaries.map((s) => s.err_projects)].flatMap((item) => {
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

    for (const s of summaries) {
      const pid = s.project_id
      if (pid && !projectById.has(String(pid))) {
        const prj = (Array.isArray(s.err_projects) ? s.err_projects[0] : s.err_projects) as Record<string, unknown> | null
        if (prj) projectById.set(String(pid), prj)
      }
    }

    const summaryProjectIds = new Set<string>()
    for (const s of summaries) {
      const pid = s.project_id
      if (pid) summaryProjectIds.add(String(pid))
    }

    const attachCounts: Record<number, number> = {}
    const allSummaryIds = [
      ...summaries.map((s) => s.id),
      ...filteredHistorical.map((s: { id: number }) => s.id),
    ].filter(Boolean) as number[]

    if (allSummaryIds.length) {
      for (const batch of chunkIds(allSummaryIds)) {
        const { data: atts } = await supabase
          .from('err_summary_attachments')
          .select('summary_id')
          .in('summary_id', batch)
        for (const a of atts || []) {
          attachCounts[(a as { summary_id: number }).summary_id] =
            (attachCounts[(a as { summary_id: number }).summary_id] || 0) + 1
        }
      }
    }

    const rows: Record<string, unknown>[] = []

    for (const s of summaries) {
      const prj = (Array.isArray(s.err_projects) ? s.err_projects[0] : s.err_projects) as Record<string, unknown> | null
      const projectId = s.project_id ? String(s.project_id) : null
      const project = (projectId && projectById.get(projectId)) || prj || {}
      const planUsd = grantAmountUsd(project)
      const rate = projectId ? rateByProject[projectId] ?? null : null
      const paymentDate =
        (projectId && (transferDateByProject[projectId] || (project.date_transfer as string | null))) ?? null
      const amountSdg =
        rate != null && planUsd > 0 ? Math.round(planUsd * rate) : null

      rows.push({
        id: s.id,
        project_id: projectId,
        activities_raw_import_id: null,
        base_room_name: baseRoomLabel(project),
        err_id: project.err_id ?? null,
        grant_serial_id: project.grant_serial_id ?? project.grant_id ?? null,
        grant_id: project.grant_id ?? null,
        grant_name: grantNameForProject(project, gridById, gridByGrantKey),
        state: project.state ?? null,
        donor: donorLabel(project),
        payment_date: paymentDate,
        amount_sdg: amountSdg,
        exchange_rate: rate,
        report_date: s.report_date ?? null,
        total_grant: s.total_grant ?? planUsd ?? null,
        total_expenses: s.total_expenses ?? null,
        remainder: s.remainder ?? null,
        attachments_count: attachCounts[(s.id as number)] || 0,
        updated_at: s.created_at,
        review_status: s.review_status || 'pending_review',
        review_comment: s.review_comment ?? null,
        reviewed_at: s.reviewed_at ?? null,
        has_f4_report: true,
        report_status: computeReportStatus({
          has_f4_report: true,
          activities_raw_import_id: null,
          review_status: s.review_status || 'pending_review',
        }),
      })
    }

    for (const [projectId, project] of projectById) {
      if (summaryProjectIds.has(projectId)) continue
      if (!isEligibleWithoutF4Report(project, false)) continue

      const planUsd = grantAmountUsd(project)
      const rate = rateByProject[projectId] ?? null
      const paymentDate = transferDateByProject[projectId] || (project.date_transfer as string | null) || null
      const amountSdg = rate != null && planUsd > 0 ? Math.round(planUsd * rate) : null

      rows.push({
        id: null,
        project_id: projectId,
        activities_raw_import_id: null,
        base_room_name: baseRoomLabel(project),
        err_id: project.err_id ?? null,
        grant_serial_id: project.grant_serial_id ?? project.grant_id ?? null,
        grant_id: project.grant_id ?? null,
        grant_name: grantNameForProject(project, gridById, gridByGrantKey),
        state: project.state ?? null,
        donor: donorLabel(project),
        payment_date: paymentDate,
        amount_sdg: amountSdg,
        exchange_rate: rate,
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
        report_status: computeReportStatus({
          has_f4_report: false,
          activities_raw_import_id: null,
          review_status: null,
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
        attachments_count: attachCounts[(s.id as number)] || 0,
        updated_at: s.created_at,
        review_status: s.review_status || 'pending_review',
        review_comment: s.review_comment ?? null,
        reviewed_at: s.reviewed_at ?? null,
        has_f4_report: true,
        report_status: computeReportStatus({
          has_f4_report: true,
          activities_raw_import_id: s.activities_raw_import_id,
          review_status: s.review_status || 'pending_review',
        }),
      })
    }

    rows.sort((a, b) => {
      const ta = a.updated_at ? new Date(String(a.updated_at)).getTime() : 0
      const tb = b.updated_at ? new Date(String(b.updated_at)).getTime() : 0
      return tb - ta
    })

    return NextResponse.json(rows)
  } catch (e) {
    console.error('F4 list error', e)
    return NextResponse.json({ error: 'Failed to fetch F4 list' }, { status: 500 })
  }
}
