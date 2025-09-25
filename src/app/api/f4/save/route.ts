import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

export async function POST(req: Request) {
  try {
    const { project_id, summary, expenses, file_key_temp, uploaded_by } = await req.json()
    if (!project_id || !summary) return NextResponse.json({ error: 'project_id and summary required' }, { status: 400 })

    // Fetch ERR ID from the linked project
    let err_id: string | null = null
    try {
      const { data: prj } = await supabase
        .from('err_projects')
        .select('err_id')
        .eq('id', project_id)
        .single()
      err_id = (prj as any)?.err_id || null
    } catch {}

    // Insert summary
    const { data: inserted, error: insErr } = await supabase
      .from('err_summary')
      .insert({
        project_id,
        err_id,
        report_date: summary.report_date || null,
        total_grant: summary.total_grant ?? null,
        total_expenses: summary.total_expenses ?? null,
        remainder: summary.remainder ?? null,
        beneficiaries: summary.beneficiaries || null,
        lessons: summary.lessons || null,
        training: summary.training || null,
        project_objectives: summary.project_objectives || null
      })
      .select('id')
      .single()
    if (insErr) throw insErr
    const summary_id = inserted.id

    // If a summary file exists, move/record it as an attachment
    if (file_key_temp) {
      // Keep it simple: client directly uploaded using SDK to the temp key; we just register it
      await supabase
        .from('err_summary_attachments')
        .insert({ summary_id, file_key: file_key_temp, file_type: 'summary_pdf', uploaded_by: uploaded_by || null })
    }

    // Insert expenses
    let expense_ids: number[] = []
    if (Array.isArray(expenses) && expenses.length) {
      const payload = expenses.map((e: any) => ({
        project_id,
        expense_activity: e.expense_activity || null,
        expense_description: e.expense_description || null,
        expense_amount: e.expense_amount ?? null,
        payment_date: e.payment_date || null,
        payment_method: e.payment_method || null,
        receipt_no: e.receipt_no || null,
        seller: e.seller || null,
        uploaded_by: uploaded_by || null
      }))
      const { data: expRows, error: expErr } = await supabase
        .from('err_expense')
        .insert(payload)
        .select('expense_id')
      if (expErr) throw expErr
      expense_ids = (expRows || []).map((r: any) => r.expense_id)
    }

    return NextResponse.json({ summary_id, expense_ids })
  } catch (e) {
    console.error('F4 save error', e)
    return NextResponse.json({ error: 'Failed to save F4' }, { status: 500 })
  }
}


