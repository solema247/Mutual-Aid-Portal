import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

function totalFromExpenses(expenses: unknown): number {
  if (!expenses) return 0
  try {
    const arr = typeof expenses === 'string' ? JSON.parse(expenses) : expenses
    if (!Array.isArray(arr)) return 0
    return arr.reduce((sum: number, e: { total_cost?: number }) => sum + (e.total_cost || 0), 0)
  } catch {
    return 0
  }
}

function baseGrantSerial(serial: string | null | undefined): string | null {
  if (!serial) return null
  if (!serial.includes('-')) return serial
  const parts = serial.split('-')
  const last = parts[parts.length - 1]
  if (/^\d{3}$/.test(last)) return parts.slice(0, -1).join('-')
  return serial
}

/** POST /api/f2/workplans/approve */
export async function POST(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const workplanIds = body.workplan_ids as string[] | undefined
    if (!workplanIds?.length) {
      return NextResponse.json({ error: 'workplan_ids required' }, { status: 400 })
    }

    const { data: workplans, error: workplanError } = await supabase
      .from('err_projects')
      .select(`
        id,
        expenses,
        grant_call_id,
        grant_call_state_allocation_id,
        grant_serial_id,
        status,
        funding_status,
        state
      `)
      .in('id', workplanIds)
    if (workplanError) throw workplanError

    const pendingWorkplans = (workplans || []).filter((w) => w.funding_status === 'allocated')
    if (pendingWorkplans.length === 0) {
      return NextResponse.json({ error: 'No pending workplans to approve' }, { status: 400 })
    }

    const unassigned = pendingWorkplans.filter((w) => !w.grant_call_id)
    if (unassigned.length > 0) {
      return NextResponse.json(
        {
          error: `Cannot approve workplans without grant call assignment. ${unassigned.length} workplan(s) need assignment first.`,
        },
        { status: 400 }
      )
    }

    const ledgerEntries = []
    for (const workplan of pendingWorkplans) {
      let grantSerialId = workplan.grant_serial_id as string | null
      if (grantSerialId === 'new' || !grantSerialId) {
        const { data: grantSerialData, error: grantSerialError } = await supabase
          .from('grant_serials')
          .select('grant_serial')
          .eq('grant_call_id', workplan.grant_call_id)
          .eq('state_name', workplan.state)
          .maybeSingle()
        if (grantSerialError || !grantSerialData) {
          return NextResponse.json(
            { error: `Failed to find grant serial for workplan ${workplan.id}` },
            { status: 400 }
          )
        }
        grantSerialId = grantSerialData.grant_serial
        await supabase
          .from('err_projects')
          .update({ grant_serial_id: grantSerialId })
          .eq('id', workplan.id)
      } else {
        grantSerialId = baseGrantSerial(grantSerialId)
      }

      ledgerEntries.push({
        workplan_id: workplan.id,
        grant_call_id: workplan.grant_call_id,
        grant_call_state_allocation_id: workplan.grant_call_state_allocation_id,
        grant_serial_id: grantSerialId,
        delta_amount: totalFromExpenses(workplan.expenses),
        reason: 'Initial approval',
        created_by: session.user.id,
      })
    }

    const { error: ledgerError } = await supabase
      .from('grant_project_commitment_ledger')
      .insert(ledgerEntries)
    if (ledgerError) throw ledgerError

    const { markProjectsCommitted } = await import('@/lib/f2Commit')
    const { error: updateError } = await markProjectsCommitted(
      supabase,
      pendingWorkplans.map((w) => w.id),
      {
        status: 'approved',
        committedBy: session.user.email?.trim() || null,
      }
    )
    if (updateError) throw updateError

    return NextResponse.json({ success: true, approved_count: pendingWorkplans.length })
  } catch (e) {
    console.error('POST /api/f2/workplans/approve:', e)
    return NextResponse.json({ error: 'Failed to approve workplans' }, { status: 500 })
  }
}
