import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { pullGrantsFromFdw } from '@/lib/grantManagement/pullGrantsFromFdw'
import { syncLogger } from '@/lib/syncLogger'

export const maxDuration = 300

/**
 * Interim: pull Airtable FDW `grants` → `grants_grid_view`.
 *
 * - Inserts grants that exist in FDW but not in portal
 * - Updates only Airtable-owned financial fields on existing rows
 * - Does not overwrite portal-owned metadata (name, dates, status, …)
 *
 * Cron: daily (see vercel.json). Manual: GET/POST ?dryRun=1
 */
async function run(dryRun: boolean) {
  const syncId = `grants-fdw-pull-${Date.now()}`
  syncLogger.startSync(syncId)

  const result = await pullGrantsFromFdw({
    supabase: getSupabaseAdmin(),
    dryRun,
  })

  syncLogger.endSync(result.errors.length === 0, {
    dryRun: result.dryRun,
    inserted: result.inserted,
    updated: result.updated,
    unchanged: result.unchanged,
    toInsert: result.insertPlans.length,
    toUpdate: result.updatePlans.length,
    errors: result.errors,
  })

  return {
    success: result.errors.length === 0,
    ...result,
    timestamp: new Date().toISOString(),
  }
}

export async function GET(request: Request) {
  try {
    const dryRun = new URL(request.url).searchParams.get('dryRun') === '1'
    const result = await run(dryRun)
    return NextResponse.json(result, { status: result.success ? 200 : 500 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    syncLogger.error('grants FDW pull failed', { error: message })
    return NextResponse.json(
      { success: false, error: message, timestamp: new Date().toISOString() },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    let dryRun = false
    const urlDry = new URL(request.url).searchParams.get('dryRun') === '1'
    try {
      const body = await request.json()
      dryRun = Boolean(body?.dryRun) || urlDry
    } catch {
      dryRun = urlDry
    }
    const result = await run(dryRun)
    return NextResponse.json(result, { status: result.success ? 200 : 500 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    syncLogger.error('grants FDW pull failed', { error: message })
    return NextResponse.json(
      { success: false, error: message, timestamp: new Date().toISOString() },
      { status: 500 }
    )
  }
}
