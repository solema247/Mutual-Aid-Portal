import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { translateF5Report, translateF5Reach } from '@/lib/translateHelper'

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const { report_id, summary, reach } = await req.json()
    if (!report_id || !summary) return NextResponse.json({ error: 'report_id and summary required' }, { status: 400 })

    // Get existing report to preserve project_id and other context
    const { data: existingReport, error: fetchErr } = await supabase
      .from('err_program_report')
      .select('project_id, language')
      .eq('id', report_id)
      .single()
    if (fetchErr) throw fetchErr

    const project_id = existingReport?.project_id
    if (!project_id) return NextResponse.json({ error: 'Project not found' }, { status: 400 })

    // Detect language and translate if needed
    const sourceLanguage = summary.language || existingReport?.language || 'en'
    console.log('F5 update detected source language:', sourceLanguage)
    
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

    // Update report summary
    const { error: updateErr } = await supabase
      .from('err_program_report')
      .update({
        report_date: cleanDate(translatedSummary.report_date),
        positive_changes: translatedSummary.positive_changes || null,
        negative_results: translatedSummary.negative_results || null,
        unexpected_results: translatedSummary.unexpected_results || null,
        lessons_learned: translatedSummary.lessons_learned || null,
        suggestions: translatedSummary.suggestions || null,
        reporting_person: translatedSummary.reporting_person || null,
        original_text: summaryOriginalText,
        language: sourceLanguage
      })
      .eq('id', report_id)
    if (updateErr) throw updateErr

    // Get existing reach activities to update/delete
    const { data: existingReach, error: fetchReachErr } = await supabase
      .from('err_program_reach')
      .select('id')
      .eq('report_id', report_id)
    if (fetchReachErr) throw fetchReachErr

    const existingIds = new Set((existingReach || []).map((r: any) => r.id))
    const incomingIds = new Set((reach || []).filter((r: any) => r.id).map((r: any) => r.id))

    // Update or insert reach activities
    let reach_ids: string[] = []
    if (Array.isArray(reach) && reach.length) {
      // Translate reach activities if needed
      const { translatedData: translatedReach, originalText: reachOriginalText } = await translateF5Reach(reach, sourceLanguage)
      console.log('F5 reach translation completed. Original text preserved for', reachOriginalText.length, 'activities')

      const toUpdate: any[] = []
      const toInsert: any[] = []
      const toDelete: string[] = []

      translatedReach.forEach((r: any, index: number) => {
        const payload = {
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
        }

        if (r.id && existingIds.has(r.id)) {
          // Update existing record
          toUpdate.push({ id: r.id, ...payload })
        } else {
          // Insert new record
          toInsert.push(payload)
        }
      })

      // Find IDs to delete (existing but not in incoming)
      existingIds.forEach((id: string) => {
        if (!incomingIds.has(id)) {
          toDelete.push(id)
        }
      })

      // Update existing records
      for (const record of toUpdate) {
        const { id, ...updateData } = record
        const { data: updated, error: updateReachErr } = await supabase
          .from('err_program_reach')
          .update(updateData)
          .eq('id', id)
          .select('id')
          .single()
        if (updateReachErr) throw updateReachErr
        if (updated) reach_ids.push(updated.id)
      }

      // Insert new records
      if (toInsert.length > 0) {
        const { data: insertedRows, error: insertErr } = await supabase
          .from('err_program_reach')
          .insert(toInsert)
          .select('id')
        if (insertErr) throw insertErr
        reach_ids.push(...(insertedRows || []).map((r: any) => r.id))
      }

      // Delete removed records
      if (toDelete.length > 0) {
        const { error: deleteErr } = await supabase
          .from('err_program_reach')
          .delete()
          .in('id', toDelete)
        if (deleteErr) throw deleteErr
      }
    } else {
      // If no reach data provided, delete all existing
      if (existingIds.size > 0) {
        const { error: deleteErr } = await supabase
          .from('err_program_reach')
          .delete()
          .eq('report_id', report_id)
        if (deleteErr) throw deleteErr
      }
    }

    return NextResponse.json({ report_id, reach_ids })
  } catch (e) {
    console.error('F5 update error', e)
    return NextResponse.json({ error: 'Failed to update F5' }, { status: 500 })
  }
}
