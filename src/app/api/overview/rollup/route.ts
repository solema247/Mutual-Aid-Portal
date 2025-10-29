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

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const { searchParams } = new URL(request.url)
    const donor = searchParams.get('donor')
    const grant = searchParams.get('grant')
    const state = searchParams.get('state')
    const err = searchParams.get('err')

    // Build project filter (include more statuses to catch F5 projects)
    let pq = supabase
      .from('err_projects')
      .select('id, state, grant_call_id, emergency_rooms (id, name, name_ar, err_code), planned_activities, expenses, source, status, funding_status, mou_id')
      .in('status', ['approved', 'active', 'pending'])
      .in('funding_status', ['committed', 'allocated'])
    if (grant) pq = pq.eq('grant_call_id', grant)
    if (state) pq = pq.eq('state', state)
    if (err) pq = pq.eq('emergency_room_id', err)
    // If donor is provided, limit via grant calls
    let grantIds: string[] | null = null
    if (donor) {
      const { data: gc } = await supabase.from('grant_calls').select('id').eq('donor_id', donor)
      grantIds = (gc || []).map((g:any)=> g.id)
      if (grantIds.length === 0) return NextResponse.json({ kpis: {}, rows: [] })
      pq = pq.in('grant_call_id', grantIds)
    }
    const { data: projects } = await pq
    
    console.log('Found projects:', projects?.length || 0)
    console.log('Project IDs:', projects?.map((p:any) => p.id) || [])

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

    // Summaries for actuals
    let sq = supabase.from('err_summary').select('project_id, total_expenses, report_date')
    if (projectIds.length) sq = sq.in('project_id', projectIds)
    const { data: summaries } = await sq

    // F5 reports for program reporting - get reach data for totals
    let f5q = supabase.from('err_program_report').select('id, project_id, report_date')
    if (projectIds.length) f5q = f5q.in('project_id', projectIds)
    const { data: f5Reports } = await f5q
    
    console.log('Found F5 reports:', f5Reports?.length || 0)
    console.log('F5 report project IDs:', f5Reports?.map((f:any) => f.project_id) || [])
    
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

    // Index summaries by project
    const sumByProject = new Map<string, { actual: number; count: number; last: string | null }>()
    for (const s of (summaries || [])) {
      const pid = (s as any).project_id
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

    // Build project-level rows
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
        has_mou: !!p.mou_id,
        mou_code: p.mou_id ? (mouCodeById[p.mou_id] || null) : null,
        plan,
        actual: agg.actual,
        variance,
        burn,
        f4_count: agg.count,
        last_report_date: agg.last,
        f5_count: f5Agg.count,
        last_f5_date: f5Agg.last
      }
    })

    // Roll up for KPIs in current slice
    const kpis = {
      projects: projRows.length,
      plan: projRows.reduce((s,r)=> s + r.plan, 0),
      actual: projRows.reduce((s,r)=> s + r.actual, 0),
      variance: 0,
      burn: 0,
      f4_count: projRows.reduce((s,r)=> s + r.f4_count, 0),
      last_report_date: projRows.map(r=> r.last_report_date).filter(Boolean).sort().slice(-1)[0] || null,
      f5_count: projRows.reduce((s,r)=> s + r.f5_count, 0),
      last_f5_date: projRows.map(r=> r.last_f5_date).filter(Boolean).sort().slice(-1)[0] || null,
      f5_total_individuals: totalIndividuals,
      f5_total_families: totalFamilies
    }
    kpis.variance = kpis.plan - kpis.actual
    kpis.burn = kpis.plan > 0 ? kpis.actual / kpis.plan : 0

    return NextResponse.json({ kpis, rows: projRows })
  } catch (e) {
    console.error('overview/rollup error', e)
    return NextResponse.json({ error: 'Failed to load rollup' }, { status: 500 })
  }
}


