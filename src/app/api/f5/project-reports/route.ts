import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { getUserStateAccess } from '@/lib/userStateAccess'
import { assertProjectInGrantAccess, getUserGrantAccess } from '@/lib/userGrantAccess'
import { assertProjectInRoomAccess, getUserRoomAccess } from '@/lib/userRoomAccess'

/**
 * GET /api/f5/project-reports?project_id=...
 * Lightweight list of F5 program reports for one portal project.
 */
export async function GET(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const projectId = new URL(request.url).searchParams.get('project_id')?.trim()
    if (!projectId) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
    }
    if (projectId.startsWith('historical_')) {
      return NextResponse.json([])
    }

    const [grantAccess, roomAccess] = await Promise.all([
      getUserGrantAccess(),
      getUserRoomAccess(),
    ])
    if (roomAccess.mode === 'none') {
      return NextResponse.json([])
    }
    if (roomAccess.mode !== 'room' && grantAccess.mode === 'none') {
      return NextResponse.json([])
    }

    if (roomAccess.mode === 'room') {
      const roomCheck = await assertProjectInRoomAccess(projectId, roomAccess, {
        notFoundMessage: 'Forbidden',
      })
      if (roomCheck.handled && !roomCheck.ok) return roomCheck.response
    } else if (grantAccess.mode === 'partner') {
      const scope = await assertProjectInGrantAccess(projectId, grantAccess, {
        forbiddenStatus: 403,
        notFoundMessage: 'Forbidden',
      })
      if (!scope.ok) return scope.response
    }

    const { allowedStateNames } = await getUserStateAccess()
    if (grantAccess.mode === 'all' && allowedStateNames !== null && allowedStateNames.length === 0) {
      return NextResponse.json([])
    }

    if (grantAccess.mode === 'all' && allowedStateNames !== null) {
      const { data: project, error: projectError } = await supabase
        .from('err_projects')
        .select('id, state')
        .eq('id', projectId)
        .maybeSingle()
      if (projectError) throw projectError
      if (!project) return NextResponse.json([])
      const state = project.state != null ? String(project.state) : ''
      if (!allowedStateNames.includes(state)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const { data: reports, error } = await supabase
      .from('err_program_report')
      .select('id, project_id, report_date, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    if (error) throw error

    const rows = reports || []
    const reportIds = rows.map((r) => String(r.id))
    const reachCounts: Record<string, number> = {}
    if (reportIds.length > 0) {
      const { data: reach, error: reachError } = await supabase
        .from('err_program_reach')
        .select('report_id')
        .in('report_id', reportIds)
      if (reachError) throw reachError
      for (const row of reach || []) {
        const sid = String((row as { report_id: string }).report_id)
        reachCounts[sid] = (reachCounts[sid] || 0) + 1
      }
    }

    return NextResponse.json(
      rows.map((r) => ({
        id: r.id,
        project_id: r.project_id,
        report_date: r.report_date ?? null,
        activities_count: reachCounts[String(r.id)] || 0,
      }))
    )
  } catch (e) {
    console.error('GET /api/f5/project-reports:', e)
    return NextResponse.json({ error: 'Failed to fetch F5 project reports' }, { status: 500 })
  }
}
