import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import {
  applyGrantGridIdFilter,
  chunkGrantScopeIds,
  getUserGrantAccess,
} from '@/lib/userGrantAccess'
import {
  applyOrganizationIdFilter,
  getUserOrgScope,
  orgScopeBlocksAllData,
  orgScopeBlocksResourceType,
} from '@/lib/canvas/orgScope'

// GET /api/pool/by-grant-for-state?state=Kassala
export async function GET(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const [grantAccess, orgScope] = await Promise.all([
      getUserGrantAccess(),
      getUserOrgScope(),
    ])
    if (orgScopeBlocksAllData(orgScope)) {
      return NextResponse.json([])
    }
    if (
      orgScope.mode === 'disclosed' &&
      orgScopeBlocksResourceType(orgScope, 'decisions') &&
      orgScopeBlocksResourceType(orgScope, 'f1')
    ) {
      return NextResponse.json([])
    }
    if (orgScope.mode !== 'disclosed' && grantAccess.mode === 'none') {
      return NextResponse.json([])
    }

    const { searchParams } = new URL(request.url)
    const state = searchParams.get('state')
    if (!state) return NextResponse.json({ error: 'state is required' }, { status: 400 })

    if (grantAccess.mode === 'partner' && orgScope.mode !== 'disclosed') {
      const grantCallIds = new Set<string>()
      for (const batch of chunkGrantScopeIds(grantAccess.grantGridIds)) {
        let from = 0
        const pageSize = 1000
        while (true) {
          let query = supabase.from('err_projects').select('grant_call_id, state')
          query = applyGrantGridIdFilter(query, { ...grantAccess, grantGridIds: batch })
          query = applyOrganizationIdFilter(query, orgScope, 'organization_id', 'f1')
          const { data, error } = await query.range(from, from + pageSize - 1)
          if (error) throw error
          if (!data?.length) break
          for (const row of data) {
            if (row.state === state && row.grant_call_id) grantCallIds.add(String(row.grant_call_id))
          }
          if (data.length < pageSize) break
          from += pageSize
        }
      }
      const names = new Map<string, string | null>()
      const ids = Array.from(grantCallIds)
      for (const batch of chunkGrantScopeIds(ids)) {
        const { data, error } = await supabase
          .from('grant_calls')
          .select('id, name')
          .in('id', batch)
        if (error) throw error
        for (const row of data || []) {
          if (row.id) names.set(String(row.id), row.name ?? null)
        }
      }
      const rows = ids.map((grantCallId) => ({
        donor_id: null,
        donor_name: null,
        donor_short: null,
        grant_call_id: grantCallId,
        grant_call_name: names.get(grantCallId) ?? null,
        included: 0,
        remaining_for_state: 0,
      }))
      return NextResponse.json(rows)
    }

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

    let usage: {
      expenses: unknown
      funding_status: string | null
      grant_call_id: string | null
      state: string | null
    }[] = []
    {
      let from = 0
      const pageSize = 1000
      while (true) {
        let q = supabase
          .from('err_projects')
          .select('expenses, funding_status, grant_call_id, state')
          .range(from, from + pageSize - 1)
        q = applyOrganizationIdFilter(q, orgScope, 'organization_id', 'f1')
        const { data: page, error: usageErr } = await q
        if (usageErr) throw usageErr
        if (!page?.length) break
        usage.push(...page)
        if (page.length < pageSize) break
        from += pageSize
      }
    }

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


