import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const donor = searchParams.get('donor')
    const grant = searchParams.get('grant')
    const state = searchParams.get('state')
    const err = searchParams.get('err')

    // Build project filter (committed + approved/active only)
    let pq = supabase
      .from('err_projects')
      .select('id, state, grant_call_id, emergency_rooms (id, name, name_ar, err_code), planned_activities, status, mou_id')
      .eq('funding_status', 'committed')
      .in('status', ['approved', 'active'])
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

    // Build project-level rows
    const projRows = (projects || []).map((p:any) => {
      const plan = sumPlanFromPlannedActivities(p.planned_activities)
      const agg = sumByProject.get(p.id) || { actual: 0, count: 0, last: null }
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
        last_report_date: agg.last
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
      last_report_date: projRows.map(r=> r.last_report_date).filter(Boolean).sort().slice(-1)[0] || null
    }
    kpis.variance = kpis.plan - kpis.actual
    kpis.burn = kpis.plan > 0 ? kpis.actual / kpis.plan : 0

    return NextResponse.json({ kpis, rows: projRows })
  } catch (e) {
    console.error('overview/rollup error', e)
    return NextResponse.json({ error: 'Failed to load rollup' }, { status: 500 })
  }
}


