import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

export async function POST(req: Request) {
  try {
    const { project_id, summary, reach, file_key_temp, uploaded_by } = await req.json()
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

    // Insert program report summary
    const { data: inserted, error: insErr } = await supabase
      .from('err_program_report')
      .insert({
        project_id,
        report_date: summary.report_date || null,
        positive_changes: summary.positive_changes || null,
        negative_results: summary.negative_results || null,
        unexpected_results: summary.unexpected_results || null,
        lessons_learned: summary.lessons_learned || null,
        suggestions: summary.suggestions || null,
        reporting_person: summary.reporting_person || null,
        is_draft: summary.is_draft || false
      })
      .select('id')
      .single()
    if (insErr) throw insErr
    const report_id = inserted.id

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
        const finalPath = `f5-program-reports/${safe(state_name)}/${safe(err_code || err_id)}/${safe(grant_serial_id)}/${report_id}/report.${ext}`

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

        // Record attachment with final path (using err_summary_attachments table for now)
        await supabase
          .from('err_summary_attachments')
          .insert({ 
            summary_id: report_id, 
            file_key: finalPath, 
            file_type: 'f5_program_report', 
            uploaded_by: uploaded_by || null 
          })
      } catch (e) {
        console.warn('F5 file finalize failed, continuing without attachment', e)
      }
    }

    // Insert reach activities
    let reach_ids: string[] = []
    if (Array.isArray(reach) && reach.length) {
      const payload = reach.map((r: any) => ({
        report_id,
        activity_name: r.activity_name || null,
        activity_goal: r.activity_goal || null,
        location: r.location || null,
        start_date: r.start_date || null,
        end_date: r.end_date || null,
        individual_count: r.individual_count ?? null,
        household_count: r.household_count ?? null,
        male_count: r.male_count ?? null,
        female_count: r.female_count ?? null,
        under18_male: r.under18_male ?? null,
        under18_female: r.under18_female ?? null,
        is_draft: r.is_draft || false
      }))
      const { data: reachRows, error: reachErr } = await supabase
        .from('err_program_reach')
        .insert(payload)
        .select('id')
      if (reachErr) throw reachErr
      reach_ids = (reachRows || []).map((r: any) => r.id)
    }

    return NextResponse.json({ report_id, reach_ids })
  } catch (e) {
    console.error('F5 save error', e)
    return NextResponse.json({ error: 'Failed to save F5' }, { status: 500 })
  }
}
