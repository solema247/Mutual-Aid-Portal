import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { processFForm } from '@/lib/ocrProcess'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const routeStart = Date.now()
    const { project_id, file_key_temp } = await request.json()
    if (!project_id || !file_key_temp) return NextResponse.json({ error: 'project_id and file_key_temp required' }, { status: 400 })

    // Get a signed URL to download the file content (public bucket not guaranteed)
    const { data: signed, error: signedErr } = await (supabase as any).storage.from('images').createSignedUrl(file_key_temp, 60)
    if (signedErr || !signed?.signedUrl) throw new Error('Failed to sign temp file')

    // Fetch the file as blob
    const fileResp = await fetch(signed.signedUrl)
    if (!fileResp.ok) throw new Error('Failed to fetch temp file')
    const blob = await fileResp.blob()

    // Create a File object preserving type and filename for OCR
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

    const file = new File([blob], filename, mime ? { type: mime } : undefined)

    // Directly call shared OCR/AI processor (no internal HTTP hop)
    const ocrJson = await processFForm(file, { ocr_max_pages: 3, form_type: 'F4' })

    // Map to F4 drafts
    const raw = (ocrJson.raw_ocr || '') as string
    // Helpers
    const toAsciiDigits = (s: any) => {
      if (s == null) return s
      const map: Record<string,string> = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9' }
      return String(s).replace(/[٠-٩]/g, d => (map as any)[d] ?? d)
    }
    const toNumLoose = (s: any): number | null => {
      if (s == null) return null
      const cleaned = toAsciiDigits(String(s)).replace(/[،,\s]/g,'')
      const n = parseFloat(cleaned)
      return Number.isFinite(n) ? n : null
    }
    const num = (s: string | null) => toNumLoose(s)
    const grab = (re: RegExp): string | null => {
      const m = raw.match(re)
      return m?.[1]?.trim() || null
    }
    // Prefer model outputs; fallback to raw OCR regex if missing
    const totalExpensesStr = (ocrJson.total_expenses_text ?? null) || grab(/A\.[^\d]*(\d[\d,]*)/i)
    const totalGrantStr = (ocrJson.total_grant_text ?? null) || grab(/B\.[^\d]*(\d[\d,]*)/i)
    const otherSourcesStr = (ocrJson.total_other_sources_text ?? null) || grab(/C\.[^\d]*(\d[\d,]*)/i)
    const remainderStr = (ocrJson.remainder_text ?? null) || grab(/D\.[^\d]*(\d[\d,]*)/i)

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
    const stripQuestion = (ans: string | null) => {
      if (!ans) return ans
      // Remove common Arabic question headers if present
      return ans
        .replace(/^[^\n]{8,80}?[:؟]\s*/,'')
        .trim()
    }
    const q1 = stripQuestion((typeof ocrJson.excess_expenses === 'string' && ocrJson.excess_expenses.trim()) ? ocrJson.excess_expenses.trim() : (extractBetween(raw, 4, 5) || grab(/4\.[\s\S]*?\n([^\n]+?)(?=\n\s*5\.)/)))
    const q2 = stripQuestion((typeof ocrJson.surplus_use === 'string' && ocrJson.surplus_use.trim()) ? ocrJson.surplus_use.trim() : (extractBetween(raw, 5, 6) || grab(/5\.[\s\S]*?\n([^\n]+?)(?=\n\s*6\.)/)))
    const q3 = stripQuestion((typeof ocrJson.lessons === 'string' && ocrJson.lessons.trim()) ? ocrJson.lessons.trim() : (extractBetween(raw, 6, 7) || grab(/6\.[\s\S]*?\n([^\n]+?)(?=\n\s*7\.)/)))
    const q4 = stripQuestion((typeof ocrJson.training === 'string' && ocrJson.training.trim()) ? ocrJson.training.trim() : (extractBetween(raw, 7) || grab(/7\.[\s\S]*?\n([^\n]+?)(?:\n|$)/)))

    const summaryDraft = {
      report_date: ocrJson.date || null,
      total_expenses: num(totalExpensesStr),
      total_grant: num(totalGrantStr),
      excess_expenses: q1 || null,
      surplus_use: q2 || null,
      lessons: q3 || null,
      training: q4 || null,
      total_other_sources: num(otherSourcesStr),
      language: ocrJson.language || null,
      remainder: num(remainderStr),
      raw_ocr: ocrJson.raw_ocr || null,
      beneficiaries: null,
      project_name: null,
      project_objectives: null,
      is_draft: true
    }

    // Compute remainder if missing and we have A/B/C
    if (summaryDraft.remainder == null) {
      const A = summaryDraft.total_expenses
      const B = summaryDraft.total_grant
      const C = summaryDraft.total_other_sources
      if (A != null && (B != null || B === 0) && (C != null || C === 0)) {
        summaryDraft.remainder = (A as number) - (B as number) + (C as number)
      }
    }

    let expensesDraft = (ocrJson.expenses || []).map((e: any) => ({
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

    // Normalize multi-line activities: merge very short follow-up lines into previous label
    try {
      const merged: any[] = []
      for (const row of expensesDraft) {
        const label = (row.expense_activity || '').trim()
        if (!label) { merged.push(row); continue }
        const last = merged[merged.length - 1]
        if (last && last.expense_activity && /^(?:[\p{L}\p{N}\-+]{1,5})$/u.test(label)) {
          last.expense_activity = `${last.expense_activity} ${label}`.trim()
        } else {
          merged.push(row)
        }
      }
      expensesDraft = merged
    } catch {}

    // Fallback 1: for rows with activity but missing amount, try to locate a nearby number in raw OCR
    try {
      const lines = raw.split(/\n+/)
      expensesDraft = expensesDraft.map((row: any) => {
        if (!row.expense_activity) return row
        const hasAmount = (row.expense_amount != null) || (row.expense_amount_sdg != null)
        if (hasAmount) return row
        const needle = String(row.expense_activity).split(' ')[0]
        const idx = lines.findIndex(l => l.includes(needle))
        if (idx !== -1) {
          const windowLines = lines.slice(idx, Math.min(idx + 3, lines.length)).join(' ')
          const m = toAsciiDigits(windowLines).match(/\b\d{1,3}(?:[,،\s]\d{3})*(?:\.\d+)?\b/)
          if (m) {
            const v = toNumLoose(m[0])
            if (v != null && Number.isFinite(v) && v >= 1000) {
              // Assume SDG if currency unknown
              row.expense_amount_sdg = row.expense_amount_sdg ?? v
            }
          }
        }
        return row
      })
    } catch {}

    // Fallback 2: extract a contiguous block of amounts (RTL tables often list amounts separately) and pair by order
    try {
      const bankNoise = /(بنكك|رقم العملية|التاريخ\s*و\s*الزمن|SDG|طباعة|تحميل|إضافة)/
      const lines = raw.split(/\n+/).map(l => l.trim()).filter(Boolean)
      const numericCandidates: number[] = []
      for (const line of lines) {
        if (bankNoise.test(line)) continue
        const matches = toAsciiDigits(line).match(/\b\d{1,3}(?:[,،\s]\d{3})*(?:\.\d+)?\b/g)
        if (!matches) continue
        for (const m of matches) {
          const v = toNumLoose(m)
          if (v != null && Number.isFinite(v) && v >= 1000) {
            numericCandidates.push(v)
          }
        }
      }
      // Assign in order to rows still missing amounts
      let cursor = 0
      // Trim to the tail of the amounts list to match count if needed
      const missingCount = expensesDraft.filter((r: any) => r.expense_activity && (r.expense_amount == null && r.expense_amount_sdg == null)).length
      if (numericCandidates.length > missingCount && missingCount > 0) {
        numericCandidates.splice(0, numericCandidates.length - missingCount)
      }
      for (let i = 0; i < expensesDraft.length && cursor < numericCandidates.length; i++) {
        const row = expensesDraft[i]
        const hasAmount = (row.expense_amount != null) || (row.expense_amount_sdg != null)
        if (row.expense_activity && !hasAmount) {
          row.expense_amount_sdg = numericCandidates[cursor++]
        }
      }
    } catch {}

    // Validate sum vs total_expenses_text if present; if far off, try dropping any values <1000 that slipped through
    try {
      const A = num(totalExpensesStr)
      if (A != null) {
        let sum = expensesDraft.reduce((s: number, r: any) => s + (Number(r.expense_amount_sdg ?? r.expense_amount) || 0), 0)
        const diff = Math.abs(sum - A)
        if (A > 0 && diff / A > 0.15) {
          // Recompute ignoring small values
          sum = expensesDraft.reduce((s: number, r: any) => {
            const v = Number(r.expense_amount_sdg ?? r.expense_amount) || 0
            return s + (v >= 1000 ? v : 0)
          }, 0)
          // If improved, zero-out small values
          if (Math.abs(sum - A) < diff) {
            expensesDraft = expensesDraft.map((r: any) => {
              const v = Number(r.expense_amount_sdg ?? r.expense_amount) || 0
              if (v > 0 && v < 1000) {
                r.expense_amount_sdg = null
                r.expense_amount = null
              }
              return r
            })
          }
        }
      }
    } catch {}

    // Include a compact AI output echo for debugging (whitelisted keys)
    const aiOutput = {
      date: ocrJson.date ?? null,
      state: ocrJson.state ?? null,
      locality: ocrJson.locality ?? null,
      total_expenses_text: ocrJson.total_expenses_text ?? null,
      total_grant_text: ocrJson.total_grant_text ?? null,
      total_other_sources_text: ocrJson.total_other_sources_text ?? null,
      remainder_text: ocrJson.remainder_text ?? null,
      language: ocrJson.language ?? null,
      expenses: Array.isArray(ocrJson.expenses) ? ocrJson.expenses.slice(0, 50) : []
    }

    return NextResponse.json({ summaryDraft, expensesDraft, aiOutput })
  } catch (e) {
    console.error('F4 parse error', e)
    return NextResponse.json({ error: 'Failed to parse' }, { status: 500 })
  }
}

