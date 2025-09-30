import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

// GET /api/pool/by-state - Aggregated view across cycles
export async function GET() {
  try {
    // Caps: sum allocations by state across cycles
    // Sum allocations by state across all tranches and cycles
    const { data: allocs, error: allocErr } = await supabase
      .from('cycle_state_allocations')
      .select('state_name, amount')

    if (allocErr) throw allocErr

    const capByState = new Map<string, number>()
    for (const a of allocs || []) {
      capByState.set(a.state_name, (capByState.get(a.state_name) || 0) + (a.amount || 0))
    }

    // Usage from err_projects with CSA link; fallback by state if CSA missing
    const { data: projects, error: projErr } = await supabase
      .from('err_projects')
      .select('expenses, funding_status, state')

    if (projErr) throw projErr

    const sumBy = (status: 'allocated' | 'committed') => {
      const byState = new Map<string, number>()
      for (const p of projects || []) {
        if (p.funding_status !== status) continue
        try {
          const exps = typeof p.expenses === 'string' ? JSON.parse(p.expenses) : p.expenses
          const amount = (exps || []).reduce((s: number, e: any) => s + (e.total_cost || 0), 0)
          const key = p.state || 'Unknown'
          byState.set(key, (byState.get(key) || 0) + amount)
        } catch { /* ignore */ }
      }
      return byState
    }

    const committedByState = sumBy('committed')
    const pendingByState = sumBy('allocated')

    const states = Array.from(new Set<string>([
      ...Array.from(capByState.keys()),
      ...Array.from(committedByState.keys()),
      ...Array.from(pendingByState.keys())
    ]))

    const rows = states.map(state => {
      const allocated = capByState.get(state) || 0
      const committed = committedByState.get(state) || 0
      const pending = pendingByState.get(state) || 0
      const remaining = allocated - committed - pending
      return { state_name: state, allocated, committed, pending, remaining }
    })

    return NextResponse.json(rows)
  } catch (error) {
    console.error('Pool by-state error:', error)
    return NextResponse.json({ error: 'Failed to compute by-state' }, { status: 500 })
  }
}


