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

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) {
      throw new Error('No file provided')
    }

    console.log('File type:', file.type)
    console.log('File size:', file.size)

    // Convert file to base64
    const buffer = Buffer.from(await file.arrayBuffer())
    const base64 = buffer.toString('base64')

    let requestConfig = {}
    
    if (file.type === 'application/pdf') {
      requestConfig = {
        inputConfig: {
          mimeType: 'application/pdf',
          content: base64
        }
      }
    } else {
      requestConfig = {
        image: { content: base64 }
      }
    }

    // Process with Google Vision
    let text = ''
    
    if (file.type === 'application/pdf') {
      const [result] = await visionClient.batchAnnotateFiles({
        requests: [{
          inputConfig: {
            mimeType: 'application/pdf',
            content: base64
          },
          features: [{
            type: 'DOCUMENT_TEXT_DETECTION'
          }],
          pages: [1, 2, 3, 4, 5] // Process first 5 pages
        }]
      })

      text = result.responses?.[0]?.responses?.[0]?.fullTextAnnotation?.text || ''
      console.log('Extracted text length:', text.length)
    } else {
      const [result] = await visionClient.documentTextDetection({
        image: { content: base64 }
      })
      text = result.fullTextAnnotation?.text || ''
      console.log('Extracted text length:', text.length)
    }

    if (!text) {
      console.error('No text extracted from document')
      throw new Error('No text extracted from document')
    }

    console.log('Text extracted successfully, length:', text.length)

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
          - planned_activities: Array of planned activities (keep in original language)
          - expenses: Array of expenses with amounts

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
      ]
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      throw new Error('No content in OpenAI response')
    }

    const structuredData = JSON.parse(content)
    console.log('Structured data:', structuredData)

    // Validate date format
    if (structuredData.date && !/^\d{4}-\d{2}-\d{2}$/.test(structuredData.date)) {
      throw new Error('Invalid date format in OpenAI response')
    }

    return NextResponse.json(structuredData)
  } catch (error) {
    console.error('Error processing document:', error)
    return NextResponse.json({ 
      error: 'Error processing document',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 