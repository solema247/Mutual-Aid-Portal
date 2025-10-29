import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

export async function GET() {
  try {
    const supabase = getSupabaseRouteClient()
    // Get F4 summaries with attachment counts and project/room/grant context
    const { data: summaries, error } = await supabase
      .from('err_summary')
      .select(`
        id,
        project_id,
        report_date,
        total_grant,
        total_expenses,
        remainder,
        created_at,
        err_projects (
          err_id,
          state,
          grant_call_id,
          emergency_rooms ( name, name_ar, err_code ),
          grant_calls ( name, shortname, donors ( name, short_name ) )
        )
      `)
      .order('created_at', { ascending: false })

    if (error) throw error

    const ids = (summaries || []).map((s: any) => s.id)
    let attachCounts: Record<number, number> = {}
    if (ids.length) {
      const { data: atts } = await supabase
        .from('err_summary_attachments')
        .select('summary_id')
        .in('summary_id', ids)
      for (const a of (atts || [])) {
        attachCounts[a.summary_id] = (attachCounts[a.summary_id] || 0) + 1
      }
    }

    const rows = (summaries || []).map((s: any) => {
      const prj = s.err_projects || {}
      const room = prj.emergency_rooms || {}
      const gc = prj.grant_calls || {}
      const donor = gc.donors || {}
      const errName = room.name || room.name_ar || prj.err_id || null
      return {
      id: s.id,
      project_id: s.project_id,
      err_id: prj?.err_id || null,
      err_name: errName,
      state: prj?.state || null,
      grant_call: gc?.name || gc?.shortname || null,
      donor: donor?.short_name || donor?.name || null,
      report_date: s.report_date,
      total_grant: s.total_grant,
      total_expenses: s.total_expenses,
      remainder: s.remainder,
      attachments_count: attachCounts[s.id] || 0,
      updated_at: s.created_at
      }
    })

    return NextResponse.json(rows)
  } catch (e) {
    console.error('F4 list error', e)
    return NextResponse.json({ error: 'Failed to fetch F4 list' }, { status: 500 })
  }
}


