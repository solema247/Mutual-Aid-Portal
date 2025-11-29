import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

// GET /api/pool/by-donor - Aggregated by donor and grant call
export async function GET() {
  try {
    const supabase = getSupabaseRouteClient()
    // Inclusions with grant and donor
    const { data: inclusions, error: incErr } = await supabase
      .from('cycle_grant_inclusions')
      .select(`
        amount_included,
        grant_call_id,
        grant_calls (
          id, name, donor_id,
          donors ( id, name, short_name )
        )
      `)

    if (incErr) throw incErr

    // Normalize inclusions
    type Row = { donor_id: string | null; donor_name: string | null; grant_call_id: string; grant_call_name: string | null; amount_included: number }
    const norm: Row[] = (inclusions || []).map((r: any) => {
      const donorObj = r.grant_calls?.donors || null
      return {
        donor_id: donorObj?.id || r.grant_calls?.donor_id || null,
        donor_name: donorObj?.name || null,
        grant_call_id: r.grant_call_id,
        grant_call_name: r.grant_calls?.name || null,
        amount_included: r.amount_included || 0
      }
    })

    const includedByGrant = new Map<string, { donor_id: string | null; donor_name: string | null; grant_call_name: string | null; included: number }>()
    for (const r of norm) {
      const cur = includedByGrant.get(r.grant_call_id) || { donor_id: r.donor_id, donor_name: r.donor_name, grant_call_name: r.grant_call_name, included: 0 }
      cur.included += r.amount_included
      includedByGrant.set(r.grant_call_id, cur)
    }

    // Usage from err_projects by grant_call_id
    const { data: projects, error: projErr } = await supabase
      .from('err_projects')
      .select('expenses, funding_status, grant_call_id')

    if (projErr) throw projErr

    const sumExpenses = (rows: any[]) => rows.reduce((sum, p) => {
      try {
        const exps = typeof p.expenses === 'string' ? JSON.parse(p.expenses) : p.expenses
        return sum + (exps || []).reduce((s2: number, e: any) => s2 + (e.total_cost || 0), 0)
      } catch { return sum }
    }, 0)

    const byGrantCommitted = new Map<string, number>()
    const byGrantPending = new Map<string, number>()
    for (const p of projects || []) {
      if (!p.grant_call_id) continue // Only count projects assigned to a grant call
      const amt = sumExpenses([p])
      if (p.funding_status === 'committed') {
        byGrantCommitted.set(p.grant_call_id, (byGrantCommitted.get(p.grant_call_id) || 0) + amt)
      }
      // Pending = assigned to grant call but not yet committed
      if (p.funding_status !== 'committed') {
        byGrantPending.set(p.grant_call_id, (byGrantPending.get(p.grant_call_id) || 0) + amt)
      }
    }

    const rows = Array.from(includedByGrant.entries()).map(([grant_call_id, v]) => {
      const committed = byGrantCommitted.get(grant_call_id) || 0
      const pending = byGrantPending.get(grant_call_id) || 0
      const remaining = v.included - committed - pending
      return { donor_id: v.donor_id, donor_name: v.donor_name, grant_call_id, grant_call_name: v.grant_call_name, included: v.included, committed, pending, remaining }
    })

    return NextResponse.json(rows, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  } catch (error) {
    console.error('Pool by-donor error:', error)
    return NextResponse.json({ error: 'Failed to compute by-donor' }, { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  }
}


