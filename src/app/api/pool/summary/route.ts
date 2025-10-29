import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// GET /api/pool/summary - Overall pool across cycles
export async function GET() {
  try {
    const supabase = getSupabaseRouteClient()
    // Debug: Check if we have a session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    const hasSession = !!session
    
    // Get all grant calls and their amounts
    const { data: grantCalls, error: grantErr } = await supabase
      .from('grant_calls')
      .select('id, amount')
      .eq('status', 'open')

    if (grantErr) {
      return NextResponse.json({ 
        error: 'Failed to compute pool summary',
        debug: {
          hasSession,
          sessionError: sessionError?.message,
          grantCallsError: grantErr.message,
          grantCallsCode: grantErr.code
        }
      }, { status: 500 })
    }
    
    const total_grants = (grantCalls || []).reduce((sum, grant) => sum + (grant.amount || 0), 0)

    // Get all inclusions with their grant calls
    const { data: inclusions, error: incErr } = await supabase
      .from('cycle_grant_inclusions')
      .select(`
        amount_included,
        grant_call_id,
        grant_calls (
          amount
        )
      `)

    if (incErr) {
      return NextResponse.json({ 
        error: 'Failed to compute pool summary',
        debug: {
          hasSession,
          sessionError: sessionError?.message,
          inclusionsError: incErr.message,
          inclusionsCode: incErr.code
        }
      }, { status: 500 })
    }

    // Calculate total included and total available from grants
    const total_included = (inclusions || []).reduce((sum, inc) => sum + (inc.amount_included || 0), 0)
    
    // Calculate total not yet included from any grant
    const total_not_included = total_grants - total_included

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
    const remaining = total_included - committed - pending

    return NextResponse.json({ 
      total_included, 
      total_committed: committed, 
      total_pending: pending, 
      remaining,
      total_grants,
      total_not_included,
      debug: {
        hasSession,
        grantCallsCount: grantCalls?.length || 0,
        inclusionsCount: inclusions?.length || 0
      }
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Pool summary error:', error)
    return NextResponse.json({ error: 'Failed to compute pool summary' }, { status: 500 })
  }
}


