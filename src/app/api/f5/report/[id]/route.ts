import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseRouteClient()
    const id = params.id
    if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const { data: report, error: repErr } = await supabase
      .from('err_program_report')
      .select('*, err_projects (state, project_objectives, emergency_rooms (name, name_ar, err_code))')
      .eq('id', id)
      .single()
    if (repErr) throw repErr

    const { data: reach, error: reachErr } = await supabase
      .from('err_program_reach')
      .select('*')
      .eq('report_id', id)
    if (reachErr) throw reachErr

    const { data: files, error: filesErr } = await supabase
      .from('err_program_files')
      .select('*')
      .eq('report_id', id)
    if (filesErr) throw filesErr

    return NextResponse.json({ report, reach: reach || [], files: files || [] })
  } catch (e) {
    console.error('F5 detail error', e)
    return NextResponse.json({ error: 'Failed to load F5 report' }, { status: 500 })
  }
}


