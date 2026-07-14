import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import {
  FCDO_FINANCIAL_SHEET_ID,
  loadFcdoFinancialTabs,
  syncFcdoF4TablesOnly,
} from '@/lib/fcdoFinancialReportSync'

export const maxDuration = 600

/**
 * Sync FCDO Financial Report Google Sheet → portal F4 tables only.
 *
 * Uses Hamza serial matching (Khartoum locality → KH, month 0226 → 0326, etc.)
 * and writes only to err_summary / err_expense / err_projects F4 fields for
 * matched portal projects. Sheet serial strings are not stored in F4 tables —
 * rows link via project_id to the portal grant_id.
 *
 * Cron: daily (see vercel.json). Also triggerable via GET/POST.
 */
async function runSync(dryRun: boolean) {
  const supabase = getSupabaseAdmin()
  const sheetId = FCDO_FINANCIAL_SHEET_ID
  const tabs = await loadFcdoFinancialTabs(sheetId)
  const stats = await syncFcdoF4TablesOnly({ supabase, tabs, dryRun })
  return {
    success: true,
    dryRun,
    sheetId,
    message:
      'F4 tables synced for matched portal projects (sheet serial → portal grant_id)',
    stats,
    timestamp: new Date().toISOString(),
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const dryRun = url.searchParams.get('dryRun') === '1'
    const result = await runSync(dryRun)
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[sync-financial-report]', message)
    return NextResponse.json(
      { success: false, error: message, timestamp: new Date().toISOString() },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    let dryRun = false
    try {
      const body = await request.json()
      dryRun = Boolean(body?.dryRun)
    } catch {
      // empty body ok
    }
    const result = await runSync(dryRun)
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[sync-financial-report]', message)
    return NextResponse.json(
      { success: false, error: message, timestamp: new Date().toISOString() },
      { status: 500 }
    )
  }
}
