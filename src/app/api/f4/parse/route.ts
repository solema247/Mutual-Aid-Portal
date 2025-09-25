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
    // Hint OCR for F4 and only process first 3 pages (form pages)
    fd.append('metadata', JSON.stringify({ ocr_max_pages: 3, form_type: 'F4' }))

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

    // Capture narrative answers between numbered prompts (allow multi-line) without complex regex
    const extractBetween = (text: string, startNum: number, nextNum?: number): string | null => {
      const startRe = new RegExp(`(^|\n)\s*${startNum}\\)`) // e.g., "\n4)"
      const startMatch = text.match(startRe)
      if (!startMatch) return null
      const startIdx = (startMatch.index || 0) + startMatch[0].length
      const remainder = text.slice(startIdx)
      if (nextNum) {
        const nextRe = new RegExp(`(^|\n)\s*${nextNum}\\)`) // e.g., next question marker
        const nextMatch = remainder.match(nextRe)
        const endIdx = nextMatch ? (startIdx + (nextMatch.index || 0)) : text.length
        return text.slice(startIdx, endIdx).trim()
      }
      return remainder.trim()
    }
    const q1 = extractBetween(raw, 4, 5) || grab(/4\.[\s\S]*?\n([^\n]+?)(?=\n\s*5\.)/)
    const q2 = extractBetween(raw, 5, 6) || grab(/5\.[\s\S]*?\n([^\n]+?)(?=\n\s*6\.)/)
    const q3 = extractBetween(raw, 6, 7) || grab(/6\.[\s\S]*?\n([^\n]+?)(?=\n\s*7\.)/)
    const q4 = extractBetween(raw, 7) || grab(/7\.[\s\S]*?\n([^\n]+?)(?:\n|$)/)

    console.log('Q4-Q7 extracted:', { q1, q2, q3, q4 })

    const computedTotal = Array.isArray(ocrJson.expenses) ? ocrJson.expenses.reduce((s: number, e: any) => s + (e.total_cost_usd || 0), 0) : 0

    const summaryDraft = {
      report_date: ocrJson.date || null,
      total_expenses: num(totalExpensesStr),
      total_grant: num(totalGrantStr),
      excess_expenses: (typeof ocrJson.excess_expenses === 'string' && ocrJson.excess_expenses.trim()) ? ocrJson.excess_expenses.trim() : (q1 || null),
      surplus_use: (typeof ocrJson.surplus_use === 'string' && ocrJson.surplus_use.trim()) ? ocrJson.surplus_use.trim() : (q2 || null),
      lessons: (typeof ocrJson.lessons === 'string' && ocrJson.lessons.trim()) ? ocrJson.lessons.trim() : (q3 || null),
      training: (typeof ocrJson.training === 'string' && ocrJson.training.trim()) ? ocrJson.training.trim() : (q4 || null),
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
      // Keep raw amounts only; do not convert
      expense_amount_sdg: e.currency === 'SDG' ? (e.amount_value ?? e.total_cost_sdg ?? null) : null,
      expense_amount: e.currency === 'USD' ? (e.amount_value ?? e.total_cost_usd ?? null) : (e.total_cost_usd ?? null),
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

