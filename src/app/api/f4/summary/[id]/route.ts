import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const summaryId = Number(params.id)
    if (!summaryId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const { data: summary, error } = await supabase
      .from('err_summary')
      .select('*, err_projects (err_id, state, project_objectives, emergency_rooms (name, name_ar, err_code))')
      .eq('id', summaryId)
      .single()
    if (error) throw error

    const [{ data: attachments }] = await Promise.all([
      supabase.from('err_summary_attachments').select('*').eq('summary_id', summaryId)
    ])

    // Prefer expenses linked to this summary; fall back to project-level if summary_id not present
    let expenses: any[] | null = null
    const { data: expBySummary } = await supabase
      .from('err_expense')
      .select('*')
      .eq('summary_id', summaryId)
    if (Array.isArray(expBySummary) && expBySummary.length > 0) {
      expenses = expBySummary
    } else {
      const { data: expByProject } = await supabase
        .from('err_expense')
        .select('*')
        .eq('project_id', summary?.project_id || '')
      expenses = expByProject || []
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

    return NextResponse.json({ summary, attachments: attachments || [], expenses: (expenses || []).map((e: any) => ({ ...e, receipts: receiptsByExpense[e.expense_id] || [] })) })
  } catch (e) {
    console.error('F4 summary detail error', e)
    return NextResponse.json({ error: 'Failed to load summary' }, { status: 500 })
  }
}


