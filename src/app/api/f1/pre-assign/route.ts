import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

// POST /api/f1/pre-assign { workplan_id, grant_call_id }
export async function POST(req: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const { workplan_id, grant_call_id } = await req.json()
    if (!workplan_id || !grant_call_id) {
      return NextResponse.json({ error: 'workplan_id and grant_call_id are required' }, { status: 400 })
    }

    // Load workplan and compute its total amount
    const { data: wp, error: wpErr } = await supabase
      .from('err_projects')
      .select('id, expenses')
      .eq('id', workplan_id)
      .single()

    if (wpErr || !wp) throw wpErr || new Error('Workplan not found')

    const expenses = typeof (wp as any).expenses === 'string' ? JSON.parse((wp as any).expenses) : (wp as any).expenses
    const workplanAmount = (expenses || []).reduce((s: number, e: any) => s + (e.total_cost || 0), 0)

    // Compute remaining for this grant call: included - committed - pending
    const { data: includedRows, error: incErr } = await supabase
      .from('cycle_grant_inclusions')
      .select('amount_included')
      .eq('grant_call_id', grant_call_id)

    if (incErr) throw incErr
    const included = (includedRows || []).reduce((s, r) => s + (r.amount_included || 0), 0)

    const { data: usage, error: usageErr } = await supabase
      .from('err_projects')
      .select('expenses, funding_status, grant_call_id')
      .eq('grant_call_id', grant_call_id)

    if (usageErr) throw usageErr

    const sumExpenses = (rows: any[]) => rows.reduce((sum, p) => {
      try {
        const exps = typeof p.expenses === 'string' ? JSON.parse(p.expenses) : p.expenses
        return sum + (exps || []).reduce((s2: number, e: any) => s2 + (e.total_cost || 0), 0)
      } catch { return sum }
    }, 0)

    const committed = sumExpenses((usage || []).filter(u => u.funding_status === 'committed'))
    const pending = sumExpenses((usage || []).filter(u => u.funding_status === 'allocated'))
    const remaining = included - committed - pending

    if (workplanAmount > remaining) {
      return NextResponse.json({ error: 'Insufficient remaining in grant', remaining }, { status: 409 })
    }

    // Get donor_id from grant_calls
    const { data: grantCall, error: gcErr } = await supabase
      .from('grant_calls')
      .select('donor_id')
      .eq('id', grant_call_id)
      .single()

    if (gcErr) throw gcErr

    // Update workplan with grant_call_id and donor_id and set funding_status to allocated
    const { error: updErr } = await supabase
      .from('err_projects')
      .update({ grant_call_id, donor_id: grantCall?.donor_id || null, funding_status: 'allocated' })
      .eq('id', workplan_id)

    if (updErr) throw updErr

    // Concurrency guard: re-check remaining after update; if negative, revert
    const { data: usageAfter, error: usageAfterErr } = await supabase
      .from('err_projects')
      .select('expenses, funding_status, grant_call_id')
      .eq('grant_call_id', grant_call_id)

    if (usageAfterErr) throw usageAfterErr

    const committedAfter = sumExpenses((usageAfter || []).filter(u => u.funding_status === 'committed'))
    const pendingAfter = sumExpenses((usageAfter || []).filter(u => u.funding_status === 'allocated'))
    const remainingAfter = included - committedAfter - pendingAfter

    if (remainingAfter < 0) {
      // Revert assignment
      await supabase
        .from('err_projects')
        .update({ grant_call_id: null })
        .eq('id', workplan_id)
      return NextResponse.json({ error: 'Overdrawn due to concurrent updates', remaining }, { status: 409 })
    }

    return NextResponse.json({ ok: true, remaining_after: remainingAfter })
  } catch (error) {
    console.error('Pre-assign error:', error)
    return NextResponse.json({ error: 'Failed to pre-assign workplan' }, { status: 500 })
  }
}


