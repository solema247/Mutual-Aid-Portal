/**
 * POST /api/compliance/sync-financial-report
 *
 * Live sync endpoint for the FCDO Financial Report Google Sheet.
 * Reads three sheets and upserts data into Supabase:
 *
 *   1. "Spending Summary"     → err_summary + err_expense (sector aggregates)
 *   2. "Disbursement Overview" → activities_raw_import (transfer + F4 status data)
 *   3. "F4s Report"           → err_expense (individual receipt line items)
 *
 * Called by a Google Apps Script trigger on the Financial Report spreadsheet.
 *
 * Request body (JSON):
 *   { "sheet": "all" | "spending_summary" | "disbursement" | "f4s_report" }
 *   (defaults to "all" if omitted)
 *
 * Auth: Requires a Bearer token matching SYNC_WEBHOOK_SECRET env var,
 *       OR a valid Supabase service role key.
 *
 * Setup:
 *   1. Share the Google Sheet with the service account in GOOGLE_SHEETS (or GOOGLE_VISION_FILE).
 *   2. Set FCDO_FINANCIAL_REPORT_SHEET_ID env var to the spreadsheet ID.
 *   3. Call this endpoint from a Google Apps Script onEdit/onChange trigger.
 */

import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** Service client without generated DB types — matches `createClient(url, key)`. */
type ServiceSupabase = SupabaseClient<any, 'public', any>

// ── Config ────────────────────────────────────────────────────────────────────

const SPREADSHEET_ID =
  process.env.FCDO_FINANCIAL_REPORT_SHEET_ID ||
  '1ZeNFAk-K0ATw5nUZNVquakCWFOWcreMt63zfFQ3x3ec'

const BATCH_SIZE = 100

// ── Google Sheets auth ────────────────────────────────────────────────────────

function getAuth() {
  // Prefer inline JSON (prod), fall back to file path (local dev)
  const credJson = process.env.GOOGLE_SHEETS
  if (credJson) {
    const credentials = JSON.parse(credJson)
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    })
  }

  const credFile = process.env.GOOGLE_VISION_FILE
  if (credFile) {
    return new google.auth.GoogleAuth({
      keyFile: credFile,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    })
  }

  throw new Error('No Google credentials configured. Set GOOGLE_SHEETS or GOOGLE_VISION_FILE.')
}

async function fetchSheet(sheetName: string): Promise<string[][]> {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheetName}'`,
  })
  return (res.data.values || []) as string[][]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(String(v).replace(/,/g, ''))
  return isNaN(n) ? null : n
}

function toDate(v: unknown): string | null {
  if (!v || v === '') return null
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10)
  const parts = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (parts) return `${parts[3]}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString().substring(0, 10)
}

function isSerial(v: unknown): v is string {
  return typeof v === 'string' && v.trim().startsWith('LCC-')
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  return (e as any)?.message || (e as any)?.details || JSON.stringify(e)
}

// ── Spending Summary ──────────────────────────────────────────────────────────

const SECTOR_COLS = [
  { idx: 1, name: 'Protection' },
  { idx: 2, name: 'Shelter & NFIs' },
  { idx: 3, name: 'WASH' },
  { idx: 4, name: 'Food Security' },
  { idx: 5, name: 'Health' },
  { idx: 6, name: 'Support logistic operations' },
  { idx: 7, name: 'Volunteer Support' },
  { idx: 8, name: 'Women & children needs' },
  { idx: 9, name: 'Mental and physical health' },
  { idx: 10, name: 'Education' },
  { idx: 11, name: 'Capacity Building' },
  { idx: 12, name: 'Livelihoods' },
  { idx: 13, name: 'Peacebuilding / Social Cohesion' },
  { idx: 14, name: 'Youth Space' },
  { idx: 15, name: 'Socioeconomic' },
]

async function syncSpendingSummary(
  supabase: ServiceSupabase,
  rows: string[][]
): Promise<{ created: number; skipped: number; errors: number }> {
  // Load lookup maps
  const { data: imports } = await supabase.from('activities_raw_import').select('id, "Serial Number"')
  const serialToImportId = new Map<string, string>()
  for (const r of imports || []) {
    const serial = r['Serial Number']
    const id = r.id
    if (serial != null && serial !== '' && id != null)
      serialToImportId.set(String(serial).trim(), String(id))
  }

  const { data: existingSummaries } = await supabase
    .from('err_summary')
    .select('id, activities_raw_import_id')
    .not('activities_raw_import_id', 'is', null)
  const existingImportIds = new Set<string>((existingSummaries || []).map((s: any) => s.activities_raw_import_id))

  const stats = { created: 0, skipped: 0, errors: 0 }

  // Data starts at row index 2 (rows 0=sector headers, 1=col headers)
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i]
    if (!isSerial(row[0])) continue

    const serial = row[0].trim()
    const importId = serialToImportId.get(serial)
    if (!importId) { stats.skipped++; continue }
    if (existingImportIds.has(importId)) { stats.skipped++; continue }

    try {
      const { data: inserted, error: sumErr } = await supabase
        .from('err_summary')
        .insert({
          activities_raw_import_id: importId,
          project_id: null,
          total_expenses: toNum(row[17]),
          total_grant: toNum(row[19]),
          remainder: toNum(row[20]),
          language: 'en',
          review_status: 'pending_review',
        })
        .select('id')
        .single()
      if (sumErr) throw sumErr

      existingImportIds.add(importId)

      const newSummaryId = String(inserted!.id)

      const sectorExpenses = SECTOR_COLS
        .map(({ idx, name }) => ({ name, amount: toNum(row[idx]) }))
        .filter(({ amount }) => amount !== null && amount > 0)

      if (sectorExpenses.length > 0) {
        const { error: expErr } = await supabase.from('err_expense').insert(
          sectorExpenses.map(({ name, amount }) => ({
            activities_raw_import_id: importId,
            summary_id: newSummaryId,
            expense_activity: name,
            expense_amount: amount,
            language: 'en',
          }))
        )
        if (expErr) throw expErr
      }

      stats.created++
    } catch (e) {
      console.error(`syncSpendingSummary error for ${serial}:`, errMsg(e))
      stats.errors++
    }
  }

  return stats
}

// ── Disbursement Overview ─────────────────────────────────────────────────────

async function syncDisbursementOverview(
  supabase: ServiceSupabase,
  rows: string[][]
): Promise<{ updated: number; inserted: number; errors: number }> {
  const stats = { updated: 0, inserted: 0, errors: 0 }

  // Check if "Paid To" column exists
  const { error: ptChk } = await supabase.from('activities_raw_import').select('"Paid To"').limit(1)
  const hasPaidTo = !ptChk

  // Process in batches
  for (let i = 1; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, Math.min(i + BATCH_SIZE, rows.length))
    for (const row of batch) {
      if (!isSerial(row[0])) continue
      const serial = row[0].trim()

      try {
        const payload: Record<string, unknown> = {
          'ERR Name': row[1] || null,
          'SDG': toNum(row[2]),
          'USD': toNum(row[3]),
          'Rate': toNum(row[4]),
          'Date Transfer': toDate(row[6]),
          'F4': row[7] || null,
          'State': row[8] || null,
          'Date Report Completed': toDate(row[9]),
          'Comments': row[11] || null,
        }
        if (hasPaidTo && row[5]) payload['Paid To'] = row[5].trim()

        const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== null && v !== undefined))

        const { data: existing } = await supabase
          .from('activities_raw_import')
          .select('id')
          .eq('Serial Number', serial)
          .maybeSingle()

        if (existing) {
          await supabase
            .from('activities_raw_import')
            .update(clean as Record<string, unknown>)
            .eq('id', String(existing.id))
          stats.updated++
        } else {
          await supabase.from('activities_raw_import').insert({ 'Serial Number': serial, ...clean })
          stats.inserted++
        }
      } catch (e) {
        console.error(`syncDisbursement error for ${serial}:`, errMsg(e))
        stats.errors++
      }
    }
  }

  return stats
}

// ── F4s Report ────────────────────────────────────────────────────────────────

async function syncF4sReport(
  supabase: ServiceSupabase,
  rows: string[][]
): Promise<{ inserted: number; skipped: number; errors: number }> {
  const { data: imports } = await supabase.from('activities_raw_import').select('id, "Serial Number"')
  const serialToImportId = new Map<string, string>()
  for (const r of imports || []) {
    const serial = r['Serial Number']
    const id = r.id
    if (serial != null && serial !== '' && id != null)
      serialToImportId.set(String(serial).trim(), String(id))
  }

  const { data: summaries } = await supabase
    .from('err_summary')
    .select('id, activities_raw_import_id')
    .not('activities_raw_import_id', 'is', null)
  const importIdToSummaryId = new Map<string, string>()
  for (const s of summaries || []) {
    const aid = s.activities_raw_import_id
    const sid = s.id
    if (aid != null && sid != null)
      importIdToSummaryId.set(String(aid), String(sid))
  }

  // Find which summaries already have detailed expenses
  const { data: detailed } = await supabase
    .from('err_expense')
    .select('summary_id')
    .not('expense_description', 'is', null)
  const summaryIdsWithDetail = new Set<string>(
    (detailed || []).map((r) => (r.summary_id != null ? String(r.summary_id) : '')).filter(Boolean)
  )

  // Group by serial
  const bySerial = new Map<string, string[][]>()
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!isSerial(row[0])) continue
    const serial = row[0].trim()
    const existing = bySerial.get(serial) || []
    existing.push(row)
    bySerial.set(serial, existing)
  }

  const stats = { inserted: 0, skipped: 0, errors: 0 }

  for (const [serial, serialRows] of bySerial) {
    const importId = serialToImportId.get(serial)
    if (!importId) { stats.skipped++; continue }
    const summaryId = importIdToSummaryId.get(importId)
    if (!summaryId) { stats.skipped++; continue }
    if (summaryIdsWithDetail.has(summaryId)) { stats.skipped++; continue }

    try {
      const payload = serialRows.map((row) => ({
        activities_raw_import_id: importId,
        summary_id: summaryId,
        expense_activity: row[1] || null,
        payment_date: toDate(row[2]),
        expense_description: row[3] || null,
        seller: row[4] || null,
        payment_method: row[5] || null,
        expense_amount_sdg: toNum(row[6]),
        expense_amount: toNum(row[8]),
        language: 'en',
      }))

      for (let i = 0; i < payload.length; i += 200) {
        const { error } = await supabase.from('err_expense').insert(payload.slice(i, i + 200))
        if (error) throw error
      }

      stats.inserted += payload.length
      summaryIdsWithDetail.add(summaryId)
    } catch (e) {
      console.error(`syncF4sReport error for ${serial}:`, errMsg(e))
      stats.errors++
    }
  }

  return stats
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const startTime = Date.now()

  // Auth check — accept webhook secret or Supabase service role key
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace('Bearer ', '')
  const secret = process.env.SYNC_WEBHOOK_SECRET
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

  if (secret && token !== secret && token !== serviceKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { sheet?: string } = {}
  try { body = await req.json() } catch { /* empty body is fine */ }
  const target = body.sheet || 'all'

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey
  )

  const result: Record<string, unknown> = { synced_at: new Date().toISOString() }

  try {
    if (target === 'all' || target === 'spending_summary') {
      console.log('Fetching Spending Summary sheet...')
      const rows = await fetchSheet('Spending Summary')
      result.spending_summary = await syncSpendingSummary(supabase, rows)
    }

    if (target === 'all' || target === 'disbursement') {
      console.log('Fetching Disbursement Overview sheet...')
      const rows = await fetchSheet('Disbursement Overview')
      result.disbursement_overview = await syncDisbursementOverview(supabase, rows)
    }

    if (target === 'all' || target === 'f4s_report') {
      console.log('Fetching F4s Report sheet...')
      const rows = await fetchSheet('F4s Report')
      result.f4s_report = await syncF4sReport(supabase, rows)
    }

    result.elapsed_ms = Date.now() - startTime
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const msg = errMsg(e)
    console.error('sync-financial-report error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// Also support GET for manual browser triggers / health check
export async function GET() {
  return NextResponse.json({
    endpoint: 'POST /api/compliance/sync-financial-report',
    spreadsheet_id: SPREADSHEET_ID,
    sheets: ['Spending Summary', 'Disbursement Overview', 'F4s Report'],
    body_params: { sheet: '"all" | "spending_summary" | "disbursement" | "f4s_report"' },
  })
}
