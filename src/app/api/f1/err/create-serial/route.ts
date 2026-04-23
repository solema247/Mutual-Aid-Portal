import { NextResponse } from 'next/server'
import {
  assertPermission,
  getRouteHandlerAuth,
  isErrSubmissionSource
} from '@/lib/routeHandlerAuth'
import { getCycleYYMM, isApprovedUnassigned, requestOrigin } from '../_shared'
import { z } from 'zod'

const bodySchema = z.object({
  project_id: z.string().uuid()
}).strict()

export async function POST (request: Request) {
  try {
    const auth = await getRouteHandlerAuth()
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    assertPermission(auth, 'f1_assign_grant')

    let raw: unknown
    try {
      raw = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const parsed = bodySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
    }

    const { project_id } = parsed.data

    const { data: project, error: projErr } = await auth.supabase
      .from('err_projects')
      .select(
        'id, source, status, funding_status, funding_cycle_id, cycle_state_allocation_id, state'
      )
      .eq('id', project_id)
      .single()

    if (projErr || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (!isErrSubmissionSource(project.source as string | null)) {
      return NextResponse.json({ error: 'Invalid project for ERR submissions' }, { status: 400 })
    }

    if (!isApprovedUnassigned(project)) {
      return NextResponse.json(
        { error: 'Project must be approved with unassigned funding to assign a serial' },
        { status: 400 }
      )
    }

    if (!project.funding_cycle_id || !project.cycle_state_allocation_id || !project.state) {
      return NextResponse.json({ error: 'Project is missing cycle or state information' }, { status: 400 })
    }

    const yymm = await getCycleYYMM(auth.supabase, project.funding_cycle_id)

    const createRes = await fetch(`${requestOrigin(request)}/api/fsystem/grant-serials/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        funding_cycle_id: project.funding_cycle_id,
        cycle_state_allocation_id: project.cycle_state_allocation_id,
        state_name: project.state,
        yymm
      })
    })

    if (!createRes.ok) {
      const errBody = await createRes.json().catch(() => ({}))
      return NextResponse.json(
        { error: errBody?.error || 'Failed to create grant serial' },
        { status: createRes.status >= 500 ? 502 : createRes.status }
      )
    }

    const newSerial = await createRes.json()
    const grantSerial = newSerial.grant_serial as string

    const { data: seqData, error: seqError } = await auth.supabase
      .from('grant_workplan_seq')
      .select('last_workplan_number')
      .eq('grant_serial', grantSerial)
      .single()

    if (seqError && seqError.code !== 'PGRST116') {
      console.error('grant_workplan_seq select:', seqError)
      return NextResponse.json({ error: 'Sequence lookup failed' }, { status: 500 })
    }

    const nextWorkplanNumber = seqData ? seqData.last_workplan_number + 1 : 1

    if (seqData) {
      const { error: updateSeqError } = await auth.supabase
        .from('grant_workplan_seq')
        .update({
          last_workplan_number: nextWorkplanNumber,
          last_used: new Date().toISOString()
        })
        .eq('grant_serial', grantSerial)

      if (updateSeqError) {
        console.error(updateSeqError)
        return NextResponse.json({ error: 'Failed to update workplan sequence' }, { status: 500 })
      }
    } else {
      const { error: insertSeqError } = await auth.supabase
        .from('grant_workplan_seq')
        .insert({
          grant_serial: grantSerial,
          last_workplan_number: nextWorkplanNumber,
          last_used: new Date().toISOString(),
          funding_cycle_id: project.funding_cycle_id
        })

      if (insertSeqError) {
        console.error(insertSeqError)
        return NextResponse.json({ error: 'Failed to create workplan sequence' }, { status: 500 })
      }
    }

    const { error: updError } = await auth.supabase
      .from('err_projects')
      .update({
        grant_serial_id: grantSerial,
        workplan_number: nextWorkplanNumber,
        funding_status: 'allocated'
      })
      .eq('id', project_id)

    if (updError) {
      console.error(updError)
      return NextResponse.json({ error: 'Failed to update project' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      grant_serial: grantSerial,
      workplan_number: nextWorkplanNumber
    })
  } catch (e: unknown) {
    const status = (e as Error & { statusCode?: number })?.statusCode
    if (status === 403) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('POST /api/f1/err/create-serial:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
