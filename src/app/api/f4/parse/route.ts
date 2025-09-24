import { NextResponse } from 'next/server'

// This endpoint should call your existing OCR/AI pipeline (Google Vision + OpenAI) to structure the F4
// For now, we return a minimal stub shape expected by the UI modal

export async function POST(req: Request) {
  try {
    const { project_id, file_key_temp } = await req.json()
    if (!project_id || !file_key_temp) return NextResponse.json({ error: 'project_id and file_key_temp required' }, { status: 400 })

    // TODO: integrate with your OCR/AI adapters.
    // const text = await ocrExtract(file_key_temp)
    // const { summaryDraft, expensesDraft } = await aiStructureF4(text)

    const summaryDraft = {
      report_date: new Date().toISOString().slice(0,10),
      total_grant: 0,
      total_expenses: 0,
      remainder: 0,
      beneficiaries: '',
      lessons: '',
      training: ''
    }
    const expensesDraft: any[] = []

    return NextResponse.json({ summaryDraft, expensesDraft, warnings: ['Parser stub: connect OCR/AI'] })
  } catch (e) {
    console.error('F4 parse error', e)
    return NextResponse.json({ error: 'Failed to parse' }, { status: 500 })
  }
}


