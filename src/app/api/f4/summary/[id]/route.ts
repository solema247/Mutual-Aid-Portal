import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseRouteClient()
    const summaryId = Number(params.id)
    if (!summaryId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const { data: summary, error } = await supabase
      .from('err_summary')
      .select('*, err_projects (err_id, state, project_objectives, emergency_rooms (name, name_ar, err_code)), activities_raw_import (id, "ERR CODE", "ERR Name", "State", "Description of ERRs activity")')
      .eq('id', summaryId)
      .single()
    if (error) throw error

    const [{ data: attachments }] = await Promise.all([
      supabase.from('err_summary_attachments').select('*').eq('summary_id', summaryId)
    ])

    // Prefer expenses linked to this summary; fall back to project-level or activities_raw_import-level if summary_id not present
    let expenses: any[] | null = null
    const { data: expBySummary } = await supabase
      .from('err_expense')
      .select('*')
      .eq('summary_id', summaryId)
    if (Array.isArray(expBySummary) && expBySummary.length > 0) {
      expenses = expBySummary
    } else {
      // Try project_id first (portal projects)
      if (summary?.project_id) {
        const { data: expByProject } = await supabase
          .from('err_expense')
          .select('*')
          .eq('project_id', summary.project_id)
        expenses = expByProject || []
      }
      // If no expenses found and this is a historical project, try activities_raw_import_id
      if ((!expenses || expenses.length === 0) && summary?.activities_raw_import_id) {
        const { data: expByHistorical } = await supabase
          .from('err_expense')
          .select('*')
          .eq('activities_raw_import_id', summary.activities_raw_import_id)
        expenses = expByHistorical || []
      }
    }

    // receipts grouped by expense
    const expenseIds = (expenses || []).map((e: any) => e.expense_id)
    let receiptsByExpense: Record<number, any[]> = {}
    if (expenseIds.length) {
      const { data: receipts } = await supabase
        .from('err_expense_receipts')
        .select('*')
        .in('expense_id', expenseIds)
      for (const r of receipts || []) {
        receiptsByExpense[r.expense_id] = receiptsByExpense[r.expense_id] || []
        receiptsByExpense[r.expense_id].push(r)
      }
    }

    // F4 % completion: planned total from project, reported total from expenses
    let planned_total: number | null = null
    const reported_total = (expenses || []).reduce((s: number, e: any) => s + (Number(e.expense_amount) || 0), 0)
    if (summary?.project_id) {
      const { data: proj } = await supabase
        .from('err_projects')
        .select('expenses, planned_activities')
        .eq('id', summary.project_id)
        .single()
      if (proj) {
        const plannedArr = Array.isArray(proj.planned_activities) ? proj.planned_activities : (typeof proj.planned_activities === 'string' ? JSON.parse(proj.planned_activities || '[]') : [])
        const fromPlanned = (Array.isArray(plannedArr) ? plannedArr : []).reduce((s: number, pa: any) => {
          const inner = Array.isArray(pa?.expenses) ? pa.expenses : []
          return s + inner.reduce((ss: number, ie: any) => ss + (Number(ie.total) || 0), 0)
        }, 0)
        const expensesArr = Array.isArray(proj.expenses) ? proj.expenses : (typeof proj.expenses === 'string' ? JSON.parse(proj.expenses || '[]') : [])
        const fromExpenses = (Array.isArray(expensesArr) ? expensesArr : []).reduce((s: number, ex: any) => s + (Number(ex.total_cost) || 0), 0)
        planned_total = fromExpenses > 0 ? fromExpenses : fromPlanned
      }
    }
    const completion_percent = planned_total != null && planned_total > 0
      ? Math.round((reported_total / planned_total) * 100)
      : null
    const totals_match = planned_total != null && Math.abs((reported_total || 0) - planned_total) < 0.01

    return NextResponse.json({
      summary,
      attachments: attachments || [],
      expenses: (expenses || []).map((e: any) => ({ ...e, receipts: receiptsByExpense[e.expense_id] || [] })),
      completion: { completion_percent, planned_total, reported_total, totals_match }
    })
  } catch (e) {
    console.error('F4 summary detail error', e)
    return NextResponse.json({ error: 'Failed to load summary' }, { status: 500 })
  }
}


