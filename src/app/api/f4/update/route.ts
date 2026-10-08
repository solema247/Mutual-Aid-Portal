import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { translateF4Summary, translateF4Expenses } from '@/lib/translateHelper'
import { normalizePaymentDateForDb } from '@/lib/f4SaveNormalize'
import { fetchF4SectorsForMatch, normalizeF4ExpenseActivitiesToSectors } from '@/lib/f4ExpenseSectors'
import { assertProjectInGrantAccess } from '@/lib/userGrantAccess'
import { emitF123Audit, pickChangedAuditFields } from '@/lib/f123Audit'
import {
  buildF4UpdateComparePayload,
  buildF4UpdateComparePayloadFromDb,
  updatePayloadsEqual,
} from '@/lib/f4f5UpdateCompare'
import {
  coordinatorWriteForbiddenResponse,
  getUserOrgScope,
  isDisclosedCoordinator,
} from '@/lib/canvas/orgScope'

const F4_SUMMARY_AUDIT_KEYS = [
  'report_date',
  'total_grant',
  'total_expenses',
  'total_expenses_sdg',
  'remainder',
  'beneficiaries',
  'lessons',
  'training',
  'project_objectives',
  'receipt_check',
  'excess_expenses',
  'surplus_use',
  'total_other_sources',
  'language',
] as const

export async function POST(req: Request) {
  try {
    if (isDisclosedCoordinator(await getUserOrgScope())) return coordinatorWriteForbiddenResponse()

    const supabase = getSupabaseRouteClient()
    const { summary_id, summary, expenses } = await req.json()
    if (!summary_id || !summary) return NextResponse.json({ error: 'summary_id and summary required' }, { status: 400 })

    // Get existing summary to preserve project_id and other context
    const { data: existingSummary, error: fetchErr } = await supabase
      .from('err_summary')
      .select(
        'project_id, language, report_date, total_grant, total_expenses, total_expenses_sdg, remainder, beneficiaries, lessons, training, project_objectives, receipt_check, excess_expenses, surplus_use, total_other_sources'
      )
      .eq('id', summary_id)
      .single()
    if (fetchErr) throw fetchErr

    const project_id = existingSummary?.project_id
    if (!project_id) return NextResponse.json({ error: 'Project not found' }, { status: 400 })

    const scope = await assertProjectInGrantAccess(String(project_id))
    if (!scope.ok) return scope.response

    const { data: priorExpenses, error: priorExpErr } = await supabase
      .from('err_expense')
      .select(
        'expense_activity, expense_description, expense_amount, expense_amount_sdg, payment_date, payment_method, receipt_no, seller'
      )
      .eq('summary_id', summary_id)
    if (priorExpErr) throw priorExpErr

    const incomingExpenses = Array.isArray(expenses) ? expenses : []
    const sectorsForCompare = await fetchF4SectorsForMatch(supabase)
    const incomingExpensesCanon = normalizeF4ExpenseActivitiesToSectors(incomingExpenses, sectorsForCompare)
    const incomingCompare = buildF4UpdateComparePayload({
      summaryDraft: summary as Record<string, unknown>,
      expensesDraft: incomingExpensesCanon as Record<string, unknown>[],
      totalGrantUSD: Number((summary as Record<string, unknown>).total_grant) || 0,
    })
    const dbCompare = buildF4UpdateComparePayloadFromDb({
      summaryRow: existingSummary as Record<string, unknown>,
      expenseRows: (priorExpenses || []) as Record<string, unknown>[],
    })
    if (updatePayloadsEqual(incomingCompare, dbCompare)) {
      return NextResponse.json({ summary_id, unchanged: true })
    }

    const { count: priorExpenseCount } = await supabase
      .from('err_expense')
      .select('expense_id', { count: 'exact', head: true })
      .eq('summary_id', summary_id)

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
        receipt_check: translatedSummary.receipt_check ?? null,
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
      const sectors = await fetchF4SectorsForMatch(supabase)
      const expenseActivityOriginal = expenses.map((e: any) => e?.expense_activity)
      const expensesCanon = normalizeF4ExpenseActivitiesToSectors(expenses, sectors)
      const { translatedData: translatedExpenses, originalText: expensesOriginalText } = await translateF4Expenses(
        expensesCanon,
        sourceLanguage,
        { expenseActivityOriginal }
      )
      console.log('F4 expenses translation completed. Original text preserved for', expensesOriginalText.length, 'expenses')

      const reportDateStr =
        translatedSummary.report_date != null ? String(translatedSummary.report_date).slice(0, 10) : null
      const payload = translatedExpenses.map((e: any, index: number) => ({
        project_id,
        summary_id,
        expense_activity: e.expense_activity || null,
        expense_description: e.expense_description || null,
        expense_amount: e.expense_amount ?? null,
        expense_amount_sdg: e.expense_amount_sdg ?? null,
        payment_date: normalizePaymentDateForDb(e.payment_date, reportDateStr),
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

    const afterSummary = {
      report_date: translatedSummary.report_date || null,
      total_grant: translatedSummary.total_grant ?? null,
      total_expenses: translatedSummary.total_expenses ?? null,
      total_expenses_sdg: translatedSummary.total_expenses_sdg ?? null,
      remainder: translatedSummary.remainder ?? null,
      beneficiaries: translatedSummary.beneficiaries || null,
      lessons: translatedSummary.lessons || null,
      training: translatedSummary.training || null,
      project_objectives: translatedSummary.project_objectives || null,
      receipt_check: translatedSummary.receipt_check ?? null,
      excess_expenses: translatedSummary.excess_expenses || null,
      surplus_use: translatedSummary.surplus_use || null,
      total_other_sources: translatedSummary.total_other_sources ?? null,
      language: sourceLanguage,
    }
    const beforeSummary = existingSummary as Record<string, unknown>
    const fieldChanges = pickChangedAuditFields(
      beforeSummary,
      afterSummary as Record<string, unknown>,
      F4_SUMMARY_AUDIT_KEYS
    )
    const beforeExpenseCount = priorExpenseCount ?? 0
    const afterExpenseCount = expense_ids.length
    const oldValues: Record<string, unknown> = {
      ...(fieldChanges?.oldValues ?? {}),
    }
    const newValues: Record<string, unknown> = {
      ...(fieldChanges?.newValues ?? {}),
    }
    if (beforeExpenseCount !== afterExpenseCount) {
      oldValues.expense_line_count = beforeExpenseCount
      newValues.expense_line_count = afterExpenseCount
    } else if (!fieldChanges) {
      // Expenses replaced even when count unchanged — still one update event
      oldValues.expense_line_count = beforeExpenseCount
      newValues.expense_line_count = afterExpenseCount
      oldValues.expenses_replaced = true
      newValues.expenses_replaced = true
    }

    await emitF123Audit({
      action: 'f4.report_updated',
      endpoint: 'POST /api/f4/update',
      request: req,
      targetType: 'f4_summary',
      targetId: String(project_id),
      oldValues,
      newValues,
      metadata: {
        project_id,
        summary_id,
        expense_count: afterExpenseCount,
        updated_fields: Object.keys(newValues),
      },
    })

    return NextResponse.json({ summary_id, expense_ids })
  } catch (e) {
    console.error('F4 update error', e)
    return NextResponse.json({ error: 'Failed to update F4' }, { status: 500 })
  }
}

