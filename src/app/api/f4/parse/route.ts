import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { processFForm } from '@/lib/ocrProcess'
import { extractF4FromPdfWithGemini } from '@/lib/geminiF4PdfExtract'
import { sanitizeAiJsonString } from '@/lib/sanitizeAiJson'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function detectLanguageFromText(text: string): 'ar' | 'en' {
  const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g
  const englishPattern = /[a-zA-Z]/g
  const arabicCount = (text.match(arabicPattern) || []).length
  const englishCount = (text.match(englishPattern) || []).length
  return arabicCount > englishCount ? 'ar' : 'en'
}

function clipText(s: unknown, max = 200): string {
  if (s == null || s === '') return '(empty)'
  const t = String(s).replace(/\r\n/g, '\n').trim()
  if (!t) return '(empty)'
  return t.length <= max ? t : `${t.slice(0, max)}…`
}

/** Terminal-friendly review of F4 extraction (grep: [F4 parse review]) */
function logF4ParseReview(params: {
  pipeline: 'gemini_pdf' | 'vision_openai'
  projectId: string
  fileKey: string
  durationMs: number
  ocrJson: any
  summaryDraft: any
  expensesDraft: any[]
  rawOcrLength: number
}) {
  const { pipeline, projectId, fileKey, durationMs, ocrJson, summaryDraft, expensesDraft, rawOcrLength } = params
  const sample = expensesDraft.slice(0, 6).map((r: any) => ({
    activity: clipText(r.expense_activity, 70),
    sdg: r.expense_amount_sdg ?? null,
    usd: r.expense_amount ?? null
  }))
  const block = {
    pipeline,
    project_id: projectId,
    file_key: fileKey,
    duration_ms: durationMs,
    raw_ocr_chars: rawOcrLength,
    model_header: {
      date: ocrJson?.date ?? null,
      language: ocrJson?.language ?? null,
      state: clipText(ocrJson?.state, 100),
      locality: clipText(ocrJson?.locality, 100)
    },
    totals_from_model: {
      total_expenses_text: ocrJson?.total_expenses_text ?? null,
      total_grant_text: ocrJson?.total_grant_text ?? null,
      total_other_sources_text: ocrJson?.total_other_sources_text ?? null,
      remainder_text: ocrJson?.remainder_text ?? null
    },
    summary_draft_numbers: {
      total_expenses: summaryDraft?.total_expenses ?? null,
      total_grant: summaryDraft?.total_grant ?? null,
      total_other_sources: summaryDraft?.total_other_sources ?? null,
      remainder: summaryDraft?.remainder ?? null
    },
    narrative_lengths: {
      excess_expenses: (summaryDraft?.excess_expenses && String(summaryDraft.excess_expenses).length) || 0,
      surplus_use: (summaryDraft?.surplus_use && String(summaryDraft.surplus_use).length) || 0,
      lessons: (summaryDraft?.lessons && String(summaryDraft.lessons).length) || 0,
      training: (summaryDraft?.training && String(summaryDraft.training).length) || 0
    },
    expenses_rows: expensesDraft.length,
    expenses_sample: sample
  }
  console.log('[F4 parse review]', JSON.stringify(block, null, 2))
  console.log(
    '[F4 parse review] narratives (first ~350 chars each):\n' +
      `  excess_expenses: ${clipText(summaryDraft?.excess_expenses, 350)}\n` +
      `  surplus_use:     ${clipText(summaryDraft?.surplus_use, 350)}\n` +
      `  lessons:         ${clipText(summaryDraft?.lessons, 350)}\n` +
      `  training:        ${clipText(summaryDraft?.training, 350)}`
  )
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const routeStart = Date.now()
    const { project_id, file_key_temp, f4_gemini_pdf } = await request.json()
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

    const isPdf = mime.includes('pdf') || lowerKey.endsWith('.pdf')
    const hasGeminiKey = !!String(process.env.GEMINI_API_KEY || '').trim()
    const useGeminiF4Pdf = isPdf && hasGeminiKey && f4_gemini_pdf === true

    if (f4_gemini_pdf === true && isPdf && !hasGeminiKey) {
      console.warn(
        '[F4] f4_gemini_pdf requested but GEMINI_API_KEY is missing — falling back to Vision + OpenAI.'
      )
    }

    let ocrJson: any
    let pipeline: 'gemini_pdf' | 'vision_openai' = 'vision_openai'

    if (useGeminiF4Pdf) {
      const buffer = Buffer.from(await blob.arrayBuffer())
      const { text: rawModel } = await extractF4FromPdfWithGemini(buffer)
      try {
        ocrJson = JSON.parse(sanitizeAiJsonString(rawModel))
      } catch (parseErr) {
        console.error('F4 Gemini JSON parse failed:', parseErr)
        return NextResponse.json({ error: 'Failed to parse', details: 'Invalid JSON from Gemini' }, { status: 500 })
      }
      if (!ocrJson.language) {
        ocrJson.language = detectLanguageFromText(rawModel)
      }
      ocrJson.raw_ocr = typeof ocrJson.raw_ocr === 'string' ? ocrJson.raw_ocr : ''
      pipeline = 'gemini_pdf'
      console.log('[F4 Gemini] done in', Date.now() - routeStart, 'ms')
    } else {
      ocrJson = await processFForm(file, { ocr_max_pages: 3, form_type: 'F4' })
    }

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

    /** Text after D. line — narrative blocks live here; avoids (2) in pre-table instructions. */
    const f4NarrativeRegion = (text: string): string => {
      if (!text) return ''
      const dIdx = text.search(/(?:^|[\n\r])\s*D\.[^\n]*/im)
      if (dIdx >= 0) {
        const lineEnd = text.indexOf('\n', dIdx)
        return lineEnd >= 0 ? text.slice(lineEnd + 1) : text.slice(dIdx)
      }
      return text
    }
    /** Match "(4)" or "4)" style markers at a line boundary. */
    const extractNarrativeBlock = (text: string, startNum: number, nextNum?: number): string | null => {
      if (!text?.trim()) return null
      const startRes = [
        new RegExp(`(?:^|[\\n\\r])\\s*\\(\\s*${startNum}\\s*\\)\\s*`, 'm'),
        new RegExp(`(?:^|[\\n\\r])\\s*${startNum}\\s*\\)\\s*`, 'm'),
      ]
      let bestIdx = -1
      let contentFrom = -1
      for (const re of startRes) {
        const m = re.exec(text)
        if (m) {
          const from = m.index + m[0].length
          if (bestIdx < 0 || m.index < bestIdx) {
            bestIdx = m.index
            contentFrom = from
          }
        }
      }
      if (contentFrom < 0) return null
      const tail = text.slice(contentFrom)
      if (nextNum == null || nextNum === undefined) return tail.trim() || null
      const endRes = [
        new RegExp(`(?:^|[\\n\\r])\\s*\\(\\s*${nextNum}\\s*\\)\\s*`, 'm'),
        new RegExp(`(?:^|[\\n\\r])\\s*${nextNum}\\s*\\)\\s*`, 'm'),
      ]
      let end = tail.length
      for (const re of endRes) {
        const m = re.exec(tail)
        if (m && m.index < end) end = m.index
      }
      const out = tail.slice(0, end).trim()
      return out || null
    }
    /** Some templates number narratives (2)–(5); others (4)–(7). Pick using first markers after D. */
    const detectF4NarrativeScheme = (region: string): 'q25' | 'q47' => {
      if (!region.trim()) return 'q47'
      const idx2 = region.search(/\(\s*2\s*\)/)
      const idx4 = region.search(/\(\s*4\s*\)/)
      if (idx2 >= 0 && (idx4 < 0 || idx2 < idx4)) return 'q25'
      return 'q47'
    }
    const narrativeRegion = f4NarrativeRegion(raw)
    const narrativeScheme = detectF4NarrativeScheme(narrativeRegion)
    const nar = (a: number, b?: number) => extractNarrativeBlock(narrativeRegion, a, b)
    const fbExcess = narrativeScheme === 'q25' ? nar(2, 3) : nar(4, 5)
    const fbSurplus = narrativeScheme === 'q25' ? nar(3, 4) : nar(5, 6)
    const fbLessons = narrativeScheme === 'q25' ? nar(4, 5) : nar(6, 7)
    const fbTraining = narrativeScheme === 'q25' ? nar(5) : nar(7)
    const stripQuestion = (ans: string | null) => {
      if (!ans) return ans
      // Remove common Arabic question headers if present
      return ans
        .replace(/^[^\n]{8,80}?[:؟]\s*/,'')
        .trim()
    }
    /** Gemini sometimes returns the full printed question + lone لا/نعم; keep the answer line only. */
    const normalizeF4QAnswer = (val: unknown): string => {
      if (val == null) return ''
      const s = String(val).trim()
      if (!s) return ''
      if (/^(لا|نعم)[\s,،]*$/u.test(s)) return /^لا/u.test(s) ? 'لا' : 'نعم'
      const lines = s.split(/\n/).map((l) => l.trim()).filter(Boolean)
      if (lines.length >= 2 && s.length > 80) {
        const last = lines[lines.length - 1]
        if (/^(لا|نعم)[\s,،]*$/u.test(last) && /؟/.test(s)) {
          return /^لا/u.test(last) ? 'لا' : 'نعم'
        }
      }
      return s
    }
    const q1 = stripQuestion(
      normalizeF4QAnswer(ocrJson.excess_expenses) ||
        fbExcess ||
        grab(/4\.[\s\S]*?\n([^\n]+?)(?=\n\s*5\.)/)
    )
    const q2 = stripQuestion(
      normalizeF4QAnswer(ocrJson.surplus_use) ||
        fbSurplus ||
        grab(/5\.[\s\S]*?\n([^\n]+?)(?=\n\s*6\.)/)
    )
    const q3 = stripQuestion(
      normalizeF4QAnswer(ocrJson.lessons) ||
        fbLessons ||
        grab(/6\.[\s\S]*?\n([^\n]+?)(?=\n\s*7\.)/)
    )
    const q4 = stripQuestion(
      normalizeF4QAnswer(ocrJson.training) ||
        fbTraining ||
        grab(/7\.[\s\S]*?\n([^\n]+?)(?:\n|$)/)
    )

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

    // Map expenses: prioritize AI output amounts, assume SDG if currency is null for Arabic forms
    const isArabic = ocrJson.language === 'ar'
    let expensesDraft = (ocrJson.expenses || []).map((e: any, idx: number) => {
      // If AI provided amount_value, use it - assume SDG if currency is null and form is Arabic
      let expense_amount_sdg = null
      let expense_amount = null
      let source = 'none'
      
      if (e.amount_value != null) {
        if (e.currency === 'SDG') {
          expense_amount_sdg = e.amount_value
          source = 'AI-SDG'
        } else if (e.currency === 'USD') {
          expense_amount = e.amount_value
          source = 'AI-USD'
        } else if (e.currency == null && isArabic) {
          // Default to SDG for Arabic forms when currency is not specified
          expense_amount_sdg = e.amount_value
          source = 'AI-SDG-default'
        } else {
          // Fallback: use amount_value as-is
          expense_amount_sdg = e.amount_value
          source = 'AI-default'
        }
      } else {
        // Legacy fallback for old format
        expense_amount_sdg = e.currency === 'SDG' ? (e.total_cost_sdg ?? null) : null
        expense_amount = e.currency === 'USD' ? (e.amount_value ?? e.total_cost_usd ?? null) : (e.total_cost_usd ?? null)
        source = 'legacy'
      }
      
      
      return {
        expense_activity: e.activity || null,
        expense_description: null,
        expense_amount_sdg,
        expense_amount,
        payment_date: null,
        payment_method: null,
        receipt_no: null,
        seller: null,
        language: ocrJson.language || null,
        is_draft: true
      }
    })

    // CRITICAL: Check for totals assigned as expense amounts (before any other processing)
    // This must run early to catch cases where AI assigns the total to an expense
    try {
      const A = num(totalExpensesStr)
      if (A != null && A > 0) {
        expensesDraft.forEach((r: any, idx: number) => {
          const v = Number(r.expense_amount_sdg ?? r.expense_amount) || 0
          // If an expense amount equals or is very close to the total, it's definitely a total misassigned
          if (v > 0 && Math.abs(v - A) < A * 0.01) {
            r.expense_amount_sdg = null
            r.expense_amount = null
          }
        })
      }
    } catch (e) {
      // Error handling
    }

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
    // ONLY use this if AI didn't provide amounts - prioritize AI output
    try {
      const missingCount = expensesDraft.filter((r: any) => r.expense_activity && (r.expense_amount == null && r.expense_amount_sdg == null)).length
      if (missingCount > 0) {
        
        // Exclude totals and summary sections - look for amounts in the expense table area only
        const totalPatterns = /(إجمالي|المجموع|Total|A\.|B\.|C\.|D\.|اجمالي|المتبقي|المستلم|من المنحة|من مصادر أخرى)/
        const bankNoise = /(بنكك|رقم العملية|التاريخ\s*و\s*الزمن|SDG|طباعة|تحميل|إضافة|رقم الحساب)/
        
        // Find the expense amounts section - typically after "قيمة المصروفات" or "المصروفات"
        const expenseAmountSection = /(?:قيمة\s*المصروفات|المصروفات|Expenditure|Amount)[\s\S]*?(?=\n\s*(?:---|A\.|إجمالي|Total|$))/i
        const sectionMatch = raw.match(expenseAmountSection)
        const searchText = sectionMatch ? sectionMatch[0] : raw
        
        const lines = searchText.split(/\n+/).map(l => l.trim()).filter(Boolean)
        const numericCandidates: number[] = []
        
        for (const line of lines) {
          // Skip lines with totals, summaries, or bank noise
          if (totalPatterns.test(line) || bankNoise.test(line)) continue
          
          // Skip lines that are clearly part of summary section (A, B, C, D)
          if (/^[ABCD]\./.test(line.trim())) continue
          
          const matches = toAsciiDigits(line).match(/\b\d{1,3}(?:[,،\s]\d{3})+(?:\.\d+)?\b/g)
          if (!matches) continue
          
          for (const m of matches) {
            const v = toNumLoose(m)
            // More restrictive: only accept amounts that look like individual expenses
            // Exclude very large numbers that are likely totals (e.g., > 10,000,000 for SDG)
            if (v != null && Number.isFinite(v) && v >= 1000 && v < 10000000) {
              numericCandidates.push(v)
            }
          }
        }
        
        
        // Assign in order to rows still missing amounts
        let cursor = 0
        // If we have more candidates than missing, take the last N that match the count
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
      }
    } catch (e) {
      // Error handling
    }

    // Validate sum vs total_expenses_text if present; if far off, try dropping any values that look like totals
    try {
      const A = num(totalExpensesStr)
      if (A != null && A > 0) {
        // ALWAYS check for totals assigned as expenses, even if sum matches
        // This catches cases where the total was assigned but sum still works out
        expensesDraft.forEach((r: any, idx: number) => {
          const v = Number(r.expense_amount_sdg ?? r.expense_amount) || 0
          // If an expense amount equals or is very close to the total, it's definitely a total misassigned
          if (v > 0 && Math.abs(v - A) < A * 0.01) {
            r.expense_amount_sdg = null
            r.expense_amount = null
          }
        })
        
        let sum = expensesDraft.reduce((s: number, r: any) => s + (Number(r.expense_amount_sdg ?? r.expense_amount) || 0), 0)
        const diff = Math.abs(sum - A)
        
        // Also check for suspiciously large amounts that might be totals
        // Only flag if amount is BOTH: much larger than other expenses AND close to the total
        // This prevents false positives where a legitimate large expense is flagged
        if (expensesDraft.length > 1) {
          const amounts = expensesDraft
            .map((r: any) => Number(r.expense_amount_sdg ?? r.expense_amount) || 0)
            .filter((v: number) => v > 0)
            .sort((a: number, b: number) => b - a) // Sort descending
          
          if (amounts.length > 1) {
            const largest = amounts[0]
            const secondLargest = amounts[1]
            // Only flag if:
            // 1. Largest is more than 5x the second largest (more conservative than 3x)
            // 2. AND it's within 10% of the total (suggesting it might be the total misassigned)
            // This prevents legitimate large expenses from being removed
            const isMuchLarger = largest > secondLargest * 5
            const isCloseToTotal = A != null && Math.abs(largest - A) < A * 0.1
            
            if (isMuchLarger && isCloseToTotal && largest > 1000000) {
              expensesDraft.forEach((r: any) => {
                const v = Number(r.expense_amount_sdg ?? r.expense_amount) || 0
                if (v === largest) {
                  r.expense_amount_sdg = null
                  r.expense_amount = null
                }
              })
              // Recompute sum after removal
              sum = expensesDraft.reduce((s: number, r: any) => s + (Number(r.expense_amount_sdg ?? r.expense_amount) || 0), 0)
            }
          }
        }
        
        // If still far off after removing totals, try dropping small values
        if (A > 0 && Math.abs(sum - A) / A > 0.15) {
          sum = expensesDraft.reduce((s: number, r: any) => {
            const v = Number(r.expense_amount_sdg ?? r.expense_amount) || 0
            return s + (v >= 1000 ? v : 0)
          }, 0)
          // If improved, zero-out small values
          const newDiff = Math.abs(sum - A)
          if (newDiff < diff) {
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
    } catch (e) {
      // Error handling
    }

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

    logF4ParseReview({
      pipeline,
      projectId: String(project_id),
      fileKey: String(file_key_temp),
      durationMs: Date.now() - routeStart,
      ocrJson,
      summaryDraft,
      expensesDraft,
      rawOcrLength: raw.length
    })

    return NextResponse.json({ summaryDraft, expensesDraft, aiOutput })
  } catch (e) {
    console.error('F4 parse error', e)
    return NextResponse.json({ error: 'Failed to parse' }, { status: 500 })
  }
}

