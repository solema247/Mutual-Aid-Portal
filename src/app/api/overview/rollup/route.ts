import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

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

// Helper function to normalize state names consistently
function normalizeStateName(state: any): string {
  if (!state) return 'Unknown'
  const normalized = String(state).trim()
  return normalized === '' ? 'Unknown' : normalized
}

// Helper function to normalize state names from activities_raw_import
// to match the spelling used in err_projects
function normalizeActivitiesStateName(state: any): string {
  if (!state) return 'Unknown'
  let normalized = String(state).trim()
  if (normalized === '') return 'Unknown'
  
  // Normalize specific state name variations from activities_raw_import
  const stateMappings: Record<string, string> = {
    'Al Jazeera': 'Al Jazirah',
    'Gadarif': 'Gadaref',
    'Sinar': 'Sennar'
  }
  
  // Check for exact match first
  if (stateMappings[normalized]) {
    return stateMappings[normalized]
  }
  
  // Check case-insensitive match
  const lowerNormalized = normalized.toLowerCase()
  for (const [key, value] of Object.entries(stateMappings)) {
    if (key.toLowerCase() === lowerNormalized) {
      return value
    }
  }
  
  return normalized
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

    // Build project filter (include more statuses to catch F5 projects and completed projects)
    let projectQuery = supabase
      .from('err_projects')
      .select('id, state, grant_call_id, grant_grid_id, grant_id, emergency_rooms (id, name, name_ar, err_code), planned_activities, expenses, source, status, funding_status, mou_id')
      .in('status', ['approved', 'active', 'pending', 'completed'])
      .in('funding_status', ['committed', 'allocated'])

    // Apply state filter from user access rights (if not seeing all states)
    if (allowedStateNames !== null && allowedStateNames.length > 0) {
      projectQuery = projectQuery.in('state', allowedStateNames)
    }

    const { data: projects } = await projectQuery

    // Resolve MOU codes for projects that have mou_id
    const mouIds = Array.from(new Set(((projects || []).map((p:any)=> p.mou_id).filter(Boolean)))) as string[]
    let mouCodeById: Record<string, string> = {}
    if (mouIds.length) {
      const { data: mousRows } = await supabase
        .from('mous')
        .select('id, mou_code')
        .in('id', mouIds)
      for (const m of (mousRows || [])) mouCodeById[(m as any).id] = (m as any).mou_code
    }

    const projectIds = (projects || []).map((p:any)=> p.id)

    // ===== Fetch ALL historical data from activities_raw_import FIRST =====
    // This ensures we have all data before filtering, making it more stable
    const allHistoricalData = await fetchAllRows(
      supabase,
      'activities_raw_import',
      'id,"ERR CODE","ERR Name","State","Project Donor","USD","MOU Signed","F4","F5","Date Report Completed","Serial Number","Target (Ind.)","Target (Fam.)"'
    )

    // Filter historical data by state AFTER normalization (like Pool Overview By State)
    let filteredHistoricalData = allHistoricalData || []
    if (allowedStateNames !== null && allowedStateNames.length > 0) {
      filteredHistoricalData = (allHistoricalData || []).filter((row: any) => {
        const rawState = row['State'] || row['state'] || row.State
        const normalizedState = normalizeActivitiesStateName(rawState)
        return allowedStateNames.includes(normalizedState)
      })
    }

    // Create a map of historical project IDs to normalized states for quick lookup
    const historicalStateMap = new Map<string, string>()
    for (const row of filteredHistoricalData) {
      if (row.id) {
        const rawState = row['State'] || row['state'] || row.State
        const normalizedState = normalizeActivitiesStateName(rawState)
        historicalStateMap.set(row.id, normalizedState)
      }
    }

    // Historical financial reports: actuals by serial (match historical_financial_reports.budget_items = activities_raw_import."Serial Number")
    const historicalFinancialReports = await fetchAllRows(
      supabase,
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

    // Summaries for actuals (portal projects)
    // Only get summaries that are NOT historical (exclude those with activities_raw_import_id)
    let sq = supabase.from('err_summary').select('id, project_id, total_expenses, report_date').is('activities_raw_import_id', null)
    if (projectIds.length) sq = sq.in('project_id', projectIds)
    const { data: summaries } = await sq
    
    // Get historical F4 summaries (linked to activities_raw_import)
    // Fetch all historical summaries first (no filtering at query level)
    // Only get summaries that are historical (have activities_raw_import_id) and don't have project_id
    const allHistoricalSummaries = await fetchAllRows(
      supabase,
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
    
    // Combine portal and historical summaries for processing
    // Deduplicate by summary ID to prevent counting the same summary twice
    const allSummariesMap = new Map<number, any>()
    for (const s of (summaries || [])) {
      if (s.id) allSummariesMap.set(s.id, s)
    }
    for (const s of filteredHistoricalSummaries) {
      if (s.id) allSummariesMap.set(s.id, s)
    }
    const allSummaries = Array.from(allSummariesMap.values())

    // F5 reports for program reporting - get reach data for totals
    let f5q = supabase.from('err_program_report').select('id, project_id, report_date')
    if (projectIds.length) f5q = f5q.in('project_id', projectIds)
    const { data: f5Reports } = await f5q
    
    // Get F5 reach data for individual and family totals
    const f5ReportIds = (f5Reports || []).map((f:any) => f.id)
    let f5ReachData: any[] = []
    if (f5ReportIds.length) {
      const { data: reachData } = await supabase
        .from('err_program_reach')
        .select('report_id, individual_count, household_count')
        .in('report_id', f5ReportIds)
      f5ReachData = reachData || []
    }
    
    // Calculate totals
    const totalIndividuals = f5ReachData.reduce((sum, r) => sum + (Number(r.individual_count) || 0), 0)
    const totalFamilies = f5ReachData.reduce((sum, r) => sum + (Number(r.household_count) || 0), 0)

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
      const agg = sumByProject.get(p.id) || { actual: 0, count: 0, last: null }
      const f5Agg = f5ByProject.get(p.id) || { count: 0, last: null }
      const variance = plan - agg.actual
      const burn = plan > 0 ? agg.actual / plan : 0
      return {
        project_id: p.id,
        state: p.state,
        err_id: p.emergency_rooms?.err_code || p.emergency_rooms?.name || null,
        grant_call_id: p.grant_call_id,
        grant_grid_id: p.grant_grid_id,
        grant_serial_id: p.grant_id || null,
        has_mou: !!p.mou_id,
        mou_code: p.mou_id ? (mouCodeById[p.mou_id] || null) : null,
        plan,
        actual: agg.actual,
        variance,
        burn,
        f4_count: agg.count,
        last_report_date: agg.last,
        f5_count: f5Agg.count,
        last_f5_date: f5Agg.last,
        status: p.status || null,
        is_historical: false
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
      
      return {
        project_id: historicalProjectId, // Use a prefix to distinguish historical projects
        state: normalizeActivitiesStateName(row['State'] || row['state'] || row.State),
        err_id: row['ERR CODE'] || row['ERR Name'] || row['err_code'] || row['err_name'] || null,
        grant_call_id: null, // Historical data doesn't have grant_call_id
        grant_grid_id: null, // Historical data doesn't have grant_grid_id
        grant_serial_id: row['Serial Number'] || row['serial_number'] || null, // For historical projects, use "Serial Number" field
        project_donor: projectDonor, // For historical projects, use "Project Donor" field
        has_mou: hasMou,
        mou_code: hasMou ? (row['MOU Signed'] || 'Yes') : null,
        plan: usd,
        actual, // From historical_financial_reports.total_errs_expenditure_usd (match budget_items = serial) or err_summary
        variance: usd - actual,
        burn: usd > 0 ? actual / usd : 0,
        f4_count: totalF4Count, // F4='Completed' from sheet + F4s uploaded through portal
        last_report_date: f4Agg.last || reportDate || null, // Prefer date from err_summary
        f5_count: f5Completed ? 1 : 0, // F5='Completed' from activities_raw_import
        last_f5_date: reportDate || null, // Use same date if available
        is_historical: true
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

    return NextResponse.json({ kpis, rows: allRows })
  } catch (e) {
    console.error('overview/rollup error', e)
    return NextResponse.json({ error: 'Failed to load rollup' }, { status: 500 })
  }
}


