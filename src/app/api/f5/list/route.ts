import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

export async function GET() {
  try {
    const { data: reports, error } = await supabase
      .from('err_program_report')
      .select(`
        id,
        project_id,
        report_date,
        created_at,
        err_projects (
          state,
          emergency_rooms ( name, name_ar, err_code ),
          grant_calls ( name, shortname, donors ( name, short_name ) )
        )
      `)
      .order('created_at', { ascending: false })
    if (error) throw error

    const ids = (reports || []).map((r:any)=> r.id)
    let reachCounts: Record<string, number> = {}
    if (ids.length) {
      const { data: reach } = await supabase
        .from('err_program_reach')
        .select('report_id')
        .in('report_id', ids as any)
      for (const r of (reach || [])) {
        const sid = (r as any).report_id
        reachCounts[sid] = (reachCounts[sid] || 0) + 1
      }
    }

    const rows = (reports || []).map((r:any)=>{
      const prj = r.err_projects || {}
      const room = prj.emergency_rooms || {}
      const gc = prj.grant_calls || {}
      const donor = gc.donors || {}
      const errName = room.name || room.name_ar || null
      return {
        id: r.id,
        project_id: r.project_id,
        err_name: errName,
        state: prj.state || null,
        grant_call: gc?.name || gc?.shortname || null,
        donor: donor?.short_name || donor?.name || null,
        report_date: r.report_date,
        activities_count: reachCounts[r.id] || 0,
        updated_at: r.created_at
      }
    })

    return NextResponse.json(rows)
  } catch (e) {
    console.error('F5 list error', e)
    return NextResponse.json({ error: 'Failed to fetch F5 list' }, { status: 500 })
  }
}
