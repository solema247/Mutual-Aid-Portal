import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getActivityAndCategoryLists } from '@/lib/plannedActivitiesExpenses'
import {
  computePortalActualsByProject,
  computePortalActualsFromProjectExpenses,
} from '@/lib/f4ExpenseDisplay'
import { normalizeStateName } from '@/lib/normalizeStateName'

/** PostgREST `.in()` with hundreds of UUIDs can exceed URL limits and return empty data. */
const SUPABASE_IN_BATCH = 80

/** Cache duration in milliseconds (3 minutes) */
const CACHE_DURATION_MS = 3 * 60 * 1000

/** In-memory cache for rollup data */
interface CacheEntry {
  data: any
  timestamp: number
  allowedStates: string[] | null
}

let rollupCache: CacheEntry | null = null

function getCacheKey(allowedStates: string[] | null): string {
  if (!allowedStates || allowedStates.length === 0) return 'all_states'
  return allowedStates.sort().join(',')
}

function isCacheValid(entry: CacheEntry | null, allowedStates: string[] | null): boolean {
  if (!entry) return false
  
  const now = Date.now()
  const isExpired = now - entry.timestamp > CACHE_DURATION_MS
  if (isExpired) return false
  
  // Check if state access matches
  const currentKey = getCacheKey(allowedStates)
  const cachedKey = getCacheKey(entry.allowedStates)
  
  return currentKey === cachedKey
}

function chunkIds<T extends string | number>(ids: T[]): T[][] {
  if (!ids.length) return []
  const out: T[][] = []
  for (let i = 0; i < ids.length; i += SUPABASE_IN_BATCH) {
    out.push(ids.slice(i, i + SUPABASE_IN_BATCH))
  }
  return out
}

async function fetchPortalSummariesForProjects(supabase: any, projectIds: string[]) {
  if (!projectIds.length) return []
  const rows: any[] = []
  for (const batch of chunkIds(projectIds)) {
    const { data, error } = await supabase
      .from('err_summary')
      .select('id, project_id, total_expenses, report_date')
      .in('project_id', batch)
    if (error) {
      console.error('[overview/rollup] err_summary batch failed:', error.message)
      throw error
    }
    rows.push(...(data || []))
  }
  return rows
}

async function fetchF5ReportsForProjects(supabase: any, projectIds: string[]) {
  if (!projectIds.length) return []
  const rows: any[] = []
  for (const batch of chunkIds(projectIds)) {
    const { data, error } = await supabase
      .from('err_program_report')
      .select('id, project_id, report_date')
      .in('project_id', batch)
    if (error) {
      console.error('[overview/rollup] err_program_report batch failed:', error.message)
      throw error
    }
    rows.push(...(data || []))
  }
  return rows
}

function sumPlanFromPlannedActivities(planned: any): number {
  try {
    const arr = Array.isArray(planned) ? planned : (typeof planned === 'string' ? JSON.parse(planned || '[]') : [])
    return (arr || []).reduce((s: number, a: any) => {
      const exps = Array.isArray(a?.expenses) ? a.expenses : []
      return s + exps.reduce((ss: number, e: any) => ss + (Number(e?.total) || 0), 0)
    }, 0)
  } catch {
    return 0
  }
}

function sumPlanFromExpenses(expenses: any): number {
  try {
    const arr = Array.isArray(expenses) ? expenses : (typeof expenses === 'string' ? JSON.parse(expenses || '[]') : [])
    return (arr || []).reduce((s: number, e: any) => s + (Number(e?.total_cost) || 0), 0)
  } catch {
    return 0
  }
}

const OVERDUE_DAYS_AFTER_TRANSFER = 32

/** Statuses that count as "complete" for overdue: project is not overdue when both F4 and F5 are in this set. */
const OVERDUE_COMPLETE_STATUSES = ['completed', 'in review', 'under review', 'partial']

function isStatusCompleteForOverdue(status: string | null | undefined): boolean {
  const s = (status ?? '').toString().trim().toLowerCase()
  return OVERDUE_COMPLETE_STATUSES.some((allowed) => s === allowed || s === allowed.replace(' ', '_'))
}

/** Compute days overdue for portal projects: due = transfer_date + 32 days; overdue only when past due and not (F4 and F5 complete). */
function computeOverdue(
  transferDate: string | null,
  f4Complete: boolean,
  f5Complete: boolean
): { is_overdue: boolean; days_overdue: number | null } {
  if (!transferDate) return { is_overdue: false, days_overdue: null }
  const due = new Date(transferDate)
  due.setDate(due.getDate() + OVERDUE_DAYS_AFTER_TRANSFER)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  if (due >= today) return { is_overdue: false, days_overdue: null }
  const bothComplete = f4Complete && f5Complete
  if (bothComplete) return { is_overdue: false, days_overdue: null }
  const diffMs = today.getTime() - due.getTime()
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000))
  return { is_overdue: true, days_overdue: days }
}

/** Parse MOU payment_confirmation_file JSON and return map of project_id -> transfer_date. */
function getTransferDateByProjectFromMous(mousRows: any[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const mou of mousRows || []) {
    const raw = mou?.payment_confirmation_file
    if (!raw || typeof raw !== 'string') continue
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        for (const [projectId, data] of Object.entries(parsed)) {
          const d = (data as any)?.transfer_date
          if (d && typeof d === 'string') out[projectId] = d
        }
      }
    } catch {
      // ignore
    }
  }
  return out
}

async function fetchRowsByIdColumn(
  supabase: any,
  table: string,
  select: string,
  column: string,
  ids: (string | number)[]
) {
  if (!ids.length) return []
  const allData: any[] = []
  const idChunkSize = 150
  const pageSize = 1000
  for (let i = 0; i < ids.length; i += idChunkSize) {
    const idBatch = ids.slice(i, i + idChunkSize)
    let from = 0
    let hasMore = true
    while (hasMore) {
      const { data: page, error } = await supabase
        .from(table)
        .select(select)
        .in(column, idBatch)
        .range(from, from + pageSize - 1)
      if (error) throw error
      if (page?.length) {
        allData.push(...page)
        from += pageSize
        hasMore = page.length === pageSize
      } else {
        hasMore = false
      }
    }
  }
  return allData
}

// Helper function to fetch all rows using pagination
const fetchAllRows = async (supabase: any, table: string, select: string) => {
  let allData: any[] = []
  let from = 0
  const pageSize = 1000
  let hasMore = true

  while (hasMore) {
    const { data: page, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1)
    
    if (error) throw error
    
    if (page && page.length > 0) {
      allData = [...allData, ...page]
      from += pageSize
      hasMore = page.length === pageSize
    } else {
      hasMore = false
    }
  }
  
  return allData
}

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const { getUserStateAccess } = await import('@/lib/userStateAccess')

    // Get user's state access rights
    const { allowedStateNames } = await getUserStateAccess()
    
    // Check for cache bypass parameter
    const url = new URL(request.url)
    const bypassCache = url.searchParams.get('refresh') === 'true'
    
    // Check cache if not bypassing
    if (!bypassCache && isCacheValid(rollupCache, allowedStateNames)) {
      console.log('[rollup] Returning cached data')
      return NextResponse.json(rollupCache!.data)
    }
    
    console.log('[rollup] Cache miss or bypass - fetching fresh data')

    // Build project filter (include more statuses to catch F5 projects and completed projects)
    let projectQuery = supabase
      .from('err_projects')
      .select('id, state, grant_call_id, grant_grid_id, grant_id, grant_segment, emergency_rooms (id, name, name_ar, err_code), planned_activities, expenses, source, status, funding_status, mou_id, f4_status, f5_status, date, date_transfer')
      .in('status', ['approved', 'active', 'pending', 'completed'])
      .in('funding_status', ['committed', 'allocated'])

    // Apply state filter from user access rights (if not seeing all states)
    if (allowedStateNames !== null && allowedStateNames.length > 0) {
      projectQuery = projectQuery.in('state', allowedStateNames)
    }

    const { data: projects } = await projectQuery

    // Resolve MOU codes and per-project transfer dates from payment confirmations
    const mouIds = Array.from(new Set(((projects || []).map((p:any)=> p.mou_id).filter(Boolean)))) as string[]
    let mouCodeById: Record<string, string> = {}
    let transferDateByProject: Record<string, string> = {}
    if (mouIds.length) {
      const { data: mousRows } = await supabase
        .from('mous')
        .select('id, mou_code, payment_confirmation_file')
        .in('id', mouIds)
      for (const m of (mousRows || [])) mouCodeById[(m as any).id] = (m as any).mou_code
      transferDateByProject = getTransferDateByProjectFromMous(mousRows || [])
    }

    const projectIds = (projects || []).map((p:any)=> p.id)
    const dataSupabase = getSupabaseAdmin()

    // ===== Fetch ALL historical data from activities_raw_import FIRST =====
    // This ensures we have all data before filtering, making it more stable
    const allHistoricalData = await fetchAllRows(
      dataSupabase,
      'activities_raw_import',
      'id,"ERR CODE","ERR Name","State","Project Donor","USD","MOU Signed","F4","F5","Date Report Completed","Date Transfer","Serial Number","Target (Ind.)","Target (Fam.)","Overdue"'
    )

    // Filter historical data by state AFTER normalization (like Pool Overview By State)
    let filteredHistoricalData = allHistoricalData || []
    if (allowedStateNames !== null && allowedStateNames.length > 0) {
      filteredHistoricalData = (allHistoricalData || []).filter((row: any) => {
        const rawState = row['State'] || row['state'] || row.State
        const normalizedState = normalizeStateName(rawState)
        return allowedStateNames.includes(normalizedState)
      })
    }

    // Create a map of historical project IDs to normalized states for quick lookup
    const historicalStateMap = new Map<string, string>()
    for (const row of filteredHistoricalData) {
      if (row.id) {
        const rawState = row['State'] || row['state'] || row.State
        const normalizedState = normalizeStateName(rawState)
        historicalStateMap.set(row.id, normalizedState)
      }
    }

    // Historical financial reports: actuals by serial (match historical_financial_reports.budget_items = activities_raw_import."Serial Number")
    const historicalFinancialReports = await fetchAllRows(
      dataSupabase,
      'historical_financial_reports',
      'budget_items, total_errs_expenditure_usd'
    )
    const actualBySerial = new Map<string, number>()
    for (const r of (historicalFinancialReports || [])) {
      const key = (r.budget_items != null ? String(r.budget_items).trim() : '') || ''
      if (key === '') continue
      const val = Number((r as any).total_errs_expenditure_usd) || 0
      actualBySerial.set(key, (actualBySerial.get(key) ?? 0) + val)
    }

    const portalSummaries = await fetchPortalSummariesForProjects(dataSupabase, projectIds)

    // Line-item expenses by summary_id (project_id on err_expense may not match err_summary)
    const portalSummaryIds = portalSummaries
      .map((s: any) => s.id)
      .filter((id: unknown): id is number => typeof id === 'number')
    const expenseSelect =
      'expense_id, project_id, summary_id, expense_amount, expense_amount_sdg, payment_date, payment_method, seller, receipt_no, expense_description, expense_activity'
    const expensesBySummary =
      portalSummaryIds.length > 0
        ? await fetchRowsByIdColumn(dataSupabase, 'err_expense', expenseSelect, 'summary_id', portalSummaryIds)
        : []
    const expensesByProject = projectIds.length
      ? await fetchRowsByIdColumn(dataSupabase, 'err_expense', expenseSelect, 'project_id', projectIds)
      : []
    const portalExpenseById = new Map<number, (typeof expensesBySummary)[0]>()
    for (const row of [...expensesBySummary, ...expensesByProject]) {
      const id = (row as { expense_id?: number }).expense_id
      if (typeof id === 'number') portalExpenseById.set(id, row)
    }
    const portalExpenses = Array.from(portalExpenseById.values())
    const portalActualsByProject = computePortalActualsByProject(portalExpenses, portalSummaries)
    const orphanActualsByProject = computePortalActualsFromProjectExpenses(
      portalExpenses,
      projectIds
    )
    for (const [projectId, actual] of orphanActualsByProject) {
      const prev = portalActualsByProject.get(projectId) || { actual: 0, count: 0, last: null }
      if (prev.actual <= 0 && actual > 0) {
        portalActualsByProject.set(projectId, {
          ...prev,
          actual,
          count: Math.max(prev.count, 1),
        })
      }
    }
    
    // Get historical F4 summaries (linked to activities_raw_import)
    // Fetch all historical summaries first (no filtering at query level)
    // Only get summaries that are historical (have activities_raw_import_id) and don't have project_id
    const allHistoricalSummaries = await fetchAllRows(
      dataSupabase,
      'err_summary',
      'id, activities_raw_import_id, total_expenses, report_date'
    ).then((data: any[]) => (data || []).filter((s: any) => s.activities_raw_import_id != null && !s.project_id))
    
    // Filter historical summaries by state AFTER normalization (using the state map we created)
    let filteredHistoricalSummaries = allHistoricalSummaries || []
    if (allowedStateNames !== null && allowedStateNames.length > 0 && filteredHistoricalSummaries.length > 0) {
      filteredHistoricalSummaries = filteredHistoricalSummaries.filter((s: any) => {
        const normalizedState = historicalStateMap.get(s.activities_raw_import_id)
        return normalizedState && allowedStateNames.includes(normalizedState)
      })
    }
    
    // Historical summaries only (portal uses portalActualsByProject)
    const allSummaries = filteredHistoricalSummaries || []

    const f5Reports = await fetchF5ReportsForProjects(dataSupabase, projectIds)
    
    // Get F5 reach data for individual and family totals
    const f5ReportIds = (f5Reports || []).map((f:any) => f.id)
    let f5ReachData: any[] = []
    if (f5ReportIds.length) {
      let reachData: any[] = []
      for (const batch of chunkIds(f5ReportIds)) {
        const { data: page, error: reachErr } = await dataSupabase
          .from('err_program_reach')
          .select('report_id, individual_count, household_count')
          .in('report_id', batch)
        if (reachErr) throw reachErr
        reachData.push(...(page || []))
      }
      f5ReachData = reachData || []
    }
    
    // Calculate totals
    const totalIndividuals = f5ReachData.reduce((sum, r) => sum + (Number(r.individual_count) || 0), 0)
    const totalFamilies = f5ReachData.reduce((sum, r) => sum + (Number(r.household_count) || 0), 0)

    // Individuals by project (for portal projects: sum of individual_count from F5 reach via report_id)
    const reportToProject = new Map<number, string>()
    for (const f5 of (f5Reports || [])) {
      reportToProject.set((f5 as any).id, (f5 as any).project_id)
    }
    const individualsByProject = new Map<string, number>()
    for (const r of f5ReachData) {
      const pid = reportToProject.get((r as any).report_id)
      if (pid != null) {
        const prev = individualsByProject.get(pid) || 0
        individualsByProject.set(pid, prev + (Number((r as any).individual_count) || 0))
      }
    }

    // Index summaries by project (portal) or activities_raw_import_id (historical)
    const sumByProject = new Map<string, { actual: number; count: number; last: string | null }>()
    for (const s of allSummaries) {
      const pid = (s as any).project_id || `historical_${(s as any).activities_raw_import_id}`
      const prev = sumByProject.get(pid) || { actual: 0, count: 0, last: null }
      const actual = prev.actual + (Number((s as any).total_expenses) || 0)
      const count = prev.count + 1
      const last = prev.last && (new Date(prev.last) > new Date((s as any).report_date)) ? prev.last : (s as any).report_date
      sumByProject.set(pid, { actual, count, last })
    }

    // Index F5 reports by project
    const f5ByProject = new Map<string, { count: number; last: string | null }>()
    for (const f5 of (f5Reports || [])) {
      const pid = (f5 as any).project_id
      const prev = f5ByProject.get(pid) || { count: 0, last: null }
      const count = prev.count + 1
      const last = prev.last && (new Date(prev.last) > new Date((f5 as any).report_date)) ? prev.last : (f5 as any).report_date
      f5ByProject.set(pid, { count, last })
    }

    // Build project-level rows from err_projects
    const projRows = (projects || []).map((p:any) => {
      // Use expenses for mutual_aid_portal projects, otherwise use planned_activities
      const plan = p.source === 'mutual_aid_portal' 
        ? sumPlanFromExpenses(p.expenses)
        : sumPlanFromPlannedActivities(p.planned_activities)
      const agg = portalActualsByProject.get(p.id) || { actual: 0, count: 0, last: null }
      const f5Agg = f5ByProject.get(p.id) || { count: 0, last: null }
      const variance = plan - agg.actual
      const burn = plan > 0 ? agg.actual / plan : 0
      const individuals = individualsByProject.get(p.id) || 0
      const storedF4 = (p.f4_status != null ? String(p.f4_status).trim().toLowerCase() : null) || 'waiting'
      const storedF5 = (p.f5_status != null ? String(p.f5_status).trim().toLowerCase() : null) || 'waiting'
      const f4_status = agg.count > 0 ? 'completed' : storedF4
      const f5_status = f5Agg.count > 0 ? 'completed' : storedF5
      const f4Complete = isStatusCompleteForOverdue(f4_status)
      const f5Complete = isStatusCompleteForOverdue(f5_status)
      const effectiveTransferDate = p.date_transfer || transferDateByProject[p.id] || null
      const { is_overdue, days_overdue } = computeOverdue(effectiveTransferDate, f4Complete, f5Complete)
      const { activity_list, expense_category_list } = getActivityAndCategoryLists(p.planned_activities, p.expenses)
      return {
        project_id: p.id,
        state: p.state,
        err_id: p.emergency_rooms?.err_code || p.emergency_rooms?.name || null,
        err_name: p.emergency_rooms?.name || null,
        grant_call_id: p.grant_call_id,
        grant_grid_id: p.grant_grid_id,
        grant_serial_id: p.grant_id || null,
        grant_segment: p.grant_segment ?? null,
        has_mou: !!p.mou_id,
        mou_code: p.mou_id ? (mouCodeById[p.mou_id] || null) : null,
        plan,
        actual: agg.actual,
        variance,
        individuals,
        burn,
        f4_count: agg.count,
        portal_f4_count: agg.count, // For portal projects, all F4s are portal F4s
        last_report_date: agg.last,
        f5_count: f5Agg.count,
        portal_f5_count: f5Agg.count, // For portal projects, all F5s are portal F5s
        last_f5_date: f5Agg.last,
        status: p.status || null,
        is_historical: false,
        f4_status,
        f5_status,
        filter_date: p.date || agg.last || null,
        is_overdue,
        days_overdue,
        overdue: days_overdue != null ? String(days_overdue) : null,
        activity_list,
        expense_category_list,
      }
    })

    // Convert filtered historical data to project row format
    const historicalRows = filteredHistoricalData.map((row: any) => {
      const usd = Number(row['USD'] || row['usd'] || row.USD || 0)
      const hasMou = row['MOU Signed'] && String(row['MOU Signed']).trim().toLowerCase() !== 'no' && String(row['MOU Signed']).trim() !== ''
      const f4Value = row['F4'] || row['f4'] || row.F4
      const f5Value = row['F5'] || row['f5'] || row.F5
      const hasF4 = f4Value && String(f4Value).trim() !== '' && String(f4Value).trim().toLowerCase() !== 'no'
      // Check if F4 column is 'Completed' (case-insensitive)
      const f4Completed = f4Value && String(f4Value).trim().toLowerCase() === 'completed'
      // Check if F5 column is 'Completed' (case-insensitive)
      const f5Completed = f5Value && String(f5Value).trim().toLowerCase() === 'completed'
      const reportDate = row['Date Report Completed'] || row['date_report_completed'] || row['Date Report Completed']
      const dateTransfer = row['Date Transfer'] || row['date_transfer'] || null
      const projectDonor = row['Project Donor'] || row['project_donor'] || row['Project Donor'] || null
      
      // Get F4 count from err_summary for this historical project (F4s uploaded through portal)
      const historicalProjectId = `historical_${row.id}`
      const f4Agg = sumByProject.get(historicalProjectId) || { actual: 0, count: 0, last: null }
      // Actuals: prefer historical_financial_reports.total_errs_expenditure_usd (match budget_items = activities_raw_import."Serial Number")
      const serial = (row['Serial Number'] ?? row['serial_number'] ?? '').toString().trim()
      const actualFromFinancial = serial ? (actualBySerial.get(serial) ?? null) : null
      const actual = actualFromFinancial != null ? actualFromFinancial : f4Agg.actual
      
      // For historical projects: F4 count = F4='Completed' from activities_raw_import (1 if completed) + F4s uploaded through portal
      const f4CountFromSheet = f4Completed ? 1 : 0
      const f4CountFromPortal = f4Agg.count || 0
      const totalF4Count = f4CountFromSheet + f4CountFromPortal
      const individuals = Number(row['Target (Ind.)'] ?? row['target_ind'] ?? row['Target (Ind.)'] ?? 0) || 0
      // F4/F5 status for % Tracker: Completed | Waiting | Under Review | Partial (from activities_raw_import)
      const f4StatusRaw = f4Value != null ? String(f4Value).trim() : ''
      const f4_status = f4StatusRaw.toLowerCase() || null
      const f5StatusRaw = f5Value != null ? String(f5Value).trim() : ''
      const f5_status = f5StatusRaw.toLowerCase() || null

      // Historical: use stored Overdue from sheet (text); is_overdue for counting
      const overdueRaw = row['Overdue'] ?? row['overdue'] ?? null
      const overdueStr = overdueRaw != null ? String(overdueRaw).trim() : ''
      const overdueNum = overdueStr !== '' ? parseInt(overdueStr, 10) : NaN
      const is_overdue_historical = !Number.isNaN(overdueNum) && overdueNum >= 0
      const overdueDisplay = overdueStr !== '' ? overdueStr : null

      return {
        project_id: historicalProjectId, // Use a prefix to distinguish historical projects
        state: normalizeStateName(row['State'] || row['state'] || row.State),
        err_id: row['ERR CODE'] || row['ERR Name'] || row['err_code'] || row['err_name'] || null,
        err_name: row['ERR Name'] || row['err_name'] || null,
        grant_call_id: null, // Historical data doesn't have grant_call_id
        grant_grid_id: null, // Historical data doesn't have grant_grid_id
        grant_serial_id: row['Serial Number'] || row['serial_number'] || null, // For historical projects, use "Serial Number" field
        project_donor: projectDonor, // For historical projects, use "Project Donor" field
        has_mou: hasMou,
        mou_code: hasMou ? (row['MOU Signed'] || 'Yes') : null,
        plan: usd,
        actual, // From historical_financial_reports.total_errs_expenditure_usd (match budget_items = serial) or err_summary
        variance: usd - actual,
        individuals, // From activities_raw_import "Target (Ind.)" (same as card)
        burn: usd > 0 ? actual / usd : 0,
        f4_count: totalF4Count, // F4='Completed' from sheet + F4s uploaded through portal
        portal_f4_count: f4CountFromPortal, // Only F4s uploaded through portal (for UI display on historical projects)
        last_report_date: f4Agg.last || reportDate || null, // Prefer date from err_summary
        f5_count: f5Completed ? 1 : 0, // F5='Completed' from activities_raw_import
        portal_f5_count: 0, // Historical projects don't have portal-uploaded F5s yet
        last_f5_date: reportDate || null, // Use same date if available
        is_historical: true,
        f4_status, // For % Tracker: completed | waiting | under review | partial
        f5_status, // For % Tracker: same status values, no actual vs plan
        filter_date: dateTransfer || reportDate || null, // For date filter: Date Transfer or Date Report Completed
        is_overdue: is_overdue_historical,
        days_overdue: !Number.isNaN(overdueNum) ? overdueNum : null,
        overdue: overdueDisplay,
        activity_list: [], // Historical projects from activities_raw_import do not have planned_activities
        expense_category_list: [],
      }
    })

    // Combine err_projects and historical data
    const allRows = [...projRows, ...historicalRows]

    // Calculate target individuals and families from filtered historical data
    const historicalTargetIndividuals = filteredHistoricalData.reduce((sum, row: any) => {
      const targetInd = row['Target (Ind.)'] || row['target_ind'] || row['Target (Ind.)']
      return sum + (Number(targetInd) || 0)
    }, 0)
    
    const historicalTargetFamilies = filteredHistoricalData.reduce((sum, row: any) => {
      const targetFam = row['Target (Fam.)'] || row['target_fam'] || row['Target (Fam.)']
      return sum + (Number(targetFam) || 0)
    }, 0)

    // Roll up for KPIs in current slice
    const kpis = {
      projects: allRows.length,
      plan: allRows.reduce((s,r)=> s + r.plan, 0),
      actual: allRows.reduce((s,r)=> s + r.actual, 0),
      variance: 0,
      burn: 0,
      f4_count: allRows.reduce((s,r)=> s + r.f4_count, 0),
      last_report_date: allRows.map(r=> r.last_report_date).filter(Boolean).sort().slice(-1)[0] || null,
      f5_count: allRows.reduce((s,r)=> s + r.f5_count, 0),
      last_f5_date: allRows.map(r=> r.last_f5_date).filter(Boolean).sort().slice(-1)[0] || null,
      f5_total_individuals: totalIndividuals + historicalTargetIndividuals,
      f5_total_families: totalFamilies + historicalTargetFamilies
    }
    kpis.variance = kpis.plan - kpis.actual
    kpis.burn = kpis.plan > 0 ? kpis.actual / kpis.plan : 0

    // Pre-calculate state aggregations for frontend
    const stateAggregations = new Map<string, any>()
    for (const r of allRows) {
      const key = r.state || '—'
      const curr = stateAggregations.get(key) || { 
        state: key, plan: 0, actual: 0, variance: 0, burn: 0, 
        f4_count: 0, f5_count: 0, total_projects: 0, 
        projects_with_f4: 0, projects_with_f5: 0, tracker_sum: 0, 
        individuals: 0, last_report_date: null, last_f5_date: null, 
        overdue_count: 0 
      }
      curr.plan += Number(r.plan) || 0
      curr.actual += Number(r.actual) || 0
      curr.f4_count += Number(r.f4_count) || 0
      curr.f5_count += Number(r.f5_count) || 0
      curr.total_projects += 1
      if (Number(r.f4_count || 0) > 0) curr.projects_with_f4 += 1
      if (Number(r.f5_count || 0) > 0) curr.projects_with_f5 += 1
      curr.individuals += Number(r.individuals) || 0
      if (r.is_overdue) curr.overdue_count += 1
      
      // Track latest dates
      if (r.last_report_date) {
        if (!curr.last_report_date || new Date(r.last_report_date) > new Date(curr.last_report_date)) {
          curr.last_report_date = r.last_report_date
        }
      }
      if (r.last_f5_date) {
        if (!curr.last_f5_date || new Date(r.last_f5_date) > new Date(curr.last_f5_date)) {
          curr.last_f5_date = r.last_f5_date
        }
      }
      
      // Calculate tracker score for this row
      const plan = Number(r.plan || 0)
      const actual = Number(r.actual ?? 0)
      const burn = plan > 0 ? actual / plan : 0
      const hasActual = (typeof r.actual === 'number' && r.actual > 0) || (r.actual != null && String(r.actual).trim() !== '' && Number(r.actual) > 0)
      const f5Status = r.f5_status != null ? String(r.f5_status).toLowerCase() : null
      let f5Part: number
      if (f5Status === 'completed') f5Part = 0.5
      else if (f5Status === 'under review' || f5Status === 'in review' || f5Status === 'partial') f5Part = 0.25
      else if (f5Status === 'waiting') f5Part = 0
      else if (r.is_historical) f5Part = 0
      else f5Part = Number(r.f5_count || 0) > 0 ? 0.5 : 0
      
      const f4Status = r.f4_status != null ? String(r.f4_status).toLowerCase() : null
      let f4Part: number
      if (f4Status === 'completed') {
        if (r.is_historical && hasActual && plan > 0) f4Part = 0.5 * Math.min(1, burn)
        else if (r.is_historical) f4Part = 0.5
        else f4Part = 0.5 * Math.min(1, burn)
      } else if (f4Status === 'under review' || f4Status === 'in review' || f4Status === 'partial') f4Part = 0.25
      else if (f4Status === 'waiting') f4Part = 0
      else if (r.is_historical) f4Part = 0
      else f4Part = 0.5 * Math.min(1, burn)
      
      curr.tracker_sum += f4Part + f5Part
      stateAggregations.set(key, curr)
    }
    
    // Finalize state aggregations
    const stateRows = Array.from(stateAggregations.values()).map(s => ({
      ...s,
      variance: s.plan - s.actual,
      burn: s.plan > 0 ? s.actual / s.plan : 0
    }))

    // Pre-calculate room aggregations for frontend
    const roomAggregations = new Map<string, any>()
    for (const r of allRows) {
      const key = `${r.state || '—'}|${r.err_id || '—'}`
      const curr = roomAggregations.get(key) || { 
        state: r.state || '—',
        err_id: r.err_id || '—', 
        err_name: r.err_name || '—',
        plan: 0, actual: 0, variance: 0, burn: 0, 
        f4_count: 0, f5_count: 0, total_projects: 0, 
        projects_with_f4: 0, projects_with_f5: 0, tracker_sum: 0, 
        individuals: 0, last_report_date: null, last_f5_date: null, 
        overdue_count: 0 
      }
      curr.plan += Number(r.plan) || 0
      curr.actual += Number(r.actual) || 0
      curr.f4_count += Number(r.f4_count) || 0
      curr.f5_count += Number(r.f5_count) || 0
      curr.total_projects += 1
      if (Number(r.f4_count || 0) > 0) curr.projects_with_f4 += 1
      if (Number(r.f5_count || 0) > 0) curr.projects_with_f5 += 1
      curr.individuals += Number(r.individuals) || 0
      if (r.is_overdue) curr.overdue_count += 1
      
      if (r.last_report_date) {
        if (!curr.last_report_date || new Date(r.last_report_date) > new Date(curr.last_report_date)) {
          curr.last_report_date = r.last_report_date
        }
      }
      if (r.last_f5_date) {
        if (!curr.last_f5_date || new Date(r.last_f5_date) > new Date(curr.last_f5_date)) {
          curr.last_f5_date = r.last_f5_date
        }
      }
      
      // Calculate tracker score
      const plan = Number(r.plan || 0)
      const actual = Number(r.actual ?? 0)
      const burn = plan > 0 ? actual / plan : 0
      const hasActual = (typeof r.actual === 'number' && r.actual > 0) || (r.actual != null && String(r.actual).trim() !== '' && Number(r.actual) > 0)
      const f5Status = r.f5_status != null ? String(r.f5_status).toLowerCase() : null
      let f5Part: number
      if (f5Status === 'completed') f5Part = 0.5
      else if (f5Status === 'under review' || f5Status === 'in review' || f5Status === 'partial') f5Part = 0.25
      else if (f5Status === 'waiting') f5Part = 0
      else if (r.is_historical) f5Part = 0
      else f5Part = Number(r.f5_count || 0) > 0 ? 0.5 : 0
      
      const f4Status = r.f4_status != null ? String(r.f4_status).toLowerCase() : null
      let f4Part: number
      if (f4Status === 'completed') {
        if (r.is_historical && hasActual && plan > 0) f4Part = 0.5 * Math.min(1, burn)
        else if (r.is_historical) f4Part = 0.5
        else f4Part = 0.5 * Math.min(1, burn)
      } else if (f4Status === 'under review' || f4Status === 'in review' || f4Status === 'partial') f4Part = 0.25
      else if (f4Status === 'waiting') f4Part = 0
      else if (r.is_historical) f4Part = 0
      else f4Part = 0.5 * Math.min(1, burn)
      
      curr.tracker_sum += f4Part + f5Part
      roomAggregations.set(key, curr)
    }
    
    const roomRows = Array.from(roomAggregations.values()).map(s => ({
      ...s,
      variance: s.plan - s.actual,
      burn: s.plan > 0 ? s.actual / s.plan : 0
    }))

    const result = { 
      kpis, 
      rows: allRows,
      stateAggregations: stateRows,
      roomAggregations: roomRows
    }
    
    // Cache the result
    rollupCache = {
      data: result,
      timestamp: Date.now(),
      allowedStates: allowedStateNames
    }
    console.log('[rollup] Data cached successfully')

    return NextResponse.json(result)
  } catch (e) {
    console.error('overview/rollup error', e)
    return NextResponse.json({ error: 'Failed to load rollup' }, { status: 500 })
  }
}


