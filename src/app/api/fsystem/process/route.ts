import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import mammoth from 'mammoth'
import {
  type FormStructureFormType,
  getFormStructureSystemInstruction,
} from '@/lib/formStructurePrompts'
import {
  generateStructuredFormJson,
  repairMalformedJsonWithGemini,
  sanitizeModelJsonOutput,
} from '@/lib/geminiStructureOcrText'
import { requirePermission } from '@/lib/requirePermission'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Lazy Gemini model for text extraction
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

// Add types for the expense object
interface Expense {
  description: string | null;
  location: string | null;
  quantity: number | null;
  unit_cost: number | null;
  total_cost: number | null;
}

// Validate extracted data
function validateExtractedData(data: any) {
  // Ensure planned_activities is an array and clean up items
  if (data.planned_activities) {
    if (!Array.isArray(data.planned_activities)) {
      data.planned_activities = typeof data.planned_activities === 'string' 
        ? [data.planned_activities] 
        : []
    }
    // Clean up each activity
    data.planned_activities = data.planned_activities
      .map((activity: unknown) => {
        if (typeof activity !== 'string') return null
        return activity
          .trim()
          .replace(/^[-●•\s\d\(\)]+/, '') // Remove leading bullets, numbers, parentheses
          .replace(/[\(\)]+$/, '')        // Remove trailing parentheses
          .trim()
      })
      .filter(Boolean) // Remove null/empty items
  } else {
    data.planned_activities = []
  }

  // Validate and normalize expenses array
  if (data.expenses && Array.isArray(data.expenses)) {
    data.expenses = data.expenses
      .map((expense: unknown) => {
        if (!expense || typeof expense !== 'object') return null
        const exp = expense as Record<string, unknown>

        // Clean up description and location
        const description = typeof exp.description === 'string' 
          ? exp.description.trim() 
          : null
        const location = typeof exp.location === 'string'
          ? exp.location
              .trim()
              .replace(/[\\\/]+/g, ' ') // Normalize slashes to spaces
              .replace(/\s+/g, ' ')     // Normalize spaces
          : null

        // Parse numeric values
        const quantity = exp.quantity ? parseInt(String(exp.quantity)) : null
        const unit_cost = exp.unit_cost ? parseFloat(String(exp.unit_cost)) : null
        const total_cost = exp.total_cost ? parseFloat(String(exp.total_cost)) : null

        // Validate and compute missing values if possible
        const validatedExpense: Expense = {
          description,
          location,
          quantity: isNaN(quantity as number) ? null : quantity,
          unit_cost: isNaN(unit_cost as number) ? null : unit_cost,
          total_cost: isNaN(total_cost as number) ? null : total_cost
        }

        // Try to compute missing values
        if (validatedExpense.quantity !== null && validatedExpense.unit_cost !== null && validatedExpense.total_cost === null) {
          validatedExpense.total_cost = validatedExpense.quantity * validatedExpense.unit_cost
        } else if (validatedExpense.total_cost !== null && validatedExpense.unit_cost !== null && validatedExpense.quantity === null) {
          const computed = validatedExpense.total_cost / validatedExpense.unit_cost
          if (Math.abs(Math.round(computed) - computed) < 0.02) { // Within 2% of an integer
            validatedExpense.quantity = Math.round(computed)
          }
        } else if (validatedExpense.total_cost !== null && validatedExpense.quantity !== null && validatedExpense.unit_cost === null) {
          validatedExpense.unit_cost = validatedExpense.total_cost / validatedExpense.quantity
        }

        return validatedExpense
      })
      .filter((expense: Expense | null): expense is Expense => expense !== null) // Type guard to remove null items
  } else {
    data.expenses = []
  }

  return data
}

// Find the longest Arabic paragraph to use as a fallback for verbatim text fields
function getLongestArabicParagraph(sourceText: string): string | null {
  if (!sourceText) return null
  const normalized = sourceText.replace(/\r\n/g, '\n')
  const paragraphs = normalized.split(/\n{2,}/)
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/

  let best: string | null = null
  let bestScore = 0

  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed) continue
    // Score by number of Arabic characters to bias toward Arabic blocks
    const arabicCount = (trimmed.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length
    if (arabicCount === 0) continue
    const score = arabicCount
    if (score > bestScore) {
      bestScore = score
      best = trimmed
    }
  }

  return best
}

// Add language detection function after the validateExtractedData function
function detectLanguage(text: string): 'ar' | 'en' {
  // Count Arabic and English characters
  const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
  const englishPattern = /[a-zA-Z]/g;
  
  const arabicCount = (text.match(arabicPattern) || []).length;
  const englishCount = (text.match(englishPattern) || []).length;
  
  return arabicCount > englishCount ? 'ar' : 'en';
}

// Infer MIME type from storage key (extension)
function mimeFromKey(fileKey: string): string {
  const lower = String(fileKey || '').toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.doc')) return 'application/msword'
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (lower.match(/\.(png|jpg|jpeg|webp|gif)$/)) {
    const ext = lower.split('.').pop() || 'png'
    return `image/${ext === 'jpg' ? 'jpeg' : ext}`
  }
  return 'application/octet-stream'
}

export async function POST(req: Request) {
  const auth = await requirePermission('f1_upload')
  if (auth instanceof NextResponse) return auth
  try {
    const start = Date.now()
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const fileKey = formData.get('file_key') as string | null
    const metadataStr = formData.get('metadata') as string
    console.log('Received metadata string:', metadataStr)

    if (!metadataStr) {
      return NextResponse.json({ error: 'metadata required', details: 'Missing metadata' }, { status: 400 })
    }
    const formMetadata = JSON.parse(metadataStr)
    console.log('Parsed form metadata:', formMetadata)

    let buffer: Buffer
    let mimeType: string

    if (fileKey && fileKey.trim()) {
      // Fetch file from Supabase (avoids 4.5MB request body limit)
      const supabase = getSupabaseRouteClient()
      const { data: blob, error: downloadError } = await supabase.storage.from('images').download(fileKey.trim())
      if (downloadError || !blob) {
        console.error('Supabase download error:', downloadError)
        return NextResponse.json(
          { error: 'File not found', details: downloadError?.message || 'Failed to download file from storage. Please upload again.' },
          { status: 400 }
        )
      }
      buffer = Buffer.from(await blob.arrayBuffer())
      mimeType = mimeFromKey(fileKey)
      console.log('Processing file from storage:', fileKey, 'Type:', mimeType, 'Size:', buffer.length)
    } else if (file && file.size > 0) {
      buffer = Buffer.from(await file.arrayBuffer())
      mimeType = file.type || mimeFromKey(file.name)
      console.log('Processing file from request:', file.name, 'Type:', mimeType, 'Size:', file.size)
    } else {
      return NextResponse.json({ error: 'No file provided', details: 'Provide either file (formData) or file_key (Supabase storage path).' }, { status: 400 })
    }

    let text = ''
    const isDocx = mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      (fileKey || '').toLowerCase().endsWith('.docx')

    if (isDocx) {
      console.log('Extracting text from .docx with mammoth...')
      const result = await mammoth.extractRawText({ buffer })
      text = result.value
    } else {
      const base64 = buffer.toString('base64')
      console.log('Extracting text with Gemini...')
      try {
        const geminiResult = await getGeminiModel().generateContent([
          { inlineData: { mimeType: mimeType, data: base64 } },
          'Extract all text from this document exactly as it appears. Preserve line breaks and table structure. Include both Arabic and English text. Output only the raw extracted text, nothing else.'
        ])
        text = geminiResult.response.text()
      } catch (geminiError: any) {
        console.error('Gemini extraction error:', geminiError)
        throw new Error(`Gemini text extraction error: ${geminiError.message || 'Unknown error occurred'}`)
      }
    }

    // extracted text

    // Log the first and last 100 characters to check text boundaries
    if (text.length > 0) {
      console.log('Text start:', text.substring(0, 100))
      console.log('Text end:', text.substring(Math.max(0, text.length - 100)))
    }

    if (!text) {
      // Gracefully handle empty OCR: return minimal structure
      return NextResponse.json({
        date: null,
        state: null,
        locality: null,
        project_objectives: null,
        intended_beneficiaries: null,
        estimated_beneficiaries: null,
        estimated_timeframe: null,
        additional_support: null,
        banking_details: null,
        program_officer_name: null,
        program_officer_phone: null,
        reporting_officer_name: null,
        reporting_officer_phone: null,
        finance_officer_name: null,
        finance_officer_phone: null,
        planned_activities: [],
        expenses: [],
        form_currency: formMetadata?.currency || 'USD',
        exchange_rate: formMetadata?.exchange_rate || 1,
        language: null,
        raw_ocr: ''
      })
    }

    // Decide prompt based on form type
    const formType = String(formMetadata?.form_type || '').toUpperCase()
    const isF4 = formType === 'F4'
    const isF5 = formType === 'F5'

    const structureKind: FormStructureFormType = isF4 ? 'F4' : isF5 ? 'F5' : 'F1'
    const systemInstruction = getFormStructureSystemInstruction(structureKind, {
      currency: formMetadata.currency,
      exchange_rate: formMetadata.exchange_rate,
    })

    const rawJson = await generateStructuredFormJson(systemInstruction, text)

    console.log('Raw Gemini structure response:', rawJson)

    const sanitizedContent = sanitizeModelJsonOutput(rawJson)


    try {
      const structuredData = JSON.parse(sanitizedContent)
      
      // Log structured JSON for F4 debugging
      if (isF4) {
        const contentPreview = rawJson.substring(0, 1000)
        console.log('[F4 Gemini] Response length:', rawJson.length)
        console.log('[F4 Gemini] Response preview:', contentPreview)
        if (Array.isArray(structuredData.expenses)) {
          console.log('[F4 Gemini] Parsed expenses count:', structuredData.expenses.length)
          console.log('[F4 Gemini] Expenses:', JSON.stringify(structuredData.expenses, null, 2))
          console.log('[F4 Gemini] Total expenses text:', structuredData.total_expenses_text)
        }
      }
      
      // Add language detection if missing
      if (!structuredData.language) {
        const detectedLanguage = detectLanguage(text)
        structuredData.language = detectedLanguage
      }

      if (!isF4 && !isF5) {
        // F1 behavior only
        const objectives: unknown = structuredData.project_objectives
        const objectivesStr = typeof objectives === 'string' ? objectives.trim() : ''
        if (!objectivesStr || objectivesStr.length < 40) {
          const fallback = getLongestArabicParagraph(text)
          if (fallback && fallback.length > objectivesStr.length) {
            structuredData.project_objectives = fallback
          }
        }
      }

      // Override the state and locality from OCR with the selected values from form metadata
      if (!isF4 && formMetadata.state_name) {
        console.log('Overriding OCR state with selected state:', {
          original: structuredData.state,
          new: formMetadata.state_name
        })
        structuredData.state = formMetadata.state_name
        
        // Override locality if available from database
        if (formMetadata.locality) {
          structuredData.locality = formMetadata.locality
        }
      }
      
      // If F5, normalize reach rows and parse demographics from raw OCR
      if (isF5) {
        function toAsciiDigits(s: any) {
          if (s == null) return s
          const map: Record<string,string> = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9' }
          return String(s).replace(/[٠-٩]/g, d => (map as any)[d] ?? d).replace(/[,،]/g,'').trim()
        }
        function toNum(n: any): number | null {
          const v = toAsciiDigits(n)
          if (!v) return null
          const f = parseInt(v, 10)
          return Number.isFinite(f) ? f : null
        }
        function normalizeDate(v: any): string | null {
          const s = toAsciiDigits(v)
          if (!s) return null
          if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
          if (/^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(s)) return s
          return null
        }
        function normalizeReachRow(row: any) {
          const r: any = { ...row }
          // Map alternates to expected keys
          if (r.individuals != null && r.individual_count == null) r.individual_count = r.individuals
          if (r.families != null && r.household_count == null) r.household_count = r.families
          if (r.start != null && r.start_date == null) r.start_date = r.start
          if (r.end != null && r.end_date == null) r.end_date = r.end

          r.activity_name = r.activity_name ?? r.name ?? null
          r.activity_goal = r.activity_goal ?? r.details ?? null
          r.location = r.location ?? r.place ?? null

          r.start_date = normalizeDate(r.start_date)
          r.end_date = normalizeDate(r.end_date)

          r.individual_count = toNum(r.individual_count)
          r.household_count = toNum(r.household_count)
          r.male_count = toNum(r.male_count)
          r.female_count = toNum(r.female_count)
          r.under18_male = toNum(r.under18_male)
          r.under18_female = toNum(r.under18_female)

          return {
            activity_name: r.activity_name || null,
            activity_goal: r.activity_goal || null,
            location: r.location || null,
            start_date: r.start_date || null,
            end_date: r.end_date || null,
            individual_count: r.individual_count ?? null,
            household_count: r.household_count ?? null,
            male_count: r.male_count ?? null,
            female_count: r.female_count ?? null,
            under18_male: r.under18_male ?? null,
            under18_female: r.under18_female ?? null
          }
        }
        function parseDemographics(sourceText: string) {
          const t = (sourceText || '').replace(/\s+/g,' ').trim()
          
          // Look for the demographics section and the activities list
          const demographicsMatch = t.match(/الحصر\s*الإضافي\s*للمستفيدين[\s\S]*?(?=التأثيرات|$)/i)
          if (!demographicsMatch) {
            return { breakdowns: [] }
          }
          
          const demoSection = demographicsMatch[0]
          
          // Split into lines and clean
          const lines = demoSection.split('\n').map(l => l.trim()).filter(l => l.length > 0)
          
          // First, find all activity names in the main activities section
          const activityNames = Array.isArray(structuredData.reach) 
            ? structuredData.reach.map((r: { activity_name?: string }) => r.activity_name).filter(Boolean)
            : []
          
          // Then find the demographics breakdown section which lists activities again with their numbers
          let inBreakdownSection = false
          let currentActivity = ''
          let numberGroups: number[][] = []
          let currentNumbers: number[] = []
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            
            // Skip header lines
            if (line.includes('الحصر') || line.includes('إسم النشاط') || line.includes('التاريخ') || line.includes('محلية')) {
              continue
            }
            
            // Look for numbers
            const numbers = line.match(/[٠-٩0-9,]+/g)
            if (numbers) {
              // Convert Arabic numerals and clean
              const cleanNums = numbers.map(n => {
                const cleaned = n.replace(/[,،]/g, '')
                return toNum(cleaned) || 0
              })
              currentNumbers.push(...cleanNums)
              continue
            }
            
            // If we have a line that matches one of our activity names
            const matchingActivity = activityNames.find((name: string) => 
              name && line.includes(name.split(' ')[0]) // Match on first word to be more lenient
            )
            
            if (matchingActivity) {
              // If we already have numbers for a previous activity, save them
              if (currentNumbers.length > 0) {
                numberGroups.push(currentNumbers)
              }
              currentActivity = matchingActivity
              currentNumbers = []
              continue
            }
          }
          
          // Don't forget the last group of numbers
          if (currentNumbers.length > 0) {
            numberGroups.push(currentNumbers)
          }
          
          // Now map the activities to their demographic breakdowns
          const breakdowns = activityNames.map((activityName: string, idx: number) => {
            const numbers = numberGroups[idx] || []
            return {
              activity_name: activityName,
              male_count: numbers[0] || 0,
              female_count: numbers[1] || 0,
              under18_male: numbers[2] || 0,
              under18_female: numbers[3] || 0,
              special_needs: numbers[4] || 0
            }
          })
          
          return { breakdowns }
        }
        
        function parseNarrativeSection(sourceText: string) {
          const t = (sourceText || '').replace(/\s+/g,' ').trim()
          
          // Extract narrative sections using markers and question numbers
          const positiveMatch = t.match(/(?:7\s*\.\s*)?(?:أروي\s+)?التغيرات\s*والآثار\s*الإيجابية[^\n]*\n([\s\S]*?)(?=2\s*\.\s*هل|هل\s*توجد|$)/i)
          const negativeMatch = t.match(/(?:2\s*\.\s*)?هل\s*توجد\s*أي\s*نتائج\s*سلبية[^\n]*\n([\s\S]*?)(?=3\s*\.\s*ما|ما\s*الذي|$)/i)
          const unexpectedMatch = t.match(/(?:3\s*\.\s*)?ما\s*الذي\s*لم\s*يحدث[^\n]*\n([\s\S]*?)(?=4\s*\.\s*بناءاً|بناءاً|$)/i)
          const lessonsMatch = t.match(/(?:4\s*\.\s*)?بناءاً\s*على\s*ما\s*تعلمتموه[^\n]*\n([\s\S]*?)(?=5\s*\.\s*ما|ما\s*هي\s*النصائح|$)/i)
          const suggestionsMatch = t.match(/(?:5\s*\.\s*)?ما\s*هي\s*النصائح[^\n]*\n([\s\S]*?)(?=\n\s*$|$)/i)
          
          return {
            positive_changes: positiveMatch?.[1]?.trim() || null,
            negative_results: negativeMatch?.[1]?.trim() || null,
            unexpected_results: unexpectedMatch?.[1]?.trim() || null,
            lessons_learned: lessonsMatch?.[1]?.trim() || null,
            suggestions: suggestionsMatch?.[1]?.trim() || null
          }
        }

        if (Array.isArray(structuredData.reach)) {
          structuredData.reach = structuredData.reach
            .map((r: any) => normalizeReachRow(r))
            .filter((r: any) => r.activity_name)
        }
        
        // Parse demographics and narrative sections
        const demographics = parseDemographics(text)
        const narrative = parseNarrativeSection(text)
        
        // Merge results
        structuredData.demographics = demographics
        
        // Only use regex-parsed narrative as fallback if AI didn't extract them
        if (!structuredData.positive_changes && narrative.positive_changes) {
          structuredData.positive_changes = narrative.positive_changes
        }
        if (!structuredData.negative_results && narrative.negative_results) {
          structuredData.negative_results = narrative.negative_results
        }
        if (!structuredData.unexpected_results && narrative.unexpected_results) {
          structuredData.unexpected_results = narrative.unexpected_results
        }
        if (!structuredData.lessons_learned && narrative.lessons_learned) {
          structuredData.lessons_learned = narrative.lessons_learned
        }
        if (!structuredData.suggestions && narrative.suggestions) {
          structuredData.suggestions = narrative.suggestions
        }
      }

      // Attach raw OCR for transparency/debugging
      structuredData.raw_ocr = text
      
      // validated data
      return NextResponse.json(structuredData)
    } catch (error) {
      console.error('JSON parse error:', error)
      console.error('Sanitized content:', sanitizedContent)

      // Attempt a one-shot repair for F5 JSON
      if (isF5) {
        try {
          const fixedRaw = await repairMalformedJsonWithGemini(sanitizedContent)
          const fixedSan = sanitizeModelJsonOutput(fixedRaw).replace(/^[\s`]+|[\s`]+$/g, '')
          const repaired = JSON.parse(fixedSan)
          if (!repaired.language) repaired.language = detectLanguage(text)
          repaired.raw_ocr = text
          return NextResponse.json(repaired)
        } catch (repairErr) {
          console.warn('F5 repair attempt failed:', repairErr)
        }
      }

      // Fallback for F5: return a minimal valid structure so caller can proceed
      if (isF5) {
        const detectedLanguage = detectLanguage(text)
        return NextResponse.json({
          raw_ocr: text,
          language: detectedLanguage,
          date: null,
          reach: [],
          positive_changes: null,
          negative_results: null,
          unexpected_results: null,
          lessons_learned: null,
          suggestions: null,
          reporting_person: null
        })
      }

      throw new Error(`Failed to parse Gemini structure response: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  } catch (error) {
    console.error('Error processing document:', error)
    return NextResponse.json({ 
      error: 'Error processing document',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 