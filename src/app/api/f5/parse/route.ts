import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { project_id, file_key_temp } = await request.json()
    if (!project_id || !file_key_temp) return NextResponse.json({ error: 'project_id and file_key_temp required' }, { status: 400 })

    // Pass file_key to process API so it fetches from Supabase (avoids 4.5MB request body limit)
    const fd = new FormData()
    fd.append('file_key', file_key_temp.trim())
    fd.append('metadata', JSON.stringify({ ocr_max_pages: 3, form_type: 'F5' }))

    const baseUrl = new URL(request.url).origin
    const headers: Record<string, string> = {}
    const cookie = request.headers.get('cookie')
    if (cookie) headers['cookie'] = cookie
    const auth = request.headers.get('authorization')
    if (auth) headers['authorization'] = auth
    const ocrResp = await fetch(`${baseUrl}/api/fsystem/process`, { method: 'POST', headers, body: fd })
    if (!ocrResp.ok) {
      try { const j = await ocrResp.json(); return NextResponse.json({ error: j?.details || 'OCR failed' }, { status: 500 }) } catch {}
      throw new Error('OCR failed')
    }
    const ocrJson = await ocrResp.json()

    const raw = (ocrJson.raw_ocr || '') as string

    // Helper to extract narrative between prompts
    const extractBetween = (text: string, prompt: string, nextPrompt?: string) => {
      const startIdx = text.toLowerCase().indexOf(prompt.toLowerCase())
      if (startIdx === -1) return null
      const from = startIdx + prompt.length
      if (nextPrompt) {
        const endIdx = text.toLowerCase().indexOf(nextPrompt.toLowerCase(), from)
        return (endIdx === -1 ? text.slice(from) : text.slice(from, endIdx)).trim()
      }
      return text.slice(from).trim()
    }

    const reportDate = ocrJson.date || null

    // Reach table rows if model extracted, else empty
    const reachDraft = Array.isArray(ocrJson.reach) ? (ocrJson.reach as any[]).map((r: any) => ({
      activity_name: r.activity_name || r.activity || null,
      activity_goal: r.activity_goal || r.objective || null,
      location: r.location || r.place || null,
      start_date: r.start_date || null,
      end_date: r.end_date || null,
      individual_count: r.individuals ?? r.individual_count ?? null,
      household_count: r.families ?? r.household_count ?? null,
      male_count: r.male_count ?? null,
      female_count: r.female_count ?? null,
      under18_male: r.under18_male ?? r.boys_under_18 ?? null,
      under18_female: r.under18_female ?? r.girls_under_18 ?? null,
      is_draft: true
    })) : []

    const summaryDraft = {
      report_date: reportDate,
      positive_changes: ocrJson.positive_changes || extractBetween(raw, 'What changes and positive impacts', 'Were there any negative results') || null,
      negative_results: ocrJson.negative_results || extractBetween(raw, 'Were there any negative results', 'What did not happen') || null,
      unexpected_results: ocrJson.unexpected_results || extractBetween(raw, 'What did not happen', 'Based on what you learned') || null,
      lessons_learned: ocrJson.lessons_learned || extractBetween(raw, 'Based on what you learned', 'What advice or requests') || null,
      suggestions: ocrJson.suggestions || extractBetween(raw, 'What advice or requests') || null,
      reporting_person: ocrJson.reporting_person || null,
      demographics: ocrJson.demographics || null,
      raw_ocr: ocrJson.raw_ocr || null,
      language: ocrJson.language || null,
      is_draft: true
    }

    return NextResponse.json({ summaryDraft, reachDraft })
  } catch (e) {
    console.error('F5 parse error', e)
    return NextResponse.json({ error: 'Failed to parse' }, { status: 500 })
  }
}
