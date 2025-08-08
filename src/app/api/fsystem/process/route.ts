import { NextResponse } from 'next/server'
import vision from '@google-cloud/vision'
import OpenAI from 'openai'
import path from 'path'

// Initialize Google Vision client
const visionClient = new vision.ImageAnnotatorClient({
  keyFilename: path.join(process.cwd(), '.gcp', 'local-humanitarian-web-chat-d83ac2a11d96.json')
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

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
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
          content: `Extract information from the following text (which may be in English or Arabic) and format it according to these database fields:

- date: Date of the project in YYYY-MM-DD format (convert any date format to this)
- state: State name (keep in original language)
- locality: Locality name (keep in original language)
- project_objectives: Project objectives or goals (keep in original language)
- intended_beneficiaries: Description of who will benefit (keep in original language)
- estimated_beneficiaries: Number of beneficiaries (integer)
- estimated_timeframe: Project duration (keep in original language)
- additional_support: Any additional support mentioned (keep in original language)
- banking_details: Banking information (keep in original language)
- program_officer_name: Name of program officer (keep in original language)
- program_officer_phone: Phone of program officer
- reporting_officer_name: Name of reporting officer (keep in original language)
- reporting_officer_phone: Phone of reporting officer
- finance_officer_name: Name of finance officer (keep in original language)
- finance_officer_phone: Phone of finance officer

For planned activities and expenses, follow these specific rules:

PLANNED ACTIVITIES EXTRACTION:
1. Find the section starting with "الأنشطة المخططة" (Planned Activities).
2. Extract all items that follow until the next major section or table.
3. Clean up each activity:
   - Remove bullet points (●, -, •), numbers, or any other list markers
   - Remove surrounding parentheses and trailing punctuation
   - Keep the text in its original language
4. Return as array of strings in planned_activities field

EXPENSES TABLE EXTRACTION:
1. Locate and parse the expenses/budget table with these Arabic column mappings:
   - المصروفات or البند → description
   - مكان التنفيذ → location
   - الوصف → append to description with " — " separator
   - التكرار or العدد → quantity
   - سعر الوحدة → unit_cost
   - الإجمالي → total_cost

2. For each table row:
   - Match the description text with its corresponding numbers by proximity
   - Join any multi-line descriptions with a single space
   - Convert any Arabic numbers to Western digits
   - Remove currency symbols and formatting (commas, spaces) from numbers
   - Clean location text: normalize slashes and fix merged words
   
3. Validate and compute:
   - If quantity and unit_cost exist but total_cost missing: multiply them
   - If total_cost exists and one other value missing: divide/multiply as appropriate
   - Only compute if result would be within 2% of any provided total
   - Otherwise leave missing values as null

4. Return expenses array with objects in this EXACT format:
   {
     "description": string,  // Include any الوصف text after " — "
     "unit_cost": float | null,
     "quantity": integer | null,
     "total_cost": float | null,
     "location": string | null
   }

Important:
1. The date MUST be in YYYY-MM-DD format
2. Keep all text fields in their original language (Arabic or English)
3. For number fields (estimated_beneficiaries), extract just the number
4. Return the data in JSON format with these exact field names
5. If a field is not found in the text, set it to null`
        },
        {
          role: "user",
          content: text
        }
      ],
      temperature: 0.3  // Keep lower temperature for more focused extraction
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