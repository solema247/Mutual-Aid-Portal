import { NextResponse } from 'next/server'
import {
  assertPermission,
  getRouteHandlerAuth,
  isErrSubmissionSource
} from '@/lib/routeHandlerAuth'
import { isApprovedUnassigned } from '../_shared'
import { assertProjectInRoomAccess } from '@/lib/userRoomAccess'
import { emitF123Audit } from '@/lib/f123Audit'
import { z } from 'zod'

const bodySchema = z.object({
  project_id: z.string().uuid(),
  grant_serial: z.string().min(1).max(512)
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

    const { project_id, grant_serial: grantSerial } = parsed.data

    const { data: serialRow } = await auth.supabase
      .from('grant_serials')
      .select('grant_serial')
      .eq('grant_serial', grantSerial)
      .maybeSingle()

    if (!serialRow) {
      return NextResponse.json({ error: 'Grant serial not found' }, { status: 400 })
    }

    const { data: project, error: projErr } = await auth.supabase
      .from('err_projects')
      .select('id, source, status, funding_status, grant_serial_id, workplan_number')
      .eq('id', project_id)
      .single()

    if (projErr || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Base ERR may only act on projects in its own emergency room
    const roomCheck = await assertProjectInRoomAccess(project_id)
    if (roomCheck.handled && !roomCheck.ok) return roomCheck.response

    if (!isErrSubmissionSource(project.source as string | null)) {
      return NextResponse.json({ error: 'Invalid project for ERR submissions' }, { status: 400 })
    }

    if (!isApprovedUnassigned(project)) {
      return NextResponse.json(
        { error: 'Project must be approved with unassigned funding' },
        { status: 400 }
      )
    }

    const { data: seqData, error: seqError } = await auth.supabase
      .from('grant_workplan_seq')
      .select('last_workplan_number')
      .eq('grant_serial', grantSerial)
      .single()

    if (seqError && seqError.code !== 'PGRST116') {
      console.error(seqError)
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
          last_used: new Date().toISOString()
        })

      if (insertSeqError) {
        console.error(insertSeqError)
        return NextResponse.json({ error: 'Failed to create workplan sequence' }, { status: 500 })
      }
    }

    const { error } = await auth.supabase
      .from('err_projects')
      .update({
        grant_serial_id: grantSerial,
        funding_status: 'allocated',
        workplan_number: nextWorkplanNumber
      })
      .eq('id', project_id)

    if (error) {
      console.error(error)
      return NextResponse.json({ error: 'Failed to update project' }, { status: 500 })
    }

    await emitF123Audit({
      action: 'f1.serial_assigned',
      actorUserId: auth.dbUser.id,
      endpoint: 'POST /api/f1/err/assign-grant',
      request,
      targetType: 'project',
      targetId: project_id,
      oldValues: {
        grant_serial_id: project.grant_serial_id ?? null,
        workplan_number: project.workplan_number ?? null,
        funding_status: project.funding_status ?? null
      },
      newValues: {
        grant_serial_id: grantSerial,
        workplan_number: nextWorkplanNumber,
        funding_status: 'allocated'
      },
      metadata: {
        grant_serial: grantSerial,
        last_workplan_number: seqData?.last_workplan_number ?? null
      }
    })

    return NextResponse.json({ success: true, workplan_number: nextWorkplanNumber })
  } catch (e: unknown) {
    const status = (e as Error & { statusCode?: number })?.statusCode
    if (status === 403) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('POST /api/f1/err/assign-grant:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
