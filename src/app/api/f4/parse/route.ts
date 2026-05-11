import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { fetchF4SectorsForMatch, normalizeF4ExpenseActivitiesToSectors } from '@/lib/f4ExpenseSectors'
import { processFForm } from '@/lib/ocrProcess'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function logF4Section (title: string) {
  console.log('')
  console.log('[F4 parse] ═══════════════════════════════════════════════════════════════')
  console.log(`[F4 parse] ${title}`)
  console.log('[F4 parse] ═══════════════════════════════════════════════════════════════')
}

function previewText (s: string | null | undefined, max = 120): string {
  if (s == null || s === '') return '(empty)'
  const t = String(s).replace(/\s+/g, ' ').trim()
  return t.length <= max ? t : `${t.slice(0, max)}…`
}

export async function POST(request: Request) {
  const routeStart = Date.now()
  try {
    const supabase = getSupabaseRouteClient()
    const { project_id, file_key_temp } = await request.json()
    if (!project_id || !file_key_temp) return NextResponse.json({ error: 'project_id and file_key_temp required' }, { status: 400 })

    logF4Section('START')
    console.log('[F4 parse] request', { project_id, file_key_temp, ts: new Date().toISOString() })
    console.log(
      '[F4 parse] Field guide: "report" = from uploaded PDF/image via Gemini OCR+structure. ' +
        '"route" = calculated/adjusted in this API. ' +
        '"UI" = Total Grant USD, USD columns, Remainder USD use project metadata + user exchange rate in the browser — not set here.'
    )

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

    console.log('[F4 parse] file ready', { filename, mimeType: mime || '(unknown)', blobBytes: blob.size })

    const ocrStart = Date.now()
    const ocrJson = await processFForm(file, { ocr_max_pages: 3, form_type: 'F4' })
    const ocrMs = Date.now() - ocrStart
    const raw = (ocrJson.raw_ocr || '') as string

    logF4Section(`GEMINI PIPELINE COMPLETE (${ocrMs} ms) — raw text + structured JSON`)
    console.log('[F4 parse] raw_ocr length:', raw.length, '| language:', ocrJson.language ?? null)
    if (raw.length > 0) {
      console.log('[F4 parse] raw_ocr START ▼\n', raw.substring(0, 220))
      console.log('[F4 parse] raw_ocr END ▼\n', raw.substring(Math.max(0, raw.length - 220)))
    } else {
      console.warn('[F4 parse] raw_ocr EMPTY — check extraction')
    }

    // Map to F4 drafts
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

    /** F4 totals: regex must not capture stray single digits (e.g. list "3)"). Prefer Arabic labels + multi-digit amounts. */
    const asciiRaw = toAsciiDigits(String(raw || '').replace(/\r/g, ''))
    const normalizeAmountToken = (s: string | null): string | null => {
      if (s == null) return null
      const t = String(s).replace(/\s+/g, '').replace(/،/g, ',').trim()
      return t || null
    }
    const firstAmountInLine = (line: string): string | null => {
      const mm = toAsciiDigits(line).match(/([\d]{1,3}(?:[,،]\d{3})+)/)
      return mm ? normalizeAmountToken(mm[1]) : null
    }
    const amountFromLineLoose = (line: string): string | null => {
      const a = toAsciiDigits(line)
      const matches = [...a.matchAll(/([\d]{1,3}(?:[,،]\d{3})+|\d+)/g)]
      for (let i = matches.length - 1; i >= 0; i--) {
        const tok = normalizeAmountToken(matches[i][1])
        if (tok == null) continue
        const n = num(tok)
        if (n != null && n >= 0 && n <= 999_999_999) return tok
      }
      return null
    }
    const grabF4TotalFromRaw = (kind: 'A' | 'B' | 'C' | 'D'): string | null => {
      const lines = asciiRaw.split(/\n/).map((l: string) => l.trim()).filter(Boolean)
      const patterns: Record<'A' | 'B' | 'C' | 'D', RegExp[]> = {
        A: [
          /(?:^|\n)\s*A\.\s*[^\d\n]*([\d]{1,3}(?:[,،]\d{3})+)\s*(?:SDG|جنيه)?/i,
          /إجمالي\s*النفقات[^\d\n]{0,120}?([\d]{1,3}(?:[,،]\d{3})+)/i,
        ],
        B: [
          /(?:^|\n)\s*B\.\s*[^\d\n]*([\d]{1,3}(?:[,،]\d{3})+)\s*(?:SDG|جنيه)?/i,
          /المستلم\s*من\s*المنحة[^\d\n]{0,120}?([\d]{1,3}(?:[,،]\d{3})+)/i,
          /المبلغ\s*الإجمالي\s*المستلم[^\d\n]{0,120}?([\d]{1,3}(?:[,،]\d{3})+)/i,
        ],
        C: [
          /(?:^|\n)\s*C\.\s*[^\d\n]*(\d+)\s*(?:SDG|جنيه)?/i,
          /مصادر\s*أخرى[^\d\n]{0,120}?(\d+)/i,
        ],
        D: [
          /(?:^|\n)\s*D\.\s*[^\d\n]*(\d+)\s*(?:SDG|جنيه)?/i,
          /المتبقي[^\d\n]{0,120}?(\d+)/i,
        ],
      }
      for (const re of patterns[kind]) {
        const m = asciiRaw.match(re)
        if (m?.[1]) {
          const tok = normalizeAmountToken(m[1])
          const n = num(tok)
          if (n == null) continue
          if (kind === 'A' || kind === 'B') {
            if (n < 1_000) continue
          } else {
            if (n < 0) continue
          }
          return tok
        }
      }
      if (kind === 'A' || kind === 'B') {
        for (const line of lines) {
          if (kind === 'A' && /إجمالي\s*النفقات/i.test(line) && !/A\s*-\s*\(/i.test(line)) {
            const tok = firstAmountInLine(line)
            const n = num(tok)
            if (tok && n != null && n >= 1_000) return tok
          }
          if (kind === 'B' && /(المستلم\s*من\s*المنحة|المبلغ\s*الإجمالي\s*المستلم)/i.test(line)) {
            const tok = firstAmountInLine(line)
            const n = num(tok)
            if (tok && n != null && n >= 1_000) return tok
          }
        }
      }
      if (kind === 'C' || kind === 'D') {
        for (const line of lines) {
          if (kind === 'C' && /مصادر\s*أخرى/i.test(line)) {
            const tok = firstAmountInLine(line) || amountFromLineLoose(line) || grab(/C\.[^\d]*(\d+)/i)
            if (tok != null) return normalizeAmountToken(tok)
          }
          if (kind === 'D' && /المتبقي/i.test(line)) {
            const tok = firstAmountInLine(line) || amountFromLineLoose(line) || grab(/D\.[^\d]*(\d+)/i)
            if (tok != null) return normalizeAmountToken(tok)
          }
        }
      }
      return null
    }

    // Prefer model outputs; fallback to stricter raw-OCR extraction.
    // Avoid broad /A.|B.|C.|D./ regex fallback because it can capture question numbering.
    const totalExpensesStr =
      (ocrJson.total_expenses_text ?? null) || grabF4TotalFromRaw('A')
    const totalGrantStr =
      (ocrJson.total_grant_text ?? null) || grabF4TotalFromRaw('B')
    const otherSourcesStr =
      (ocrJson.total_other_sources_text ?? null) || grabF4TotalFromRaw('C')
    const remainderStr =
      (ocrJson.remainder_text ?? null) || grabF4TotalFromRaw('D')

    const totalsLineSource = {
      A_total_expenses_text: ocrJson.total_expenses_text ? 'report_via_model' : 'regex_on_raw_ocr',
      B_grant_text: ocrJson.total_grant_text ? 'report_via_model' : 'regex_on_raw_ocr',
      C_other_sources_text: ocrJson.total_other_sources_text ? 'report_via_model' : 'regex_on_raw_ocr',
      D_remainder_text: ocrJson.remainder_text ? 'report_via_model' : 'regex_on_raw_ocr',
    }

    // Capture narrative answers between numbered prompts (allow multi-line). Number may be "(3 )" or "3)".
    const extractBetween = (text: string, startNum: number, nextNum?: number): string | null => {
      const s = String(startNum)
      const startRe = new RegExp(`(?:^|\\n)\\s*\\(?\\s*${s}\\s*\\)\\s*`)
      const startMatch = text.match(startRe)
      if (!startMatch) return null
      const startIdx = (startMatch.index || 0) + startMatch[0].length
      const remainder = text.slice(startIdx)
      if (nextNum != null) {
        const n = String(nextNum)
        const nextRe = new RegExp(`(?:^|\\n)\\s*\\(?\\s*${n}\\s*\\)\\s*`)
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
        .replace(/^\(?\s*توضيح[:：]?\s*.*?\)?\s*/,'')
        .trim()
    }

    const parseF4ReportDateFromRaw = (src: string): string | null => {
      const t = toAsciiDigits(String(src || '').replace(/\r/g, ''))
      const months: Record<string, string> = {
        يناير: '01',
        فبراير: '02',
        مارس: '03',
        ابريل: '04',
        أبريل: '04',
        مايو: '05',
        يونيو: '06',
        يوليو: '07',
        اغسطس: '08',
        أغسطس: '08',
        سبتمبر: '09',
        اكتوبر: '10',
        أكتوبر: '10',
        نوفمبر: '11',
        ديسمبر: '12',
      }
      let m = t.match(/تاريخ\s*التقرير\s*[:：]?\s*(\d{1,2})\s+([^\d\n:/]+?)\s+(\d{4})/)
      if (m) {
        const day = m[1].padStart(2, '0')
        const monKey = m[2].replace(/\s+/g, ' ').trim()
        const year = m[3]
        const mon = months[monKey] || months[(monKey.split(/\s+/)[0] || '').trim()]
        if (mon) return `${year}-${mon}-${day}`
      }
      m = t.match(/تاريخ\s*التقرير\s*[:：]?\s*(\d{4})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{1,2})/)
      if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
      m = t.match(/تاريخ\s*التقرير\s*[:：]?\s*(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{4})/)
      if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
      return null
    }

    const parseF4ExpenseRowsFallback = (ascii: string): Array<{ activity: string; amount_value: number; currency: 'SDG' }> => {
      const out: Array<{ activity: string; amount_value: number; currency: 'SDG' }> = []
      let block = ''
      const m1 =
        ascii.match(/(?:\(?\s*3\s*\)|3\s*\))[^\n]*\n([\s\S]*?)(?=\n\s*(?:\(?\s*4\s*\)|4\s*\)|A\.|إجمالي\s*النفقات))/i) ||
        ascii.match(/(?:\(?\s*2\s*\)|2\s*\))[^\n]*\n([\s\S]*?)(?=\n\s*(?:\(?\s*3\s*\)|3\s*\)|A\.|إجمالي\s*النفقات))/i)
      if (m1) block = m1[1]
      if (!block || block.length < 30) {
        const m2 = ascii.match(
          /(?:قيمة\s*المصروفات|الأنشطة\s*\||النشاط)[\s\S]*?(?=\n\s*(?:\(?\s*4\s*\)|4\s*\)|A\.|إجمالي\s*النفقات))/i
        )
        if (m2) block = m2[0]
      }
      if (!block) return out
      const lines = block.split(/\n/).map(l => l.trim()).filter(Boolean)
      for (const line of lines) {
        if (/^(?:النشاط|الأنشطة|وصف|تاريخ|البائع|نوع|رقم|قيمة|\||ـ{3,})/i.test(line)) continue
        if (/^A\.|^B\.|إجمالي\s*النفقات/i.test(line)) continue
        const amountMatches = [...toAsciiDigits(line).matchAll(/(\d{1,3}(?:[,،]\d{3})+|\d{5,})/g)]
        if (!amountMatches.length) continue
        let pickedToken: string | null = null
        let pickedValue: number | null = null
        for (const m of amountMatches) {
          const tok = normalizeAmountToken(m[1])
          const v = toNumLoose(tok)
          if (v == null || v < 10_000 || v > 100_000_000) continue
          if (pickedValue == null || v > pickedValue) {
            pickedValue = v
            pickedToken = tok
          }
        }
        if (pickedToken == null || pickedValue == null) continue
        let activity = line
          .replace(new RegExp(String(pickedToken).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), ' ')
          .replace(/\|/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim()
        activity = activity.replace(/^[\d\s.|ـ-]+/u, '').trim()
        if (activity.length < 2) continue
        const arMonth =
          '(?:يناير|فبراير|مارس|ابريل|أبريل|مايو|يونيو|يوليو|اغسطس|أغسطس|سبتمبر|اكتوبر|أكتوبر|نوفمبر|ديسمبر)'
        const dateInLine = activity.match(new RegExp(`\\s+\\d{1,2}\\s+${arMonth}\\s+\\d{4}`, 'i'))
        if (dateInLine && dateInLine.index != null && dateInLine.index > 2) {
          activity = activity.slice(0, dateInLine.index).trim()
        }
        activity = activity.replace(/\s+بنكك(?:\s*\/|\s).*$/i, '').replace(/\s+كاش\s*$/i, '').trim()
        activity = activity.replace(/\s+\d{3,}\s*$/,'').trim()
        if (activity.length < 2) continue
        out.push({ activity: activity.slice(0, 240), amount_value: pickedValue, currency: 'SDG' })
      }
      return out
    }

    const rawForNarratives = toAsciiDigits(raw || '').replace(/\r/g, '')
    const pickEarliestMatch = (text: string, patterns: RegExp[]): RegExpMatchArray | null => {
      let best: RegExpMatchArray | null = null
      for (const p of patterns) {
        const m = text.match(p)
        if (!m || m.index == null) continue
        if (!best || (best.index != null && m.index < best.index)) best = m
      }
      return best
    }
    const isQuestionLikeText = (value: string): boolean => {
      const t = value.replace(/\s+/g, ' ').trim()
      if (!t) return true
      if (/https?:\/\//i.test(t)) return true
      if (/\bXX\s*-\s*XX\b/i.test(t)) return true
      if (/^(?:\s*\()?توضيح/i.test(t)) return true
      if (/^(?:\s*\(?\d+\)?\s*)?(?:إذا\s*كان|كيف\s*دفعت|كيف\s*ترغب|ماذا\s*تعلمت|هل\s*ستفعل|هل\s*هناك)\b/i.test(t)) return true
      if (/\b(?:Q\d+|question)\b/i.test(t)) return true
      if (t.length > 12 && /[؟?]/.test(t) && !/\b(?:نعم|لا)\b/i.test(t)) return true
      return false
    }
    /** OCR often glues "(4)" or "4)" + start of next question onto the answer line — keep only text before next numbered prompt. */
    const clipAtNextNumberedPrompt = (text: string): string => {
      const t = String(text || '').trim()
      if (!t) return t
      const m = t.match(
        /^([\s\S]+?)(?=\s*\(\s*\d{1,2}\s*\)\s*$|\s*\(\s*\d{1,2}\s*\)\s*(?:إذا|كيف|ماذا|هل|قم)|(?:^|\s)\s*\d{1,2}\s*\)\s*(?:إذا|كيف|ماذا|هل))/i
      )
      if (m?.[1]) {
        const head = m[1].trim()
        if (head.length >= 1) return head
      }
      const parts = t.split(/\s*\(\s*\d{1,2}\s*\)\s*/)
      if (parts.length > 1 && parts[0] && parts[0].trim().length >= 1) return parts[0].trim()
      return t
    }
    const extractLikelyAnswerFromMixedBlock = (text: string): string => {
      const t = String(text || '').replace(/\r/g, '\n').trim()
      if (!t) return t
      const lines = t
        .split(/\n+/)
        .map(l => l.replace(/^[•\-\u2022]\s*/, '').trim())
        .filter(Boolean)

      // Prefer trailing lines that are not question prompts/clarifications.
      const answerLines = lines.filter(l =>
        !isQuestionLikeText(l) &&
        !/^(?:\(?\s*توضيح[:：]?|يجب\s*الحصول\s*على\s*الموافقة)/i.test(l)
      )
      if (answerLines.length > 0) {
        return answerLines.join(' ').replace(/\s{2,}/g, ' ').trim()
      }

      // If OCR glued question and answer in one line, keep text after the last question mark.
      const qIdx = Math.max(t.lastIndexOf('؟'), t.lastIndexOf('?'))
      if (qIdx !== -1 && qIdx < t.length - 1) {
        return t.slice(qIdx + 1).trim()
      }
      return t
    }
    const cleanNarrativeAnswer = (candidate: string | null): string | null => {
      if (!candidate) return null
      let t = candidate
        .replace(/^\s*[-–—:：]+\s*/,'')
        .replace(/^\s*\(?\s*توضيح[:：]?\s*.*?\)?\s*/,'')
        .replace(/^\s*\(?\d+\)?\s*[\)\.\-:]?\s*/,'')
        .replace(/[\u200e\u200f]/g, '')
        .trim()
      if (!t) return null
      t = clipAtNextNumberedPrompt(t)
      if (!t) return null
      t = extractLikelyAnswerFromMixedBlock(t)
      if (!t) return null
      const ynMatches = t.match(/\b(?:نعم|لا|yes|no)\b/gi)
      if (ynMatches && ynMatches.length > 0) {
        return ynMatches[ynMatches.length - 1].trim()
      }
      // If this still looks like question text, ignore it rather than returning polluted content.
      if (isQuestionLikeText(t)) return null

      // Reject common receipt/attachment or clarification noise.
      if (/(suncline|sgs|khartoumerr|facebook|bank|invoice|receipt|فاتورة|إيصال|اشعار|إشعار|الطرف\s*الأول|الطرف\s*الثاني|الشهود)/i.test(t)) return null
      if (/يجب\s*الحصول\s*على\s*الموافقة\s*من\s*غرفة\s*طوارئ\s*الولاية/i.test(t)) return null

      const stripped = stripQuestion(t)
      if (!stripped || isQuestionLikeText(stripped)) return null
      return stripped
    }
    const extractByQuestionAnchors = (
      text: string,
      anchors: RegExp[],
      nextQuestionAnchors: RegExp[]
    ): string | null => {
      const startMatch = pickEarliestMatch(text, anchors)
      if (!startMatch || startMatch.index == null) return null

      const questionStart = startMatch.index
      let answerStart = questionStart + startMatch[0].length

      // If a question mark appears shortly after question start, prefer extracting after it.
      const questionWindow = text.slice(questionStart, Math.min(text.length, questionStart + 260))
      const qMarkOffset = questionWindow.search(/[؟?]/)
      if (qMarkOffset !== -1) {
        answerStart = Math.max(answerStart, questionStart + qMarkOffset + 1)
      }

      const tail = text.slice(answerStart)
      let end = tail.length

      for (const marker of nextQuestionAnchors) {
        const nextMatch = tail.match(marker)
        if (nextMatch?.index != null) end = Math.min(end, nextMatch.index)
      }

      const hardStopMatch = tail.match(
        /(?:^|\n)\s*(?:\d+\s*[\)\.\-]|الاشعارات|الإشعارات|الفواتير|المرفقات|مرفقات|attachments?|receipts?|bank\s*transfer|إيصالات?)\b/i
      )
      if (hardStopMatch?.index != null) end = Math.min(end, hardStopMatch.index)

      const candidate = tail.slice(0, end).trim()
      return cleanNarrativeAnswer(candidate)
    }
    const readModelText = (value: unknown): string | null => {
      if (typeof value !== 'string') return null
      const t = value.trim()
      return cleanNarrativeAnswer(t)
    }

    const q1Anchors = [
      /إجمالي\s*نفقاتك[\s\S]{0,120}?أكبر[\s\S]{0,80}?المنحة[\s\S]{0,120}?الإضافي/i,
      /كيف\s*دفعت[\s\S]{0,80}?المبلغ\s*الإضافي/i,
    ]
    const q2Anchors = [
      /إجمالي\s*نفقاتك[\s\S]{0,120}?أقل[\s\S]{0,80}?المنحة[\s\S]{0,120}?الفائض/i,
      /كيف\s*ترغب[\s\S]{0,80}?إنفاق\s*الفائض/i,
    ]
    const q3Anchors = [
      /ماذا\s*تعلمت[\s\S]{0,220}?تخطيط\s*الميزانيات/i,
      /هل\s*ستفعل[\s\S]{0,120}?شيء\s*مختلف/i,
    ]
    const q4Anchors = [
      /احتياجات\s*إضافية[\s\S]{0,220}?(?:التدريب|تعزيز\s*القدرات)/i,
      /الإدارة\s*المالية[\s\S]{0,160}?تعزيز\s*غرفتك/i,
    ]
    const allNarrativeQuestionAnchors = q1Anchors.concat(q2Anchors, q3Anchors, q4Anchors)
    const narrativeAttachmentStopRe =
      /(?:^|\n)\s*(?:الاشعارات|الإشعارات|الفواتير|المرفقات|مرفقات|صور\s*الإشعارات|اشعارات\s*التحويل|attachments?|receipts?|bank\s*transfer)\b/i
    const buildNarrativeWindow = (text: string): string => {
      const startMatch = pickEarliestMatch(text, allNarrativeQuestionAnchors)
      if (!startMatch || startMatch.index == null) return text
      const tail = text.slice(startMatch.index)
      const stopMatch = tail.match(narrativeAttachmentStopRe)
      if (!stopMatch || stopMatch.index == null) return tail
      return tail.slice(0, stopMatch.index)
    }
    /** Anchor-based extraction stays windowed past attachments; numbered (3)-(6) fallbacks scan full OCR. */
    const narrativeText = buildNarrativeWindow(rawForNarratives)

    const q1Fallback =
      extractByQuestionAnchors(narrativeText, q1Anchors, q2Anchors.concat(q3Anchors, q4Anchors)) ||
      extractBetween(rawForNarratives, 3, 4) ||
      extractBetween(rawForNarratives, 4, 5) ||
      grab(/4\.[\s\S]*?\n([^\n]+?)(?=\n\s*5\.)/)
    const q2FallbackPrimary =
      extractByQuestionAnchors(narrativeText, q2Anchors, q3Anchors.concat(q4Anchors)) ||
      extractBetween(rawForNarratives, 4, 5) ||
      extractBetween(rawForNarratives, 5, 6) ||
      grab(/5\.[\s\S]*?\n([^\n]+?)(?=\n\s*6\.)/)
    const q3FallbackPrimary =
      extractByQuestionAnchors(narrativeText, q3Anchors, q4Anchors) ||
      extractBetween(rawForNarratives, 5, 6) ||
      extractBetween(rawForNarratives, 6, 7) ||
      extractBetween(rawForNarratives, 7, 10) ||
      grab(/6\.[\s\S]*?\n([^\n]+?)(?=\n\s*7\.)/)
    const q4FallbackPrimary =
      extractByQuestionAnchors(narrativeText, q4Anchors, []) ||
      extractBetween(rawForNarratives, 10, 11) ||
      extractBetween(rawForNarratives, 11) ||
      extractBetween(rawForNarratives, 6, 7)

    // Template variant support:
    // - Some F4s include item (6) as "expenses equal to grant" statement (use as surplus_use fallback when item 5 is empty).
    // - Lessons can continue across (7), (8), (9).
    // - Training question appears at (10) with answer often on (11).
    const equalExpensesStatement = cleanNarrativeAnswer(extractBetween(rawForNarratives, 6, 7))
    const lessonsExtended = cleanNarrativeAnswer(extractBetween(rawForNarratives, 7, 10))
    const trainingFrom10 = cleanNarrativeAnswer(extractBetween(rawForNarratives, 10, 11))
    const trainingFrom11 = cleanNarrativeAnswer(extractBetween(rawForNarratives, 11))

    const q1 = cleanNarrativeAnswer(readModelText(ocrJson.excess_expenses) || q1Fallback)
    const q2 =
      cleanNarrativeAnswer(readModelText(ocrJson.surplus_use) || q2FallbackPrimary) ||
      (equalExpensesStatement && /(?:تساو|يساو|equal)/i.test(equalExpensesStatement) ? equalExpensesStatement : null)
    const q3 = cleanNarrativeAnswer(readModelText(ocrJson.lessons) || q3FallbackPrimary) || lessonsExtended
    const q4 = cleanNarrativeAnswer(readModelText(ocrJson.training) || q4FallbackPrimary) || trainingFrom10 || trainingFrom11

    const narrativeSource = {
      excess_expenses_q4: typeof ocrJson.excess_expenses === 'string' && ocrJson.excess_expenses.trim() ? 'report_via_model' : 'regex_on_raw_ocr',
      surplus_use_q5: typeof ocrJson.surplus_use === 'string' && ocrJson.surplus_use.trim() ? 'report_via_model' : 'regex_on_raw_ocr',
      lessons_q6: typeof ocrJson.lessons === 'string' && ocrJson.lessons.trim() ? 'report_via_model' : 'regex_on_raw_ocr',
      training_q7: typeof ocrJson.training === 'string' && ocrJson.training.trim() ? 'report_via_model' : 'regex_on_raw_ocr',
    }

    logF4Section('FROM REPORT — Summary lines A/B/C/D (strings → parsed SDG numbers)')
    console.log('[F4 parse] source:', totalsLineSource)
    console.log('[F4 parse] A إجمالي النفقات', { rawText: totalExpensesStr, parsed: num(totalExpensesStr) })
    console.log('[F4 parse] B المنحة', { rawText: totalGrantStr, parsed: num(totalGrantStr), note: 'Line B from report; USD grant from work plan is UI/Supabase' })
    console.log('[F4 parse] C مصادر أخرى', { rawText: otherSourcesStr, parsed: num(otherSourcesStr) })
    console.log('[F4 parse] D المتبقي', { rawText: remainderStr, parsed: num(remainderStr) })

    logF4Section('FROM REPORT — Narratives (Q4 excess / Q5 surplus / Q6 lessons / Q7 training)')
    console.log('[F4 parse] source:', narrativeSource)
    console.log('[F4 parse] Q4 excess_expenses:', previewText(q1))
    console.log('[F4 parse] Q5 surplus_use:', previewText(q2))
    console.log('[F4 parse] Q6 lessons:', previewText(q3))
    console.log('[F4 parse] Q7 training:', previewText(q4))

    const summaryDraft = {
      report_date: ocrJson.date || parseF4ReportDateFromRaw(raw) || null,
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
    let remainderFilledByRoute = false
    if (summaryDraft.remainder == null) {
      const A = summaryDraft.total_expenses
      const B = summaryDraft.total_grant
      const C = summaryDraft.total_other_sources
      if (A != null && (B != null || B === 0) && (C != null || C === 0)) {
        summaryDraft.remainder = (A as number) - (B as number) + (C as number)
        remainderFilledByRoute = true
        console.log('[F4 parse] ROUTE CALC: remainder was null → filled as A - B + C =', summaryDraft.remainder, { A, B, C })
      }
    } else {
      console.log('[F4 parse] remainder from report line D (parsed):', summaryDraft.remainder)
    }

    logF4Section(
      'FROM REPORT — Expense table (Gemini JSON rows). Columns: activity, amount_value, currency; ' +
        'description/date/payment/receipt/seller require prompt+mapping changes — currently not passed through to draft.'
    )
    const modelRows = Array.isArray(ocrJson.expenses) ? ocrJson.expenses : []
    const fallbackExpenseRows = modelRows.length === 0 ? parseF4ExpenseRowsFallback(asciiRaw) : []
    const expenseRowsForMap = modelRows.length ? modelRows : fallbackExpenseRows
    console.log('[F4 parse] model row count:', modelRows.length, '| fallback rows:', fallbackExpenseRows.length)
    expenseRowsForMap.forEach((e: Record<string, unknown>, idx: number) => {
      const rest = { ...e }
      delete rest.activity
      delete rest.amount_value
      delete rest.currency
      const extraKeys = Object.keys(rest as object).length ? JSON.stringify(rest) : '{}'
      console.log(
        `[F4 parse]   row ${idx + 1}: activity=${previewText(e.activity as string | undefined, 80)} | amount_value=${e.amount_value ?? 'null'} | currency=${e.currency ?? 'null'} | other_keys=${extraKeys}`
      )
    })

    // Map expenses: prioritize AI output amounts, assume SDG if currency is null for Arabic forms
    const isArabic = ocrJson.language === 'ar'
    let expensesDraft = expenseRowsForMap.map((e: any, idx: number) => {
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

    logF4Section('AFTER INITIAL MAP — expensesDraft (before merge/heuristic passes)')
    expensesDraft.forEach((r: any, idx: number) => {
      console.log(
        `[F4 parse]   draft ${idx + 1}: activity=${previewText(r.expense_activity, 70)} | SDG=${r.expense_amount_sdg ?? 'null'} | USD=${r.expense_amount ?? 'null'}`
      )
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
    // DISABLED: This heuristic was too aggressive and merged legitimate expense rows
    // that happened to have short activity names (e.g., Arabic text with 1-5 characters).
    // The Gemini model correctly extracts individual rows; trust its output.
    // If continuation lines are an issue in the future, implement a more conservative
    // approach that checks for both short text AND missing amounts.
    try {
      // No-op: trust the model's row extraction
      // Original logic removed to prevent over-merging
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

    const draftExpenseSumSdg = expensesDraft.reduce(
      (s: number, r: any) => s + (Number(r.expense_amount_sdg) || 0),
      0
    )
    const draftExpenseSumUsd = expensesDraft.reduce(
      (s: number, r: any) => s + (Number(r.expense_amount) || 0),
      0
    )
    const A = summaryDraft.total_expenses
    const sumVsA =
      A != null && A > 0
        ? {
            lineA_SDG: A,
            sumExpenseRows_SDG: draftExpenseSumSdg,
            delta: draftExpenseSumSdg - A,
            pctOff: `${(((draftExpenseSumSdg - A) / A) * 100).toFixed(2)}%`,
          }
        : null

    logF4Section('FINAL — Draft rows after all pipeline heuristics')
    console.log('[F4 parse] expense rows:', expensesDraft.length, '| model had:', modelRows.length, '| used fallback:', Boolean(fallbackExpenseRows.length))
    expensesDraft.forEach((r: any, idx: number) => {
      console.log(
        `[F4 parse]   final ${idx + 1}: activity=${previewText(r.expense_activity, 70)} | SDG=${r.expense_amount_sdg ?? 'null'} | USD=${r.expense_amount ?? 'null'}`
      )
    })

    logF4Section('COMPARE — Line A vs sum of expense rows (both SDG)')
    console.log('[F4 parse]', sumVsA ?? 'total_expenses null — skip compare')

    logF4Section('SUMMARY OBJECT — What goes to the browser (remainder SDG is report or route formula; USD fields filled in UI)')
    console.log('[F4 parse] report_date:', summaryDraft.report_date)
    console.log('[F4 parse] totals SDG:', {
      total_expenses_lineA: summaryDraft.total_expenses,
      total_grant_lineB_from_report: summaryDraft.total_grant,
      total_other_sources_C: summaryDraft.total_other_sources,
      remainder_D_or_route: summaryDraft.remainder,
      remainder_note: remainderFilledByRoute ? 'filled by route A-B+C when D missing' : 'from parsed line D or unchanged',
    })
    console.log('[F4 parse] narratives:', {
      excess_expenses: previewText(summaryDraft.excess_expenses),
      surplus_use: previewText(summaryDraft.surplus_use),
      lessons: previewText(summaryDraft.lessons),
      training: previewText(summaryDraft.training),
    })
    console.log('[F4 parse] sums:', { draftExpenseSumSdg, draftExpenseSumUsd })
    console.log('[F4 parse] timing ms:', { gemini_pipeline: ocrMs, route_total: Date.now() - routeStart })
    console.log('[F4 parse] NOT IN THIS RESPONSE: Total Grant USD, per-row USD, Total Expenses USD, Remainder USD → user exchange rate + project (F1) in UI')

    const sectorsForF4 = await fetchF4SectorsForMatch(supabase)
    expensesDraft = normalizeF4ExpenseActivitiesToSectors(expensesDraft, sectorsForF4)

    return NextResponse.json({ summaryDraft, expensesDraft, aiOutput })
  } catch (e) {
    console.error('[F4 parse] error', {
      message: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
      routeMs: Date.now() - routeStart,
    })
    return NextResponse.json({ error: 'Failed to parse' }, { status: 500 })
  }
}

