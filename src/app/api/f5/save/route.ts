import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { translateF5Report, translateF5Reach } from '@/lib/translateHelper'

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseRouteClient()
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

    // Detect language and translate if needed
    const sourceLanguage = summary.language || 'en'
    console.log('F5 detected source language:', sourceLanguage)
    
    const { translatedData: translatedSummary, originalText: summaryOriginalText } = await translateF5Report(summary, sourceLanguage)
    console.log('F5 summary translation completed. Original text preserved:', Object.keys(summaryOriginalText).length > 0)

    // Helper function to clean and validate dates
    const cleanDate = (dateStr: string | null): string | null => {
      if (!dateStr || typeof dateStr !== 'string') return null
      
      // Handle malformed dates like "18/7/202" -> "18/7/2024"
      const cleaned = dateStr.trim()
      
      // If it looks like a partial year (3 digits), assume current decade
      if (/^\d{1,2}\/\d{1,2}\/\d{3}$/.test(cleaned)) {
        const parts = cleaned.split('/')
        const year = parts[2]
        if (year.length === 3) {
          // Assume 20xx for 3-digit years
          parts[2] = '20' + year
          return parts.join('/')
        }
      }
      
      // Try to parse as date and return ISO format if valid
      try {
        const date = new Date(cleaned)
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0] // Return YYYY-MM-DD format
        }
      } catch {}
      
      return null
    }

    // Insert program report summary
    const { data: inserted, error: insErr } = await supabase
      .from('err_program_report')
      .insert({
        project_id,
        report_date: cleanDate(translatedSummary.report_date),
        positive_changes: translatedSummary.positive_changes || null,
        negative_results: translatedSummary.negative_results || null,
        unexpected_results: translatedSummary.unexpected_results || null,
        lessons_learned: translatedSummary.lessons_learned || null,
        suggestions: translatedSummary.suggestions || null,
        reporting_person: translatedSummary.reporting_person || null,
        is_draft: translatedSummary.is_draft || false,
        original_text: summaryOriginalText,
        language: sourceLanguage
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

        // Record attachment with final path in err_program_files table
        const fileName = finalPath.split('/').pop() || `report.${ext}`
        await supabase
          .from('err_program_files')
          .insert({ 
            report_id: report_id, 
            file_name: fileName,
            file_url: finalPath, 
            file_type: 'program_report', 
            file_size: blob.size,
            uploaded_by: uploaded_by || null 
          })
      } catch (e) {
        console.warn('F5 file finalize failed, continuing without attachment', e)
      }
    }

    // Insert reach activities
    let reach_ids: string[] = []
    if (Array.isArray(reach) && reach.length) {
      // Translate reach activities if needed
      const { translatedData: translatedReach, originalText: reachOriginalText } = await translateF5Reach(reach, sourceLanguage)
      console.log('F5 reach translation completed. Original text preserved for', reachOriginalText.length, 'activities')

      const payload = translatedReach.map((r: any, index: number) => ({
        report_id,
        activity_name: r.activity_name || null,
        activity_goal: r.activity_goal || null,
        location: r.location || null,
        start_date: cleanDate(r.start_date),
        end_date: cleanDate(r.end_date),
        individual_count: r.individual_count ?? null,
        household_count: r.household_count ?? null,
        male_count: r.male_count ?? null,
        female_count: r.female_count ?? null,
        under18_male: r.under18_male ?? null,
        under18_female: r.under18_female ?? null,
        people_with_disabilities: r.people_with_disabilities ?? null,
        adjusted_counts: r.adjusted_counts ?? null,
        adjusted_note: r.adjusted_note ?? null,
        is_draft: r.is_draft || false,
        original_text: reachOriginalText[index] || null,
        language: sourceLanguage
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
