import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import path from 'path'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import OpenAI from 'openai'

// Initialize Google Sheets
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_VISION || '{}'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})

const sheets = google.sheets({ version: 'v4', auth })

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

async function translateToEnglish(text: string): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a translator. Translate the given Arabic text to English. Keep any numbers and special characters as is. Return ONLY the translated text, nothing else."
        },
        {
          role: "user",
          content: text
        }
      ],
      temperature: 0.3
    })

    return completion.choices[0]?.message?.content || text
  } catch (error) {
    console.error('Translation error:', error)
    return text
  }
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const data = await req.json()
    
    console.log('Received data:', {
      emergency_room_id: data.emergency_room_id,
      err_id: data.err_id,
      err_name: data.err_name,
      state_name: data.state_name
    })
    
    // Get English ERR name from emergency_rooms table
    const { data: roomData, error: roomError } = await supabase
      .from('emergency_rooms')
      .select('name, name_ar, err_code')
      .eq('id', data.emergency_room_id)
      .single()

    if (roomError) {
      console.error('Error fetching ERR name:', roomError)
      console.error('emergency_room_id:', data.emergency_room_id)
    } else {
      console.log('Successfully fetched room data:', roomData)
    }

    // Translate necessary fields (excluding state)
    const [
      translatedObjectives,
      translatedTimeframe,
      translatedSupport
    ] = await Promise.all([
      translateToEnglish(data.project_objectives),
      translateToEnglish(data.estimated_timeframe),
      translateToEnglish(data.additional_support)
    ])

    // Calculate total USD from expenses
    const totalUSD = data.expenses.reduce((sum: number, exp: any) => sum + (exp.total_cost || 0), 0)

    console.log('Room data:', roomData)
    console.log('Using ERR name:', roomData?.name)

    // Prepare row data for Google Sheets
    const sheetRow = [
      data.grant_id,                          // Serial Number
      roomData?.err_code || data.err_id,      // ERR CODE
      roomData?.name || '',                   // ERR Name (English)
      'Pending',                             // Project Status
      new Date().toLocaleDateString(),       // F1 Date of Submitted
      '',                                    // Overdue
      '',                                    // F1
      '',                                    // # of Base ERR
      data.donor_name,                       // Project Donor
      '',                                    // Partner
      data.state_name,                       // State (English)
      '',                                    // Responsible
      data.primary_sectors || '',            // Sector (Primary)
      data.secondary_sectors || '',          // Sector (Secondary)
      translatedObjectives,                  // Description of ERRs activity (translated)
      data.estimated_beneficiaries,          // Target (Ind.)
      '',                                    // Target (Fam.)
      '',                                    // MOU Signed
      '',                                    // Date Transfer
      totalUSD,                              // USD
      '',                                    // SDG
      '',                                    // Rate
      '',                                    // Start Date (Activity)
      '',                                    // End Date (Activity)
      translatedTimeframe,                   // Activity Duration (translated)
      '',                                    // F4
      '',                                    // F5
      '',                                    // Date report completed
      '',                                    // Reporting Duration
      '',                                    // Tracker
      '',                                    // Family
      '',                                    // Individuals
      '',                                    // Male >18
      '',                                    // Female >18
      '',                                    // Male <18
      '',                                    // Female <18
      '',                                    // People with special needs
      '',                                    // Lessons learned
      '',                                    // Challenges
      translatedSupport,                     // Additional Support (translated)
      '',                                    // Comments
      ''                                     // Grant Segment
    ]

    // Append to Google Sheet
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Activities!A:AQ',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [sheetRow]
      },
    })

    console.log('Sheet response:', response.data)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating Google Sheet:', error)
    return NextResponse.json({ 
      error: 'Failed to update Google Sheet',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 