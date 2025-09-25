import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

export async function POST(req: Request) {
  try {
    const { project_id, summary, expenses, file_key_temp, uploaded_by } = await req.json()
    if (!project_id || !summary) return NextResponse.json({ error: 'project_id and summary required' }, { status: 400 })

    // Fetch project context (ERR, state, human project code)
    let err_id: string | null = null
    let state_name: string | null = null
    let grant_serial_id: string | null = null
    let err_code: string | null = null
    try {
      const { data: prj } = await supabase
        .from('err_projects')
        .select('err_id, state, grant_serial_id, emergency_rooms ( err_code )')
        .eq('id', project_id)
        .single()
      err_id = (prj as any)?.err_id || null
      state_name = (prj as any)?.state || null
      grant_serial_id = (prj as any)?.grant_serial_id || null
      err_code = (prj as any)?.emergency_rooms?.err_code || null
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

    // If a summary file exists, move it from tmp to a clear final path and record attachment
    if (file_key_temp) {
      try {
        const tempKey: string = String(file_key_temp)
        const ext = (tempKey.split('.').pop() || 'pdf').toLowerCase()
        const safe = (s: string | null | undefined) => (s || 'UNKNOWN')
          .toString()
          .trim()
          .replace(/[^\p{L}\p{N}\-_. ]+/gu, '-')
          .replace(/\s+/g, '-')
        const finalPath = `f4-financial-reports/${safe(state_name)}/${safe(err_code || err_id)}/${safe(grant_serial_id)}/${summary_id}/summary.${ext}`

        // Read temp via signed URL
        const { data: sign, error: signErr } = await (supabase as any).storage
          .from('images')
          .createSignedUrl(tempKey, 60)
        if (signErr || !sign?.signedUrl) throw new Error('Failed to sign temp file')
        const resp = await fetch(sign.signedUrl)
        if (!resp.ok) throw new Error('Failed to read temp file')
        const blob = await resp.blob()

        // Upload to final path
        const { error: upErr } = await supabase.storage
          .from('images')
          .upload(finalPath, blob, { upsert: true })
        if (upErr) throw upErr

        // Best-effort delete temp
        try { await supabase.storage.from('images').remove([tempKey]) } catch {}

        // Record attachment with final path
        await supabase
          .from('err_summary_attachments')
          .insert({ summary_id, file_key: finalPath, file_type: 'summary_pdf', uploaded_by: uploaded_by || null })
      } catch (e) {
        console.warn('F4 file finalize failed, continuing without attachment', e)
      }
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


