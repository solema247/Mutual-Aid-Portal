import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

// GET /api/pool/by-grant-for-state?state=Kassala
export async function GET(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const { searchParams } = new URL(request.url)
    const state = searchParams.get('state')
    if (!state) return NextResponse.json({ error: 'state is required' }, { status: 400 })

    // Included per grant (pooled across cycles) + donor & grant names
    const { data: inclusions, error: incErr } = await supabase
      .from('cycle_grant_inclusions')
      .select(`
        amount_included,
        grant_call_id,
        grant_calls ( id, name, donor_id ),
        donors:grant_calls(donor_id, donors!inner(id, name, short_name))
      `)
    if (incErr) throw incErr

    type Row = { donor_id: string | null; donor_name: string | null; donor_short?: string | null; grant_call_id: string; grant_call_name: string | null; included: number }
    const includedByGrant = new Map<string, Row>()
    for (const r of inclusions || []) {
      const rowAny = r as any
      const donor = (rowAny?.donors?.[0]) as { id?: string; name?: string; short_name?: string } | undefined
      const grantCallsField = rowAny?.grant_calls
      const donorIdFromGrantCall = Array.isArray(grantCallsField) ? grantCallsField[0]?.donor_id : grantCallsField?.donor_id
      const grantCallNameFromGrantCall = Array.isArray(grantCallsField) ? grantCallsField[0]?.name : grantCallsField?.name
      const key = r.grant_call_id as string
      const prev = includedByGrant.get(key) || {
        donor_id: donor?.id || donorIdFromGrantCall || null,
        donor_name: donor?.name || null,
        donor_short: donor?.short_name || null,
        grant_call_id: key,
        grant_call_name: grantCallNameFromGrantCall || null,
        included: 0
      }
      prev.included += r.amount_included || 0
      includedByGrant.set(key, prev)
    }

    // Usage overall per grant
    const { data: usage, error: usageErr } = await supabase
      .from('err_projects')
      .select('expenses, funding_status, grant_call_id, state')
    if (usageErr) throw usageErr

    const sumExpenses = (rows: any[]) => rows.reduce((sum, p) => {
      try {
        const exps = typeof p.expenses === 'string' ? JSON.parse(p.expenses) : p.expenses
        return sum + (exps || []).reduce((s2: number, e: any) => s2 + (e.total_cost || 0), 0)
      } catch { return sum }
    }, 0)

    const byGrantCommitted = new Map<string, number>()
    const byGrantPending = new Map<string, number>()
    for (const p of usage || []) {
      if (!p.grant_call_id) continue
      const amt = sumExpenses([p])
      if (p.funding_status === 'committed') byGrantCommitted.set(p.grant_call_id, (byGrantCommitted.get(p.grant_call_id) || 0) + amt)
      if (p.funding_status === 'allocated') byGrantPending.set(p.grant_call_id, (byGrantPending.get(p.grant_call_id) || 0) + amt)
    }

    // State remaining overall
    // State cap across all tranches
    const { data: allocs, error: allocErr } = await supabase
      .from('cycle_state_allocations')
      .select('state_name, amount')
    if (allocErr) throw allocErr
    const stateCap = (allocs || [])
      .filter(a => a.state_name === state)
      .reduce((s, a: any) => s + (a.amount || 0), 0)

    const committedState = sumExpenses((usage || []).filter(u => u.state === state && u.funding_status === 'committed'))
    const pendingState = sumExpenses((usage || []).filter(u => u.state === state && u.funding_status === 'allocated'))
    const stateRemaining = stateCap - committedState - pendingState

    // Build rows limited by both grant overall remaining and state remaining
    const rows = Array.from(includedByGrant.values()).map(v => {
      const committed = byGrantCommitted.get(v.grant_call_id) || 0
      const pending = byGrantPending.get(v.grant_call_id) || 0
      const grantRemaining = v.included - committed - pending
      const remaining_for_state = Math.min(grantRemaining, stateRemaining)
      return { ...v, remaining_for_state }
    }).filter(r => r.remaining_for_state > 0)

    return NextResponse.json(rows)
  } catch (error) {
    console.error('by-grant-for-state error:', error)
    return NextResponse.json({ error: 'Failed to compute grant remaining for state' }, { status: 500 })
  }
}


