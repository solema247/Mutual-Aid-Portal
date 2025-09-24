import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

export async function POST(request: Request) {
  try {
    const { project_id, file_key_temp } = await request.json()
    if (!project_id || !file_key_temp) return NextResponse.json({ error: 'project_id and file_key_temp required' }, { status: 400 })

    // Get a signed URL to download the file content (public bucket not guaranteed)
    const { data: signed, error: signedErr } = await (supabase as any).storage.from('images').createSignedUrl(file_key_temp, 60)
    if (signedErr || !signed?.signedUrl) throw new Error('Failed to sign temp file')

    // Fetch the file as blob
    const fileResp = await fetch(signed.signedUrl)
    if (!fileResp.ok) throw new Error('Failed to fetch temp file')
    const blob = await fileResp.blob()

    // Build multipart form for existing OCR endpoint
    const fd = new FormData()
    // Try to preserve content type and filename so OCR treats PDFs correctly
    const respContentType = fileResp.headers.get('content-type') || ''
    const lowerKey = String(file_key_temp || '').toLowerCase()
    let filename = 'f4-upload'
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
    // Hint OCR to only process first 3 pages (form pages), skipping receipt images later
    fd.append('metadata', JSON.stringify({ ocr_max_pages: 3 }))

    // Reuse OCR pipeline - use absolute URL for server-side fetch
    const baseUrl = new URL(request.url).origin
    const ocrResp = await fetch(`${baseUrl}/api/fsystem/process`, {
      method: 'POST',
      body: fd
    })
    if (!ocrResp.ok) {
      try { const j = await ocrResp.json(); return NextResponse.json({ error: j?.details || 'OCR failed' }, { status: 500 }) } catch {}
      throw new Error('OCR failed')
    }
    const ocrJson = await ocrResp.json()

    // Map to F4 drafts
    const raw = (ocrJson.raw_ocr || '') as string
    const num = (s: string | null) => {
      if (!s) return null
      const cleaned = s.replace(/[,\s]/g, '')
      const n = parseFloat(cleaned)
      return isNaN(n) ? null : n
    }
    const grab = (re: RegExp): string | null => {
      const m = raw.match(re)
      return m?.[1]?.trim() || null
    }
    const totalExpensesStr = grab(/A\.[^\d]*(\d[\d,]*)/i)
    const totalGrantStr = grab(/B\.[^\d]*(\d[\d,]*)/i)
    const otherSourcesStr = grab(/C\.[^\d]*(\d[\d,]*)/i)
    const remainderStr = grab(/D\.[^\d]*(\d[\d,]*)/i)

    // Capture narrative answers between numbered prompts
    const q1 = grab(/1\.[\s\S]*?\n([^\n]+?)(?=\n\s*2\.)/)
    const q2 = grab(/2\.[\s\S]*?\n([^\n]+?)(?=\n\s*3\.)/)
    const q3 = grab(/3\.[\s\S]*?\n([^\n]+?)(?=\n\s*4\.)/)
    const q4 = grab(/4\.[\s\S]*?\n([^\n]+?)(?:\n|$)/)

    const computedTotal = Array.isArray(ocrJson.expenses) ? ocrJson.expenses.reduce((s: number, e: any) => s + (e.total_cost_usd || 0), 0) : 0

    const summaryDraft = {
      report_date: ocrJson.date || null,
      total_expenses: num(totalExpensesStr) ?? computedTotal,
      total_grant: num(totalGrantStr),
      excess_expenses: q1,
      surplus_use: q2,
      lessons: q3,
      training: q4,
      total_other_sources: num(otherSourcesStr),
      language: ocrJson.language || null,
      remainder: num(remainderStr),
      beneficiaries: null,
      project_name: null,
      project_objectives: null,
      is_draft: true
    }

    const expensesDraft = (ocrJson.expenses || []).map((e: any) => ({
      expense_activity: e.activity || null,
      expense_description: null,
      // keep raw SDG from form so user can convert later in UI
      expense_amount_sdg: e.total_cost_sdg ?? null,
      expense_amount: e.total_cost_usd ?? null,
      payment_date: null,
      payment_method: null,
      receipt_no: null,
      seller: null,
      language: ocrJson.language || null,
      is_draft: true
    }))

    return NextResponse.json({ summaryDraft, expensesDraft })
  } catch (e) {
    console.error('F4 parse error', e)
    return NextResponse.json({ error: 'Failed to parse' }, { status: 500 })
  }
}

