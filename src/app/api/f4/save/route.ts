import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { requirePermission } from '@/lib/requirePermission'
import { translateF4Summary, translateF4Expenses } from '@/lib/translateHelper'

export async function POST(req: Request) {
  try {
    const auth = await requirePermission('f4_save')
    if (auth instanceof NextResponse) return auth
    const supabase = getSupabaseRouteClient()
    const { project_id, summary, expenses, file_key_temp, uploaded_by } = await req.json()
    if (!project_id || !summary) return NextResponse.json({ error: 'project_id and summary required' }, { status: 400 })

    // Check if this is a historical project from activities_raw_import
    const isHistorical = String(project_id).startsWith('historical_')
    let activities_raw_import_id: string | null = null
    let actual_project_id: string | null = null

    // Fetch project context (ERR, state, human project code)
    let err_id: string | null = null
    let state_name: string | null = null
    let grant_serial_id: string | null = null
    let err_code: string | null = null
    
    if (isHistorical) {
      // Extract real UUID from historical project ID
      const realUuid = String(project_id).replace('historical_', '')
      
      // Verify the record exists in activities_raw_import before proceeding
      let historicalPrj: any = null
      try {
        const { data, error } = await supabase
          .from('activities_raw_import')
          .select('id, "ERR CODE", "ERR Name", "State", "Serial Number"')
          .eq('id', realUuid)
          .single()
        
        if (error) {
          console.error('F4 save error - activities_raw_import lookup failed:', error)
          console.error('F4 save error - realUuid:', realUuid)
          console.error('F4 save error - project_id received:', project_id)
          
          // Try to find the record by checking if it exists at all
          const { data: checkData, error: checkError } = await supabase
            .from('activities_raw_import')
            .select('id')
            .limit(1)
          
          if (checkError) {
            console.error('F4 save error - cannot query activities_raw_import table:', checkError)
          } else {
            console.error('F4 save error - activities_raw_import table is accessible, but UUID not found')
          }
          
          return NextResponse.json({ 
            error: `Historical project not found: ${realUuid}. The project may have been deleted from the Google Sheet. Please refresh the page and try again.` 
          }, { status: 404 })
        }
        
        if (!data) {
          console.error('F4 save error - no data returned for UUID:', realUuid)
          console.error('F4 save error - project_id received:', project_id)
          return NextResponse.json({ 
            error: `Historical project not found in database: ${realUuid}. The project may have been deleted. Please refresh the page and try again.` 
          }, { status: 404 })
        }
        
        historicalPrj = data
      } catch (e: any) {
        console.error('F4 save error - exception during lookup:', e)
        return NextResponse.json({ 
          error: `Failed to verify historical project: ${e.message || 'Unknown error'}` 
        }, { status: 500 })
      }
      
      // Only set activities_raw_import_id if we confirmed the record exists
      activities_raw_import_id = realUuid
      actual_project_id = null // Historical projects don't have project_id
      
      if (historicalPrj) {
        err_code = historicalPrj['ERR CODE'] || historicalPrj['ERR Name'] || null
        err_id = err_code
        state_name = historicalPrj['State'] || null
        grant_serial_id = historicalPrj['Serial Number'] || null
      }
    } else {
      // Regular portal project
      actual_project_id = project_id
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
    }

    // Detect language and translate if needed
    const sourceLanguage = summary.language || 'en'
    console.log('F4 detected source language:', sourceLanguage)
    
    const { translatedData: translatedSummary, originalText: summaryOriginalText } = await translateF4Summary(summary, sourceLanguage)
    console.log('F4 summary translation completed. Original text preserved:', Object.keys(summaryOriginalText).length > 0)

    // Insert summary
    const { data: inserted, error: insErr } = await supabase
      .from('err_summary')
      .insert({
        project_id: actual_project_id,
        activities_raw_import_id: activities_raw_import_id,
        err_id,
        report_date: translatedSummary.report_date || null,
        total_grant: translatedSummary.total_grant ?? null,
        total_expenses: translatedSummary.total_expenses ?? null,
        total_expenses_sdg: translatedSummary.total_expenses_sdg ?? null,
        remainder: translatedSummary.remainder ?? null,
        beneficiaries: translatedSummary.beneficiaries || null,
        lessons: translatedSummary.lessons || null,
        training: translatedSummary.training || null,
        project_objectives: translatedSummary.project_objectives || null,
        original_text: summaryOriginalText,
        language: sourceLanguage
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
      // Translate expenses if needed
      const { translatedData: translatedExpenses, originalText: expensesOriginalText } = await translateF4Expenses(expenses, sourceLanguage)
      console.log('F4 expenses translation completed. Original text preserved for', expensesOriginalText.length, 'expenses')

      const payload = translatedExpenses.map((e: any, index: number) => ({
        project_id: actual_project_id,
        activities_raw_import_id: activities_raw_import_id,
        summary_id,
        expense_activity: e.expense_activity || null,
        expense_description: e.expense_description || null,
        expense_amount: e.expense_amount ?? null,
        expense_amount_sdg: e.expense_amount_sdg ?? null,
        payment_date: e.payment_date || null,
        payment_method: e.payment_method || null,
        receipt_no: e.receipt_no || null,
        seller: e.seller || null,
        uploaded_by: uploaded_by || null,
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
    console.error('F4 save error', e)
    return NextResponse.json({ error: 'Failed to save F4' }, { status: 500 })
  }
}


