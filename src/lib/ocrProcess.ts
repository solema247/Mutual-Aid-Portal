import { GoogleGenerativeAI } from '@google/generative-ai'
import mammoth from 'mammoth'
import {
  type FormStructureFormType,
  getFormStructureSystemInstruction,
} from '@/lib/formStructurePrompts'
import {
  generateStructuredFormJson,
  sanitizeModelJsonOutput,
} from '@/lib/geminiStructureOcrText'

// Lazy Gemini model — only instantiated when text extraction is needed
let geminiModelInstance: ReturnType<GoogleGenerativeAI['getGenerativeModel']> | null = null

function getGeminiModel () {
  if (geminiModelInstance) return geminiModelInstance
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY not set. Add GEMINI_API_KEY=<your-key> to .env.local, then restart the dev server.'
    )
  }
  geminiModelInstance = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: 'gemini-2.5-flash' })
  return geminiModelInstance
}

function inferMimeFromName (fileName: string): string {
  const lower = String(fileName || '').toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
  if (lower.match(/\.(png|jpg|jpeg|webp|gif)$/)) {
    const ext = lower.split('.').pop() || 'png'
    return `image/${ext === 'jpg' ? 'jpeg' : ext}`
  }
  return 'application/octet-stream'
}

function detectLanguage(text: string): 'ar' | 'en' {
  const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g
  const englishPattern = /[a-zA-Z]/g
  const arabicCount = (text.match(arabicPattern) || []).length
  const englishCount = (text.match(englishPattern) || []).length
  return arabicCount > englishCount ? 'ar' : 'en'
}

function getLongestArabicParagraph(sourceText: string): string | null {
  if (!sourceText) return null
  const normalized = sourceText.replace(/\r\n/g, '\n')
  const paragraphs = normalized.split(/\n{2,}/)
  let best: string | null = null
  let bestScore = 0
  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed) continue
    const arabicCount = (trimmed.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length
    if (arabicCount > bestScore) { bestScore = arabicCount; best = trimmed }
  }
  return best
}

export interface ProcessMetadata {
  ocr_max_pages?: number
  form_type?: 'F1' | 'F4' | 'F5'
  state_name_ar?: string
  currency?: string
  exchange_rate?: number
}

export async function processFForm(file: File, metadata: ProcessMetadata): Promise<any> {
  // Timeout: race the promise against a timer
  const withTimeout = async <T>(p: Promise<T>, ms: number, label: string): Promise<T> => {
    let timerId: ReturnType<typeof setTimeout>
    const timeoutPromise = new Promise<never>((_, reject) => {
      timerId = setTimeout(() => reject(new Error(`${label} timed out`)), ms)
    })
    try {
      const res = await Promise.race([p, timeoutPromise])
      clearTimeout(timerId!)
      return res
    } catch (e) {
      clearTimeout(timerId!)
      throw e
    }
  }

  // Build text from file: mammoth for .docx; PDF/images via Gemini (Word binary is not supported as inline multimodal input)
  const buffer = Buffer.from(await file.arrayBuffer())
  const mimeType = file.type || inferMimeFromName(file.name || '')
  const isDocx =
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.name?.toLowerCase().endsWith('.docx')

  let text = ''

  if (isDocx) {
    const result = await mammoth.extractRawText({ buffer })
    text = result.value
  } else {
    const base64 = buffer.toString('base64')
    const geminiResult = await withTimeout(
      getGeminiModel().generateContent([
        { inlineData: { mimeType: mimeType, data: base64 } },
        'Extract all text from this document exactly as it appears. Preserve line breaks and table structure. Include both Arabic and English text. Output only the raw extracted text, nothing else.'
      ]),
      90000,
      'Gemini text extraction'
    )
    text = geminiResult.response.text()
  }

  // If no text, return minimal object
  if (!text) {
    // no text
    return {
      date: null,
      state: null,
      locality: null,
      planned_activities: [],
      expenses: [],
      form_currency: metadata?.currency || 'USD',
      exchange_rate: metadata?.exchange_rate || 1,
      language: null,
      raw_ocr: ''
    }
  }

  const formType = String(metadata?.form_type || '').toUpperCase()
  const isF4 = formType === 'F4'
  const isF5 = formType === 'F5'

  const structureKind: FormStructureFormType = isF4 ? 'F4' : isF5 ? 'F5' : 'F1'
  const systemInstruction = getFormStructureSystemInstruction(structureKind, {
    currency: metadata.currency,
    exchange_rate: metadata.exchange_rate,
  })

  const rawJson = await withTimeout(
    generateStructuredFormJson(systemInstruction, text),
    90000,
    'Gemini form structuring'
  )

  let structuredData: any
  try {
    structuredData = JSON.parse(sanitizeModelJsonOutput(rawJson))
  } catch {
    structuredData = { raw_ocr: text }
  }

  if (!structuredData.language) {
    structuredData.language = detectLanguage(text)
  }

  // F1 fallback: ensure objectives present
  const formTypeUpper = formType
  if (formTypeUpper !== 'F4' && formTypeUpper !== 'F5') {
    const objectives = structuredData.project_objectives
    const objectivesStr = typeof objectives === 'string' ? objectives.trim() : ''
    if (!objectivesStr || objectivesStr.length < 40) {
      const fallback = getLongestArabicParagraph(text)
      if (fallback && fallback.length > objectivesStr.length) structuredData.project_objectives = fallback
    }
  }

  // Override state when provided (non-F4)
  if (formTypeUpper !== 'F4' && metadata.state_name_ar) {
    structuredData.state = metadata.state_name_ar
  }

  structuredData.raw_ocr = text
  // complete
  return structuredData
}


