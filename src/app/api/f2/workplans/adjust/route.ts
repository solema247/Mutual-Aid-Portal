import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import {
  coordinatorWriteForbiddenResponse,
  getUserOrgScope,
  isDisclosedCoordinator,
} from '@/lib/canvas/orgScope'

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

/** POST /api/f2/workplans/adjust */
export async function POST(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (isDisclosedCoordinator(await getUserOrgScope())) return coordinatorWriteForbiddenResponse()

    const body = await request.json()
    const workplanId = body.workplan_id as string | undefined
    const expenses = body.expenses
    const reason = body.reason as string | undefined
    const grantSerialId = body.grant_serial_id as string | null | undefined

    if (!workplanId || !expenses || !reason) {
      return NextResponse.json({ error: 'workplan_id, expenses, and reason are required' }, { status: 400 })
    }

    const { data: workplanData, error: workplanError } = await supabase
      .from('err_projects')
      .select('expenses, grant_call_id, grant_call_state_allocation_id, grant_serial_id')
      .eq('id', workplanId)
      .single()
    if (workplanError) throw workplanError

    const finalSerialId =
      grantSerialId ||
      (workplanData.grant_serial_id === 'new' ? null : workplanData.grant_serial_id)

    if (!finalSerialId) {
      return NextResponse.json(
        { error: 'grant_serial_id is required when workplan serial is new' },
        { status: 400 }
      )
    }

    const patch: Record<string, unknown> = {
      expenses: JSON.stringify(expenses),
    }
    if (grantSerialId) patch.grant_serial_id = grantSerialId

    const oldTotal = totalFromExpenses(workplanData.expenses)
    const newTotal = totalFromExpenses(expenses)
    const deltaAmount = newTotal - oldTotal

    const { error: expensesError } = await supabase
      .from('err_projects')
      .update(patch)
      .eq('id', workplanId)
    if (expensesError) throw expensesError

    const { error: ledgerError } = await supabase
      .from('grant_project_commitment_ledger')
      .insert({
        workplan_id: workplanId,
        grant_call_id: workplanData.grant_call_id,
        grant_call_state_allocation_id: workplanData.grant_call_state_allocation_id,
        grant_serial_id: finalSerialId,
        delta_amount: deltaAmount,
        reason,
        created_by: session.user.id,
      })
    if (ledgerError) throw ledgerError

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('POST /api/f2/workplans/adjust:', e)
    return NextResponse.json({ error: 'Failed to adjust workplan' }, { status: 500 })
  }
}
