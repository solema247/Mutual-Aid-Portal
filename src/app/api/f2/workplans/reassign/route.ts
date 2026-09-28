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

/** POST /api/f2/workplans/reassign */
export async function POST(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const workplanId = body.workplan_id as string | undefined
    const newGrantCallId = body.new_grant_call_id as string | undefined
    const newAllocationId = body.new_allocation_id as string | undefined
    const newSerialId = body.new_serial_id as string | undefined
    const reason = body.reason as string | undefined

    if (!workplanId || !newGrantCallId || !newAllocationId || !newSerialId || !reason) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data: workplanData, error: workplanError } = await supabase
      .from('err_projects')
      .select('expenses, grant_call_id, grant_call_state_allocation_id, grant_serial_id')
      .eq('id', workplanId)
      .single()
    if (workplanError) throw workplanError

    const totalAmount = totalFromExpenses(workplanData.expenses)
    const oldSerial = baseGrantSerial(workplanData.grant_serial_id)

    const { error: oldLedgerError } = await supabase
      .from('grant_project_commitment_ledger')
      .insert({
        workplan_id: workplanId,
        grant_call_id: workplanData.grant_call_id,
        grant_call_state_allocation_id: workplanData.grant_call_state_allocation_id,
        grant_serial_id: oldSerial,
        delta_amount: -totalAmount,
        reason,
        created_by: session.user.id,
      })
    if (oldLedgerError) throw oldLedgerError

    const { error: newLedgerError } = await supabase
      .from('grant_project_commitment_ledger')
      .insert({
        workplan_id: workplanId,
        grant_call_id: newGrantCallId,
        grant_call_state_allocation_id: newAllocationId,
        grant_serial_id: newSerialId,
        delta_amount: totalAmount,
        reason,
        created_by: session.user.id,
      })
    if (newLedgerError) throw newLedgerError

    const { data: newGrantCallRow, error: newGrantCallError } = await supabase
      .from('grant_calls')
      .select('donor_id')
      .eq('id', newGrantCallId)
      .single()
    if (newGrantCallError) throw newGrantCallError

    const { error: updateError } = await supabase
      .from('err_projects')
      .update({
        grant_call_id: newGrantCallId,
        grant_call_state_allocation_id: newAllocationId,
        grant_serial_id: newSerialId,
        donor_id: newGrantCallRow?.donor_id || null,
      })
      .eq('id', workplanId)
    if (updateError) throw updateError

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('POST /api/f2/workplans/reassign:', e)
    return NextResponse.json({ error: 'Failed to reassign workplan' }, { status: 500 })
  }
}
