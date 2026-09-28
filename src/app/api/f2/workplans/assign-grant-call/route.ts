import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

function baseGrantSerial(serial: string | null | undefined): string | null {
  if (!serial) return null
  if (!serial.includes('-')) return serial
  const parts = serial.split('-')
  const last = parts[parts.length - 1]
  if (/^\d{3}$/.test(last)) return parts.slice(0, -1).join('-')
  return serial
}

/** POST /api/f2/workplans/assign-grant-call */
export async function POST(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const workplanId = body.workplan_id as string | undefined
    const grantCallId = body.grant_call_id as string | undefined
    const assignmentReason = body.reason as string | undefined
    const cycleId = body.funding_cycle_id as string | undefined
    const workplanAmount = Number(body.workplan_amount ?? 0)

    if (!workplanId || !grantCallId || !assignmentReason) {
      return NextResponse.json({ error: 'workplan_id, grant_call_id, and reason are required' }, { status: 400 })
    }

    const { data: workplanData, error: workplanError } = await supabase
      .from('err_projects')
      .select('cycle_state_allocation_id, grant_serial_id, state')
      .eq('id', workplanId)
      .single()
    if (workplanError) throw workplanError

    const { data: grantCallAllocation, error: allocationError } = await supabase
      .from('grant_call_state_allocations')
      .select('id')
      .eq('grant_call_id', grantCallId)
      .eq('state_name', workplanData.state)
      .order('decision_no', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (allocationError || !grantCallAllocation) {
      return NextResponse.json(
        { error: `No state allocation found for grant call and state: ${workplanData.state}` },
        { status: 400 }
      )
    }

    const { data: grantCallRow, error: grantCallFetchError } = await supabase
      .from('grant_calls')
      .select('donor_id')
      .eq('id', grantCallId)
      .single()
    if (grantCallFetchError) throw grantCallFetchError

    const { error: updateError } = await supabase
      .from('err_projects')
      .update({
        grant_call_id: grantCallId,
        grant_call_state_allocation_id: grantCallAllocation.id,
        donor_id: grantCallRow?.donor_id || null,
      })
      .eq('id', workplanId)
    if (updateError) throw updateError

    const { error: ledgerError } = await supabase
      .from('grant_project_commitment_ledger')
      .insert({
        workplan_id: workplanId,
        grant_call_id: grantCallId,
        grant_call_state_allocation_id: grantCallAllocation.id,
        grant_serial_id: baseGrantSerial(workplanData.grant_serial_id) || workplanId,
        delta_amount: workplanAmount,
        reason: `Grant call assignment: ${assignmentReason}`,
        created_by: session.user.id,
        funding_cycle_id: cycleId || null,
        cycle_state_allocation_id: workplanData.cycle_state_allocation_id,
      })
    if (ledgerError) throw ledgerError

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('POST /api/f2/workplans/assign-grant-call:', e)
    return NextResponse.json({ error: 'Failed to assign workplan to grant call' }, { status: 500 })
  }
}
