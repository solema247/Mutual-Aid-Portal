import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseRouteClient()
    const id = params.id
    if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    // Load F1 project (err_projects)
    const { data: project, error: projErr } = await supabase
      .from('err_projects')
      .select(`
        id,
        date,
        state,
        locality,
        status,
        project_objectives,
        intended_beneficiaries,
        estimated_beneficiaries,
        estimated_timeframe,
        additional_support,
        expenses,
        planned_activities,
        grant_call_id,
        emergency_room_id,
        emergency_rooms ( id, name, name_ar, err_code )
      `)
      .eq('id', id)
      .single()
    if (projErr) throw projErr

    // Load F4 summaries for this project
    const { data: summaries, error: sumErr } = await supabase
      .from('err_summary')
      .select('id, report_date, total_grant, total_expenses, remainder, lessons, training, excess_expenses, surplus_use, created_at')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
    if (sumErr) throw sumErr

    const summaryIds = (summaries || []).map((s: any) => s.id)
    let expensesBySummary: Record<number, any[]> = {}
    if (summaryIds.length) {
      const { data: expenses } = await supabase
        .from('err_expense')
        .select('expense_id, summary_id, expense_activity, expense_description, expense_amount, payment_date, payment_method, receipt_no, seller')
        .in('summary_id', summaryIds as any)
      for (const e of (expenses || [])) {
        const sid = (e as any).summary_id
        expensesBySummary[sid] = expensesBySummary[sid] || []
        expensesBySummary[sid].push(e)
      }
    }

    const summariesWithExpenses = (summaries || []).map((s: any) => ({
      ...s,
      expenses: expensesBySummary[s.id] || []
    }))

    return NextResponse.json({ project, summaries: summariesWithExpenses })
  } catch (e) {
    console.error('overview/project detail error', e)
    return NextResponse.json({ error: 'Failed to load project detail' }, { status: 500 })
  }
}


