import { NextResponse } from 'next/server'
import vision from '@google-cloud/vision'
import OpenAI from 'openai'
import path from 'path'

// Initialize Google Vision client
const visionClient = new vision.ImageAnnotatorClient({
  credentials: JSON.parse(process.env.GOOGLE_VISION || '{}')
})

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

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

// Add language detection function after the validateExtractedData function
function detectLanguage(text: string): 'ar' | 'en' {
  // Count Arabic and English characters
  const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
  const englishPattern = /[a-zA-Z]/g;
  
  const arabicCount = (text.match(arabicPattern) || []).length;
  const englishCount = (text.match(englishPattern) || []).length;
  
  return arabicCount > englishCount ? 'ar' : 'en';
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const metadataStr = formData.get('metadata') as string
    console.log('Received metadata string:', metadataStr)
    
    const formMetadata = JSON.parse(metadataStr)
    console.log('Parsed form metadata:', formMetadata)

    if (!file) {
      throw new Error('No file provided')
    }

    console.log('Processing file:', file.name, 'Type:', file.type, 'Size:', file.size)

    // Convert file to base64
    const buffer = Buffer.from(await file.arrayBuffer())
    const base64 = buffer.toString('base64')

    let text = ''
    
    if (file.type === 'application/pdf') {
      console.log('Processing PDF file...')

      // First batch to get total pages (request first 5 pages)
      const [pageInfo] = await visionClient.batchAnnotateFiles({
        requests: [{
          inputConfig: {
            mimeType: 'application/pdf',
            content: base64
          },
          features: [{
            type: 'DOCUMENT_TEXT_DETECTION'
          }],
          imageContext: {
            languageHints: ['ar']
          },
          pages: [1, 2, 3, 4, 5]  // First 5 pages
        }]
      })

      // Get initial text and count of first batch
      let allTexts: string[] = []
      const firstBatchResponses = pageInfo.responses?.[0]?.responses || []
      firstBatchResponses.forEach((response, idx) => {
        const pageText = response?.fullTextAnnotation?.text || ''
        console.log(`Page ${idx + 1} text length:`, pageText.length)
        allTexts.push(pageText)
      })

      // If we got 5 pages, there might be more
      if (firstBatchResponses.length === 5) {
        try {
          // Try next batch
          const [nextBatch] = await visionClient.batchAnnotateFiles({
            requests: [{
              inputConfig: {
                mimeType: 'application/pdf',
                content: base64
              },
              features: [{
                type: 'DOCUMENT_TEXT_DETECTION'
              }],
              imageContext: {
                languageHints: ['ar']
              },
              pages: [6, 7, 8, 9, 10]  // Next 5 pages
            }]
          })

          const nextBatchResponses = nextBatch.responses?.[0]?.responses || []
          nextBatchResponses.forEach((response, idx) => {
            const pageText = response?.fullTextAnnotation?.text || ''
            console.log(`Page ${idx + 6} text length:`, pageText.length)
            allTexts.push(pageText)
          })
        } catch (error) {
          // If error occurs on second batch, just use what we have
          console.log('Note: Could not process beyond page 5, using available pages')
        }
      }

      console.log('Total pages processed:', allTexts.length)

      if (allTexts.length === 0) {
        throw new Error('No text extracted from PDF')
      }

      // Combine all texts with page breaks
      text = allTexts.join('\n\n---PAGE BREAK---\n\n')
    } else {
      console.log('Processing image file...')
      const [result] = await visionClient.documentTextDetection({
        image: { content: base64 },
        imageContext: {
          languageHints: ['ar']  // Help Vision detect Arabic text
        }
      })
      text = result.fullTextAnnotation?.text || ''
    }

    console.log('Extracted text length:', text.length)
    console.log('Raw OCR output:', text)

    // Log the first and last 100 characters to check text boundaries
    if (text.length > 0) {
      console.log('Text start:', text.substring(0, 100))
      console.log('Text end:', text.substring(Math.max(0, text.length - 100)))
    }

    if (!text) {
      throw new Error('No text extracted from document')
    }

    // Process with OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `Extract information from the following text (which may be in English or Arabic):

BASIC INFORMATION:
- date: Date of the project in YYYY-MM-DD format (convert any date format to this)
- state: State name (keep in original language)
- locality: Locality name (keep in original language)
- project_objectives: Project objectives or goals (keep in original language)
- intended_beneficiaries: Description of who will benefit (keep in original language)
- estimated_beneficiaries: Number of beneficiaries (integer)
- estimated_timeframe: Project duration (keep in original language)
- additional_support: Any additional support mentioned (keep in original language)
- banking_details: Banking information (keep in original language)

CONTACT INFORMATION:
- program_officer_name: Name of program officer (keep in original language)
- program_officer_phone: Phone of program officer
- reporting_officer_name: Name of reporting officer (keep in original language)
- reporting_officer_phone: Phone of reporting officer
- finance_officer_name: Name of finance officer (keep in original language)
- finance_officer_phone: Phone of finance officer

ACTIVITIES AND EXPENSES:
1. From section 6 (الأنشطة الرئيسية اللازمة):
   - Each activity row has three columns: العدد, مدة النشاط, مكان التنفيذ
   - ONLY include an activity if ALL THREE columns have values
   - Example row with complete data:
     Activity: المطبخ المشترك/ تموين
     العدد: 100
     مدة النشاط: 7 أيام
     مكان التنفيذ: الدلنج -- حي الواحة
   - This activity should be included because all columns are filled
   - Activities with empty columns should be excluded

2. From section 7 (الميزانية التفصيلية):
   If form is in Arabic (RTL):
   - Look at the leftmost column labeled الإجمالي for total costs
   - Take activity names from rightmost column المصروفات
   - Ignore middle columns (التكرار, سعر الوحدة)

   If form is in English (LTR):
   - Look at the rightmost column labeled Total/الإجمالي
   - Take activity names from leftmost column Expenses/المصروفات
   - Ignore middle columns

   For each row:
   - Only extract rows where الإجمالي has a value (e.g. $3,900, $10, $50)
   - Remove $ symbol from numbers
   - Ignore any numbers that aren't in the الإجمالي column

Example (Arabic form):
الإجمالي: $3,900 | سعر الوحدة: $32.5 | المصروفات: مشتريات طبية
Should extract: { activity: "مشتريات طبية", total_cost: 3900 }

Return all fields in this format:
{
  "date": string | null,
  "state": string | null,
  "locality": string | null,
  "project_objectives": string | null,
  "intended_beneficiaries": string | null,
  "estimated_beneficiaries": number | null,
  "estimated_timeframe": string | null,
  "additional_support": string | null,
  "banking_details": string | null,
  "program_officer_name": string | null,
  "program_officer_phone": string | null,
  "reporting_officer_name": string | null,
  "reporting_officer_phone": string | null,
  "finance_officer_name": string | null,
  "finance_officer_phone": string | null,
  "planned_activities": string[],
  "expenses": Array<{activity: string, total_cost: number}>
}`
        },
        {
          role: "user",
          content: text
        }
      ],
      temperature: 0.1
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      throw new Error('No content in OpenAI response')
    }

    console.log('Raw GPT response:', content)

    // Sanitize the JSON string
    const sanitizedContent = content
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
      .replace(/\\/g, '\\\\')  // Escape backslashes
      .replace(/[\u2028\u2029]/g, ' ')  // Replace line terminators
      .replace(/[^\x20-\x7E\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g, ' ') // Keep only Arabic, English and basic punctuation

    try {
      const structuredData = JSON.parse(sanitizedContent)
      // Add language detection
      const detectedLanguage = detectLanguage(text)
      structuredData.language = detectedLanguage

      // Override the state from OCR with the selected state from form metadata
      if (formMetadata.state_name_ar) {
        console.log('Overriding OCR state with selected state:', {
          original: structuredData.state,
          new: formMetadata.state_name_ar
        })
        structuredData.state = formMetadata.state_name_ar
      }
      
      console.log('Validated data:', structuredData)
      return NextResponse.json(structuredData)
    } catch (error) {
      console.error('JSON parse error:', error)
      console.error('Sanitized content:', sanitizedContent)
      throw new Error(`Failed to parse OpenAI response: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  } catch (error) {
    console.error('Error processing document:', error)
    return NextResponse.json({ 
      error: 'Error processing document',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 