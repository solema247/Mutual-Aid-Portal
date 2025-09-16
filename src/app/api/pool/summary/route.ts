import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

// GET /api/pool/summary - Overall pool across cycles
export async function GET() {
  try {
    // Total available: sum of all included grant amounts across cycles
    const { data: inclusions, error: incErr } = await supabase
      .from('cycle_grant_inclusions')
      .select('amount_included')

    if (incErr) throw incErr
    const total_available = (inclusions || []).reduce((s, r) => s + (r.amount_included || 0), 0)

    // Usage from err_projects
    const { data: projects, error: projErr } = await supabase
      .from('err_projects')
      .select('expenses, funding_status')

    if (projErr) throw projErr

    const sumExpenses = (rows: any[]) => rows.reduce((sum, p) => {
      try {
        const exps = typeof p.expenses === 'string' ? JSON.parse(p.expenses) : p.expenses
        return sum + (exps || []).reduce((s2: number, e: any) => s2 + (e.total_cost || 0), 0)
      } catch {
        return sum
      }
    }, 0)

    const committed = sumExpenses((projects || []).filter(p => p.funding_status === 'committed'))
    const pending = sumExpenses((projects || []).filter(p => p.funding_status === 'allocated'))
    const remaining = total_available - committed - pending

    return NextResponse.json({ total_available, total_committed: committed, total_pending: pending, remaining })
  } catch (error) {
    console.error('Pool summary error:', error)
    return NextResponse.json({ error: 'Failed to compute pool summary' }, { status: 500 })
  }
}


