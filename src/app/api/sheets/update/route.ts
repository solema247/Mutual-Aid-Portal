import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import path from 'path'

// Initialize Google Sheets
const auth = new google.auth.GoogleAuth({
  keyFile: path.join(process.cwd(), '.gcp', process.env.GCP_CREDENTIALS_JSON || ''),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})

const sheets = google.sheets({ version: 'v4', auth })

export async function POST(req: Request) {
  try {
    const data = await req.json()
    
    // Calculate total USD from expenses
    const totalUSD = data.expenses.reduce((sum: number, exp: any) => sum + (exp.total_cost || 0), 0)

    // Prepare row data for Google Sheets
    const sheetRow = [
      data.grant_id,                          // Serial Number
      data.err_id,                           // ERR CODE
      data.err_name,                         // ERR Name
      'Pending',                             // Project Status
      new Date().toLocaleDateString(),       // F1 Date of Submitted
      '',                                    // Overdue
      '',                                    // F1
      '',                                    // # of Base ERR
      data.donor_name,                       // Project Donor
      '',                                    // Partner
      data.state,                            // State
      '',                                    // Responsible
      '',                                    // Sector (Primary)
      '',                                    // Sector (Secondary)
      data.project_objectives,               // Description of ERRs activity
      data.estimated_beneficiaries,          // Target (Ind.)
      '',                                    // Target (Fam.)
      '',                                    // MOU Signed
      '',                                    // Date Transfer
      totalUSD,                              // USD
      '',                                    // SDG
      '',                                    // Rate
      '',                                    // Start Date (Activity)
      '',                                    // End Date (Activity)
      '',                                    // Activity Duration
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
      '',                                    // Recommendations
      '',                                    // Comments
      ''                                     // Grant Segment
    ]

    // Append to Google Sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Activities!A:AQ',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [sheetRow]
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating Google Sheet:', error)
    return NextResponse.json({ 
      error: 'Failed to update Google Sheet',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 