import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { processFForm } from '@/lib/ocrProcess'

function toAsciiDigitsGlobal(s: string): string {
  const map: Record<string, string> = {
    '٠': '0',
    '١': '1',
    '٢': '2',
    '٣': '3',
    '٤': '4',
    '٥': '5',
    '٦': '6',
    '٧': '7',
    '٨': '8',
    '٩': '9'
  }
  return String(s).replace(/[٠-٩]/g, (d) => map[d] ?? d)
}

/**
 * Arabic + English month tokens for F4 **report date** (تاريخ التقرير / Report date).
 * Used for any PDF — not tied to a single sample form.
 */
const F4_REPORT_MONTH_PATTERNS: readonly [RegExp, number][] = [
  [/يناير|كانون\s*الثاني|january/i, 1],
  [/فبراير|فبر\s*ا?ير|شباط|february/i, 2],
  [/مارس|آذار|اذار|march/i, 3],
  [/أبريل|ابريل|نيسان|april/i, 4],
  [/مايو|أيار|ايار|may/i, 5],
  [/يونيو|حزيران|june/i, 6],
  [/يوليو|تموز|july/i, 7],
  [/أغسطس|اغسطس|آب|اب|august/i, 8],
  [/سبتمبر|أيلول|ايلول|september|sep\.?/i, 9],
  [/أكتوبر|اكتوبر|تشرين\s*الأول|تشرين\s*الاول|october|oct\.?/i, 10],
  [/نوفمبر|تشرين\s*الثاني|november|nov\.?/i, 11],
  [/ديسمبر|كانون\s*الأول|december|dec\.?/i, 12]
]

/** Parse one line/fragment: e.g. "5 فبراير 2025م", "2025-02-05", "5/2/2025" */
function parseF4ReportDateSegment(seg: string): string | null {
  const s = seg.trim()
  if (!s) return null

  const iso = s.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const slash = s.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})\b/)
  if (slash) {
    const a = parseInt(slash[1], 10)
    const b = parseInt(slash[2], 10)
    const y = parseInt(slash[3], 10)
    if (a > 12) return `${y}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`
    if (b > 12) return `${y}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`
    return `${y}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`
  }

  let month = 0
  for (const [re, num] of F4_REPORT_MONTH_PATTERNS) {
    if (re.test(s)) {
      month = num
      break
    }
  }

  const yearM = s.match(/(20\d{2})\s*م?/i) || s.match(/\b(20\d{2})\b/)
  const year = yearM ? parseInt(yearM[1], 10) : NaN

  let day = NaN
  const dayFirst = s.match(/^(\d{1,2})\s+/)
  if (dayFirst) day = parseInt(dayFirst[1], 10)
  if (!Number.isFinite(day) || day < 1 || day > 31) {
    const anyDay = s.match(/\b(\d{1,2})\b/)
    if (anyDay) day = parseInt(anyDay[1], 10)
  }

  if (!month || !Number.isFinite(year) || year < 2000 || year > 2100) return null
  if (!Number.isFinite(day) || day < 1 || day > 31) return null

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * When OCR breaks "تاريخ التقرير" across lines, scan the header region for **any**
 * supported day + month + year pattern (all months — not one-off / screenshot-specific).
 */
function parseF4ReportDateFromFragmentedHeader(t: string): string | null {
  const head = t.slice(0, 10000)
  if (!/F4|التقرير|Financial\s*Report|تقرير\s*مال|استمارات/i.test(head)) return null

  for (const [re, monthNum] of F4_REPORT_MONTH_PATTERNS) {
    const combined = new RegExp(
      `(\\d{1,2})[\\s\\t,\\.]+(?:${re.source})[\\s\\t,\\.]+(20\\d{2})\\s*م?`,
      'i'
    )
    const m = head.match(combined)
    if (m) {
      const d = parseInt(m[1], 10)
      const y = parseInt(m[2], 10)
      if (d >= 1 && d <= 31 && y >= 2000 && y < 2100) {
        return `${y}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      }
    }
  }

  const idx = head.search(/تاريخ\s*التقرير|Report\s*date/i)
  if (idx >= 0) {
    const win = head.slice(Math.max(0, idx - 40), Math.min(head.length, idx + 280))
    const p = parseF4ReportDateSegment(win)
    if (p) return p
  }

  return null
}

/**
 * First-table report date (تاريخ التقرير / Report date) from OCR — standard for all F4 PDFs.
 */
function parseF4ReportDateFromOcr(raw: string): string | null {
  const t = toAsciiDigitsGlobal(raw)
  const arLine = t.match(/تاريخ\s*التقرير\s*[:：]?\s*([^\n\r]+)/i)
  const enLine = t.match(/Report\s*date\s*[:：]?\s*([^\n\r]+)/i)
  const seg = (arLine?.[1] || enLine?.[1] || '').trim()
  if (seg) {
    const p = parseF4ReportDateSegment(seg)
    if (p) return p
  }
  return parseF4ReportDateFromFragmentedHeader(t)
}

/** SDG per 1 USD from OCR footer / exchange line */
function extractFxSdgPerUsd(
  raw: string,
  toAsciiDigits: (s: any) => string,
  toNumLoose: (s: any) => number | null
): number | null {
  const r = toAsciiDigits(raw)
  const tries: RegExp[] = [
    /سعر\s*الصرف[^\d\n]{0,50}(\d{1,3}(?:[،,\s]\d{3})*(?:\.\d+)?)/i,
    /1\s*USD\s*=\s*(\d{1,3}(?:[،,\s]\d{3})*(?:\.\d+)?)/i,
    /1\s*دولار[^\d\n]{0,30}(\d{1,3}(?:[،,\s]\d{3})+(?:\.\d+)?)/i,
    /USD\s*[=]\s*(\d{1,3}(?:[،,\s]\d{3})+(?:\.\d+)?)\s*SDG/i,
    /Exchange\s*rate[^\d\n]{0,40}(\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?)/i
  ]
  for (const re of tries) {
    const m = r.match(re)
    if (m?.[1]) {
      const v = toNumLoose(m[1])
      if (v != null && v >= 1 && v <= 1e6) return v
    }
  }
  return null
}

/** Numbered receipt lines: "1. 2002090417" (common on Arabic/English F4 bank refs) */
function extractNumberedReceiptsFromText(t: string): string[] {
  const out: string[] = []
  const re = /(?:^|\n)\s*\d+\.\s*(\d{8,14})\b/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(t)) !== null) {
    const d = m[1]
    if (d.length >= 8 && d.length <= 14) out.push(d)
  }
  return out
}

/** Assign receipts in document order to rows that are still missing receipt_no */
function assignReceiptsByGlobalOrder(
  raw: string,
  expensesDraft: any[],
  toAsciiDigits: (s: any) => string
): void {
  const cut =
    raw.split(/\n\s*A\.\s*/i)[0] ||
    raw.split(/إجمال[يى]\s*النفقات/i)[0] ||
    raw.split(/\nTotal\s+expenses/i)[0] ||
    raw
  const t = toAsciiDigits(cut)
  const receipts = extractNumberedReceiptsFromText(t)
  if (receipts.length === 0) return
  let k = 0
  for (const row of expensesDraft) {
    if ((row.receipt_no || '').trim()) continue
    if (k >= receipts.length) break
    row.receipt_no = receipts[k++]
  }
}

function enrichF4RowFromOcr(
  row: any,
  raw: string,
  toAsciiDigits: (s: any) => string,
  rowIndex: number
): any {
  const act = String(row.expense_activity || '').trim()
  if (!act) return row
  const lines = raw.split(/\n+/)
  const words = act.split(/\s+/).filter((w) => w.length >= 2)
  let idx = -1
  for (const needle of [act, ...words.slice(0, 4)]) {
    if (!needle) continue
    idx = lines.findIndex((l) => l.includes(needle))
    if (idx >= 0) break
  }
  if (idx < 0 && words[0] && words[0].length >= 4) {
    const low = words[0].toLowerCase()
    idx = lines.findIndex((l) => l.toLowerCase().includes(low))
  }
  if (idx < 0) return row

  const start = Math.max(0, idx - 4)
  const end = Math.min(lines.length, idx + 30)
  const chunk = lines.slice(start, end).join('\n')
  const c = toAsciiDigits(chunk)

  if (!(row.payment_date || '').trim()) {
    const iso =
      c.match(/\b(20\d{2})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\b/) ||
      c.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})\b/) ||
      c.match(/\b(\d{1,2})[./](\d{1,2})[./](20\d{2})\b/)
    if (iso) {
      if (String(iso[1]).length === 4) {
        const y = iso[1]
        const mo = String(iso[2]).padStart(2, '0')
        const d = String(iso[3]).padStart(2, '0')
        row.payment_date = `${y}-${mo}-${d}`
      } else {
        const mo = String(iso[1]).padStart(2, '0')
        const d = String(iso[2]).padStart(2, '0')
        const y = iso[3]
        row.payment_date = `${y}-${mo}-${d}`
      }
    }
    if (!(row.payment_date || '').trim()) {
      const lbl = c.match(
        /(?:Payment\s*date|Date\s*(?:of\s*)?payment|Date\s*paid|تاريخ\s*الدفع)[\s:：]*(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})/i
      )
      if (lbl) {
        let y = lbl[3]
        if (y.length === 2) y = `20${y}`
        row.payment_date = `${y}-${String(lbl[1]).padStart(2, '0')}-${String(lbl[2]).padStart(2, '0')}`
      }
    }
  }

  if (!(row.payment_method || '').trim()) {
    if (/تحويل\s*بنك|حوالة\s*بنكية|wire|swift|bank\s*transfer/i.test(c)) row.payment_method = 'Bank Transfer'
    else if (/نقدي|\bcash\b(?!\s*flow)/i.test(c)) row.payment_method = 'Cash'
    else if (/شيك|cheque|check(?!\s*out)/i.test(c)) row.payment_method = 'Cheque'
    else if (/تطبيق\s*بنك|bank\s*app|mobile\s*(?:bank|money)|m-?pesa|in-?app|digital\s*wallet/i.test(c))
      row.payment_method = 'Bank Transfer'
    else if (/(?:^|\n)\s*(?:كاش|Cash)\s*[\/|]\s*(?:تطبيق|App|Bank)/i.test(c)) row.payment_method = 'Cash'
  }

  if (!(row.receipt_no || '').trim()) {
    const numbered = extractNumberedReceiptsFromText(c)
    if (numbered.length > 0) {
      row.receipt_no = numbered[Math.min(rowIndex, numbered.length - 1)]
    }
    if (!(row.receipt_no || '').trim()) {
      const m = c.match(
        /(?:Receipt|Invoice|Ref(?:erence)?|Transaction)\s*[#:No.\s]*(\d{8,14})\b/i
      )
      if (m) row.receipt_no = m[1]
    }
    if (!(row.receipt_no || '').trim()) {
      const loose = c.match(/\b(\d{10,12})\b/)
      if (loose && !/^\d{1,3}(?:\.\d{3})+$/.test(loose[1])) row.receipt_no = loose[1]
    }
  }

  if (!(row.seller || '').trim()) {
    const patterns: RegExp[] = [
      /(?:Seller|Vendor|Supplier|Payee|Beneficiary|Recipient|Received\s*by|Paid\s*to)[\s:：\-]+([^\n]{2,120})/i,
      /(?:المورد|البائع|المستلم|الجهة)[\/\s:：]+([^\n\d][^\n]{2,100})/u
    ]
    for (const re of patterns) {
      const m = chunk.match(re)
      if (m?.[1]) {
        row.seller = m[1]
          .trim()
          .split(/\s{2,}|\t|\n/)[0]
          .replace(/[،,.]+$/g, '')
          .trim()
        if (row.seller.length >= 2) break
      }
    }
  }

  if (!(row.expense_description || '').trim()) {
    const receipt = String(row.receipt_no || '').trim()
    if (receipt && chunk.includes(receipt)) {
      const parts = chunk.split(receipt)
      const before = parts[0] || ''
      const tail = before.replace(act, ' ').replace(/\d{1,3}(?:[،,\s]\d{3})+/g, ' ').trim()
      if (tail.length > 2 && tail.length < 300) row.expense_description = tail.replace(/\s+/g, ' ')
    }
    if (!(row.expense_description || '').trim()) {
      row.expense_description = act
    }
  }

  return row
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const routeStart = Date.now()
    const { project_id, file_key_temp } = await request.json()
    if (!project_id || !file_key_temp) return NextResponse.json({ error: 'project_id and file_key_temp required' }, { status: 400 })

    const lowerKey = String(file_key_temp || '').toLowerCase()
    const ext = lowerKey.split('.').pop() || 'pdf'

    // Word (.docx): store and allow manual entry; auto-parse when Word→F4 converter is added (format TBD)
    if (ext === 'docx') {
      const summaryDraft = {
        report_date: null,
        total_expenses: null,
        total_grant: null,
        excess_expenses: null,
        surplus_use: null,
        lessons: null,
        training: null,
        total_other_sources: null,
        language: null,
        remainder: null,
        raw_ocr: null,
        beneficiaries: null,
        project_name: null,
        project_objectives: null,
        is_draft: true
      }
      return NextResponse.json({
        summaryDraft,
        expensesDraft: [],
        word_upload_not_parsed: true,
        aiOutput: { message: 'Word uploads are stored but not auto-parsed yet. Enter data manually or attach for reference.' }
      })
    }

    // Get a signed URL to download the file content (public bucket not guaranteed)
    const { data: signed, error: signedErr } = await (supabase as any).storage.from('images').createSignedUrl(file_key_temp, 60)
    if (signedErr || !signed?.signedUrl) throw new Error('Failed to sign temp file')

    // Fetch the file as blob
    const fileResp = await fetch(signed.signedUrl)
    if (!fileResp.ok) throw new Error(`Failed to fetch file (${fileResp.status}). Check storage access.`)
    const blob = await fileResp.blob()
    if (!blob || blob.size === 0) throw new Error('File is empty or could not be read')

    // Create a File object preserving type and filename for OCR
    const respContentType = fileResp.headers.get('content-type') || ''
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
    const headerReportDateIso = parseF4ReportDateFromOcr(raw)
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
      report_date: headerReportDateIso || ocrJson.date || null,
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
          expense_amount_sdg = e.amount_value
          source = 'AI-SDG-default'
        } else {
          expense_amount_sdg = e.amount_value
          source = 'AI-default'
        }
      } else {
        expense_amount_sdg = e.currency === 'SDG' ? (e.total_cost_sdg ?? null) : null
        expense_amount = e.currency === 'USD' ? (e.amount_value ?? e.total_cost_usd ?? null) : (e.total_cost_usd ?? null)
        source = 'legacy'
      }
      // Use amount_usd from AI when present (e.g. dual-currency forms)
      if (e.amount_usd != null && expense_amount == null) expense_amount = e.amount_usd

      // Prefer non-null for text fields: use empty string so UI/DB don't show null
      const safeStr = (v: any) => (v != null && String(v).trim() !== '' ? String(v).trim() : '')
      return {
        expense_activity: safeStr(e.activity),
        expense_description: safeStr(e.description),
        expense_amount_sdg,
        expense_amount: expense_amount ?? e.amount_usd ?? null,
        payment_date: safeStr(e.payment_date),
        payment_method: safeStr(e.payment_method),
        receipt_no: safeStr(e.receipt_no),
        seller: safeStr(e.seller),
        language: ocrJson.language || null,
        is_draft: true
      }
    })

    // CRITICAL: Check for totals assigned as expense amounts (before any other processing)
    // Skip when only one row has an amount — likely a single-line expense that legitimately matches total
    try {
      const A = num(totalExpensesStr)
      if (A != null && A > 0) {
        const rowsWithAmount = expensesDraft.filter((r: any) => {
          const v = Number(r.expense_amount_sdg ?? r.expense_amount) || 0
          return v > 0
        })
        if (rowsWithAmount.length > 1) {
          expensesDraft.forEach((r: any) => {
            const v = Number(r.expense_amount_sdg ?? r.expense_amount) || 0
            if (v > 0 && Math.abs(v - A) < A * 0.01) {
              r.expense_amount_sdg = null
              r.expense_amount = null
            }
          })
        }
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

    try {
      expensesDraft = expensesDraft.map((row: any, i: number) =>
        enrichF4RowFromOcr(row, raw, toAsciiDigits, i)
      )
      assignReceiptsByGlobalOrder(raw, expensesDraft, toAsciiDigits)
    } catch {
      // ignore
    }

    // Validate sum vs total_expenses_text if present; if far off, try dropping any values that look like totals
    try {
      const A = num(totalExpensesStr)
      if (A != null && A > 0) {
        const rowsWithAmt = expensesDraft.filter((r: any) => {
          const v = Number(r.expense_amount_sdg ?? r.expense_amount) || 0
          return v > 0
        })
        if (rowsWithAmt.length > 1) {
          expensesDraft.forEach((r: any) => {
            const v = Number(r.expense_amount_sdg ?? r.expense_amount) || 0
            if (v > 0 && Math.abs(v - A) < A * 0.01) {
              r.expense_amount_sdg = null
              r.expense_amount = null
            }
          })
        }

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

    const sdgPerUsd = extractFxSdgPerUsd(raw, toAsciiDigits, toNumLoose)
    if (sdgPerUsd != null && sdgPerUsd > 0) {
      expensesDraft = expensesDraft.map((row: any) => {
        const sdg = Number(row.expense_amount_sdg)
        if (Number.isFinite(sdg) && sdg > 0 && (row.expense_amount == null || row.expense_amount === 0)) {
          row.expense_amount = +(sdg / sdgPerUsd).toFixed(2)
        }
        return row
      })
    }

    expensesDraft = expensesDraft.map((row: any) => {
      const rowPaymentDate = (row.payment_date || '').trim()
      return {
        ...row,
        payment_method: (row.payment_method || '').trim() || 'Bank Transfer',
        // Use header report date ONLY when this row has no activity-level payment date
        // (from AI or enrichF4RowFromOcr — Arabic تاريخ الدفع / English payment date columns).
        payment_date: rowPaymentDate || headerReportDateIso || ''
      }
    })

    // Auto-populate empty expense activity/description from F1 planned_activities (portal projects only)
    const isHistorical = String(project_id).startsWith('historical_')
    if (!isHistorical && project_id) {
      try {
        const { data: proj } = await supabase
          .from('err_projects')
          .select('planned_activities')
          .eq('id', project_id)
          .single()
        if (proj?.planned_activities) {
          const raw = typeof proj.planned_activities === 'string' ? JSON.parse(proj.planned_activities || '[]') : proj.planned_activities
          const plannedArr = Array.isArray(raw) ? raw : []
          const flatActivities: { activity: string; description: string }[] = []
          for (const pa of plannedArr) {
            const activity = pa?.activity ?? pa?.activity_name ?? (Array.isArray(pa?.expenses) ? pa.expenses[0]?.description : undefined) ?? ''
            const description = pa?.description ?? (Array.isArray(pa?.expenses) && pa.expenses[0] ? (pa.expenses[0].description || pa.expenses[0].item) : null) ?? ''
            flatActivities.push({ activity: String(activity || '').trim(), description: String(description || '').trim() })
          }
          expensesDraft = expensesDraft.map((row: any, idx: number) => {
            const fill = flatActivities[idx]
            if (!fill) return row
            if (!(row.expense_activity || '').trim() && fill.activity) row.expense_activity = fill.activity
            if (!(row.expense_description || '').trim() && fill.description) row.expense_description = fill.description
            return row
          })
        }
      } catch (_) { /* ignore */ }
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


    return NextResponse.json({ summaryDraft, expensesDraft, aiOutput })
  } catch (e) {
    console.error('F4 parse error', e)
    const message = e instanceof Error ? e.message : 'Failed to parse'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

