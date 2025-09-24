import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

export async function POST(request: Request) {
  try {
    const { project_id, summary, expenses, file_key_temp } = await request.json()
    if (!project_id || !summary) return NextResponse.json({ error: 'project_id and summary required' }, { status: 400 })

    // insert summary
    const payload = {
      project_id,
      report_date: summary.report_date || null,
      total_expenses: summary.total_expenses ?? null,
      total_grant: summary.total_grant ?? null,
      excess_expenses: summary.excess_expenses ?? null,
      surplus_use: summary.surplus_use ?? null,
      lessons: summary.lessons ?? null,
      training: summary.training ?? null,
      total_other_sources: summary.total_other_sources ?? null,
      language: summary.language ?? null,
      remainder: summary.remainder ?? null,
      beneficiaries: summary.beneficiaries ?? null,
      project_name: summary.project_name ?? null,
      project_objectives: summary.project_objectives ?? null,
      is_draft: !!summary.is_draft
    }
    const { data: inserted, error: insErr } = await supabase
      .from('err_summary')
      .insert(payload)
      .select('id')
      .single()
    if (insErr) throw insErr
    const summary_id = inserted.id

    // bulk insert expenses
    if (Array.isArray(expenses) && expenses.length > 0) {
      const rows = expenses.map((e: any) => ({
        project_id,
        expense_activity: e.expense_activity ?? null,
        expense_description: e.expense_description ?? null,
        expense_amount: e.expense_amount ?? null,
        payment_date: e.payment_date ?? null,
        payment_method: e.payment_method ?? null,
        receipt_no: e.receipt_no ?? null,
        seller: e.seller ?? null,
        language: e.language ?? null,
        is_draft: !!e.is_draft
      }))
      const { error: expErr } = await supabase.from('err_expense').insert(rows)
      if (expErr) throw expErr
    }

    // move file from tmp to final and create attachment
    if (file_key_temp) {
      const finalPath = `f4-financial-reports/${project_id}/${summary_id}/${file_key_temp.split('/').pop()}`
      const { data: moveUrl, error: signErr } = await (supabase as any).storage.from('images').createSignedUrl(file_key_temp, 60)
      if (signErr || !moveUrl?.signedUrl) throw new Error('Failed to sign temp file')
      const resp = await fetch(moveUrl.signedUrl)
      if (!resp.ok) throw new Error('Failed to read temp file')
      const blob = await resp.blob()
      const { error: upErr } = await supabase.storage.from('images').upload(finalPath, blob, { upsert: true })
      if (upErr) throw upErr
      // delete temp best-effort
      try { await supabase.storage.from('images').remove([file_key_temp]) } catch {}

      // attachment table (create table assumed): err_summary_attachments(summary_id bigint, file_key text, created_at timestamptz default now())
      try {
        await supabase.from('err_summary_attachments').insert({ summary_id, file_key: finalPath })
      } catch (e) {
        console.warn('Failed to insert attachment row', e)
      }
    }

    return NextResponse.json({ success: true, summary_id })
  } catch (e) {
    console.error('F4 save error', e)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

export async function POST(req: Request) {
  try {
    const { project_id, summary, expenses, file_key_temp, uploaded_by } = await req.json()
    if (!project_id || !summary) return NextResponse.json({ error: 'project_id and summary required' }, { status: 400 })

    // Insert summary
    const { data: inserted, error: insErr } = await supabase
      .from('err_summary')
      .insert({
        project_id,
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


