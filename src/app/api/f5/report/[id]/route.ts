import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { requirePermission } from '@/lib/requirePermission'
import { syncProjectEndDateFromF5 } from '@/lib/syncProjectEndDateFromF5'
import { resetReportingStatusIfNoReportsRemaining } from '@/lib/projectStatus'
import { assertProjectInGrantAccess, getUserGrantAccess } from '@/lib/userGrantAccess'
import { emitF123Audit } from '@/lib/f123Audit'

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
      .select('*, err_projects (state, project_objectives, grant_id, grant_grid_id, emergency_rooms (name, name_ar, err_code))')
      .eq('id', id)
      .single()
    if (repErr) throw repErr

    const grantAccess = await getUserGrantAccess()
    if (grantAccess.mode !== 'all') {
      if (!report?.project_id) {
        return NextResponse.json({ error: 'Report not found' }, { status: 404 })
      }
      const scope = await assertProjectInGrantAccess(String(report.project_id), grantAccess)
      if (!scope.ok) return scope.response
    }

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

/**
 * DELETE F5 reports linked to err_projects only.
 * Body: { "confirm": "DELETE" }
 */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const perm = await requirePermission('f5_view_report')
    if (perm instanceof NextResponse) return perm

    let body: { confirm?: string } = {}
    try {
      body = await req.json()
    } catch {
      body = {}
    }
    if (body.confirm !== 'DELETE') {
      return NextResponse.json(
        { error: 'Type DELETE to confirm. Send JSON body: { "confirm": "DELETE" }' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseRouteClient()
    const id = params.id
    if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const { data: row, error: fetchErr } = await supabase
      .from('err_program_report')
      .select('id, project_id')
      .eq('id', id)
      .single()
    if (fetchErr || !row) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }
    if (!row.project_id) {
      return NextResponse.json(
        { error: 'Only F5 reports linked to a portal project can be deleted' },
        { status: 400 }
      )
    }

    const projectId = row.project_id as string
    const scope = await assertProjectInGrantAccess(projectId)
    if (!scope.ok) return scope.response

    const { count: reachCount } = await supabase
      .from('err_program_reach')
      .select('id', { count: 'exact', head: true })
      .eq('report_id', id)

    const { data: beforeProj } = await supabase
      .from('err_projects')
      .select('f5_status')
      .eq('id', projectId)
      .maybeSingle()

    const { error: reachErr } = await supabase.from('err_program_reach').delete().eq('report_id', id)
    if (reachErr) throw reachErr
    const { error: filesErr } = await supabase.from('err_program_files').delete().eq('report_id', id)
    if (filesErr) throw filesErr
    const { error: repErr } = await supabase.from('err_program_report').delete().eq('id', id)
    if (repErr) throw repErr

    let f5StatusSideEffect: { from: string | null; to: string } | null = null
    const statusResult = await resetReportingStatusIfNoReportsRemaining(supabase, projectId, 'f5')
    if (!statusResult.ok) {
      console.warn('F5 delete: failed to reset reporting status', statusResult.error)
    } else if (!('skipped' in statusResult && statusResult.skipped)) {
      f5StatusSideEffect = {
        from: (beforeProj?.f5_status as string | null) ?? null,
        to: 'waiting',
      }
    }

    const endDateResult = await syncProjectEndDateFromF5(supabase, projectId)
    if (!endDateResult.ok) {
      console.warn('F5 delete: failed to sync project end_date', endDateResult.error)
    }

    await emitF123Audit({
      action: 'f5.report_deleted',
      endpoint: 'DELETE /api/f5/report/[id]',
      request: req,
      targetType: 'f5_report',
      targetId: String(id),
      oldValues: {
        report_id: id,
        reach_count: reachCount ?? 0,
      },
      newValues: null,
      metadata: {
        project_id: projectId,
        report_id: id,
        reach_count: reachCount ?? 0,
        ...(f5StatusSideEffect ? { f5_status_side_effect: f5StatusSideEffect } : {}),
        ...(endDateResult.ok ? { end_date_side_effect: endDateResult.end_date } : {}),
      },
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('F5 report DELETE error', e)
    return NextResponse.json({ error: 'Failed to delete report' }, { status: 500 })
  }
}
