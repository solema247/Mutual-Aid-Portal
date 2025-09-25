import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

export async function POST(request: Request) {
  try {
    const { project_id, file_key_temp } = await request.json()
    if (!project_id || !file_key_temp) return NextResponse.json({ error: 'project_id and file_key_temp required' }, { status: 400 })

    // Signed URL to read the temp file
    const { data: signed, error: signErr } = await (supabase as any).storage.from('images').createSignedUrl(file_key_temp, 60)
    if (signErr || !signed?.signedUrl) throw new Error('Failed to sign temp file')
    const fileResp = await fetch(signed.signedUrl)
    if (!fileResp.ok) throw new Error('Failed to fetch temp file')
    const blob = await fileResp.blob()

    // Prepare multipart for OCR pipeline with F5 form_type
    const fd = new FormData()
    const respContentType = fileResp.headers.get('content-type') || ''
    const lowerKey = String(file_key_temp || '').toLowerCase()
    let filename = 'f5-upload'
    let mime = respContentType
    if (!mime || mime === 'application/octet-stream') {
      if (lowerKey.endsWith('.pdf')) mime = 'application/pdf'
      else if (lowerKey.match(/\.(png|jpg|jpeg|webp|gif)$/)) {
        const ext = lowerKey.split('.').pop() as string
        mime = `image/${ext === 'jpg' ? 'jpeg' : ext}`
      }
    }
    if (mime.includes('pdf') || lowerKey.endsWith('.pdf')) filename += '.pdf'
    else if (mime.startsWith('image/')) filename += `.${mime.split('/')[1] || 'png'}`
    fd.append('file', new File([blob], filename, mime ? { type: mime } : undefined))
    fd.append('metadata', JSON.stringify({ ocr_max_pages: 3, form_type: 'F5' }))

    const baseUrl = new URL(request.url).origin
    const ocrResp = await fetch(`${baseUrl}/api/fsystem/process`, { method: 'POST', body: fd })
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
      is_draft: true
    }

    return NextResponse.json({ summaryDraft, reachDraft })
  } catch (e) {
    console.error('F5 parse error', e)
    return NextResponse.json({ error: 'Failed to parse' }, { status: 500 })
  }
}
