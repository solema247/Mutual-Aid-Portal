import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { translateF4Summary, translateF4Expenses } from '@/lib/translateHelper'

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const { summary_id, summary, expenses } = await req.json()
    if (!summary_id || !summary) return NextResponse.json({ error: 'summary_id and summary required' }, { status: 400 })

    // Get existing summary to preserve project_id and other context
    const { data: existingSummary, error: fetchErr } = await supabase
      .from('err_summary')
      .select('project_id, language')
      .eq('id', summary_id)
      .single()
    if (fetchErr) throw fetchErr

    const project_id = existingSummary?.project_id
    if (!project_id) return NextResponse.json({ error: 'Project not found' }, { status: 400 })

    // Detect language and translate if needed
    const sourceLanguage = summary.language || existingSummary?.language || 'en'
    console.log('F4 update detected source language:', sourceLanguage)
    
    const { translatedData: translatedSummary, originalText: summaryOriginalText } = await translateF4Summary(summary, sourceLanguage)
    console.log('F4 summary translation completed. Original text preserved:', Object.keys(summaryOriginalText).length > 0)

    // Update summary
    const { error: updateErr } = await supabase
      .from('err_summary')
      .update({
        report_date: translatedSummary.report_date || null,
        total_grant: translatedSummary.total_grant ?? null,
        total_expenses: translatedSummary.total_expenses ?? null,
        total_expenses_sdg: translatedSummary.total_expenses_sdg ?? null,
        remainder: translatedSummary.remainder ?? null,
        beneficiaries: translatedSummary.beneficiaries || null,
        lessons: translatedSummary.lessons || null,
        training: translatedSummary.training || null,
        project_objectives: translatedSummary.project_objectives || null,
        excess_expenses: translatedSummary.excess_expenses || null,
        surplus_use: translatedSummary.surplus_use || null,
        total_other_sources: translatedSummary.total_other_sources ?? null,
        original_text: summaryOriginalText,
        language: sourceLanguage
      })
      .eq('id', summary_id)
    if (updateErr) throw updateErr

    // Delete existing expenses for this summary
    await supabase
      .from('err_expense')
      .delete()
      .eq('summary_id', summary_id)

    // Insert updated expenses
    let expense_ids: number[] = []
    if (Array.isArray(expenses) && expenses.length) {
      // Translate expenses if needed
      const { translatedData: translatedExpenses, originalText: expensesOriginalText } = await translateF4Expenses(expenses, sourceLanguage)
      console.log('F4 expenses translation completed. Original text preserved for', expensesOriginalText.length, 'expenses')

      const payload = translatedExpenses.map((e: any, index: number) => ({
        project_id,
        summary_id,
        expense_activity: e.expense_activity || null,
        expense_description: e.expense_description || null,
        expense_amount: e.expense_amount ?? null,
        expense_amount_sdg: e.expense_amount_sdg ?? null,
        payment_date: e.payment_date || null,
        payment_method: e.payment_method || null,
        receipt_no: e.receipt_no || null,
        seller: e.seller || null,
        original_text: expensesOriginalText[index] || null,
        language: sourceLanguage
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
    console.error('F4 update error', e)
    return NextResponse.json({ error: 'Failed to update F4' }, { status: 500 })
  }
}

