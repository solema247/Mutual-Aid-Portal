/**
 * FCDO Financial Report → portal F4 tables (matched projects only).
 *
 * Writes only to:
 *   - err_summary / err_expense (linked by project_id → portal grant_id)
 *   - err_projects.f4_status, date_transfer, date_report_completed
 *
 * Sheet serials are resolved via Hamza rules (fcdoSerialMatch) to portal
 * grant_ids. Sheet serial strings are never written into F4 tables.
 */

import { google } from 'googleapis'
import {
  buildSerialResolver,
  type PortalProjectRef,
} from '@/lib/fcdoSerialMatch'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any

export const FCDO_FINANCIAL_SHEET_ID =
  process.env.FCDO_FINANCIAL_SHEET_ID ||
  '1R-Zuor0FqqypjSpzIKQd1cfgrZxh0fso3Ki9eb8qUb8'

const SECTOR_COLUMNS = [
  { col: 1, name: 'Protection' },
  { col: 2, name: 'Shelter & NFIs' },
  { col: 3, name: 'WASH' },
  { col: 4, name: 'Food Security' },
  { col: 5, name: 'Health' },
  { col: 6, name: 'Support logistic operations' },
  { col: 7, name: 'Volunteer Support' },
  { col: 8, name: 'Women & children needs' },
  { col: 9, name: 'Mental and physical health' },
  { col: 10, name: 'Education' },
  { col: 11, name: 'Capacity Building' },
  { col: 12, name: 'Livelihoods' },
  { col: 13, name: 'Peacebuilding / Social Cohesion' },
  { col: 14, name: 'Youth Space' },
  { col: 15, name: 'Socioeconomic' },
]

function isValidSerial(serial: unknown): serial is string {
  return typeof serial === 'string' && /^LCC-/.test(serial.trim())
}

function toNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null
  if (typeof val === 'number') return isNaN(val) ? null : val
  const cleaned = String(val).replace(/[$,%\s]/g, '')
  if (cleaned === '' || cleaned === '-') return null
  const n = Number(cleaned)
  return isNaN(n) ? null : n
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

function toDateString(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null
  if (typeof val === 'number') {
    // Google Sheets / Excel serial date
    const epoch = new Date(Date.UTC(1899, 11, 30))
    const d = new Date(epoch.getTime() + val * 86400000)
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
    return null
  }
  const s = String(val).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (m) {
    const dd = m[1].padStart(2, '0')
    const mm = m[2].padStart(2, '0')
    let yyyy = m[3]
    if (yyyy.length === 2) yyyy = `20${yyyy}`
    return `${yyyy}-${mm}-${dd}`
  }
  const named = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/)
  if (named) {
    const mm = MONTHS[named[2].slice(0, 3).toLowerCase()]
    if (mm) return `${named[3]}-${mm}-${named[1].padStart(2, '0')}`
  }
  return null
}

function normaliseF4Status(excelStatus: string | null): string | null {
  if (!excelStatus) return null
  const s = excelStatus.trim().toLowerCase()
  if (s === 'completed') return 'completed'
  if (s.startsWith('partial')) return 'partial'
  if (s === 'waiting') return 'waiting'
  if (s === 'in progress') return 'in review'
  return s
}

async function fetchAllRows(supabase: AnySupabase, table: string, cols: string): Promise<any[]> {
  const out: any[] = []
  for (let page = 0; ; page++) {
    let lastError: unknown = null
    let data: any[] | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await supabase.from(table).select(cols).range(page * 1000, (page + 1) * 1000 - 1)
      if (!res.error) {
        data = res.data
        lastError = null
        break
      }
      lastError = res.error
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
    }
    if (lastError) throw new Error(`Failed to load ${table}: ${(lastError as any)?.message || lastError}`)
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

interface SpendingSummaryRow {
  serial: string
  sectorAmounts: { name: string; amount: number }[]
  totalExpenses: number | null
  totalBudget: number | null
  balance: number | null
}

interface DisbursementRow {
  serial: string
  transferDate: string | null
  f4Status: string | null
  reportSubmit: string | null
}

interface F4sReportRow {
  serial: string
  activity: string | null
  paymentDate: string | null
  description: string | null
  seller: string | null
  paymentMethod: string | null
  amountSdg: number | null
  amountUsd: number | null
}

function parseSpendingSummary(rows: unknown[][]): SpendingSummaryRow[] {
  const results: SpendingSummaryRow[] = []
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    if (!isValidSerial(row[0])) continue
    const sectorAmounts: { name: string; amount: number }[] = []
    for (const { col, name } of SECTOR_COLUMNS) {
      const amt = toNumber(row[col])
      if (amt !== null && amt > 0) sectorAmounts.push({ name, amount: amt })
    }
    results.push({
      serial: String(row[0]).trim(),
      sectorAmounts,
      totalExpenses: toNumber(row[17]),
      totalBudget: toNumber(row[19]),
      balance: toNumber(row[20]),
    })
  }
  return results
}

function parseDisbursementOverview(rows: unknown[][]): DisbursementRow[] {
  const results: DisbursementRow[] = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    if (!isValidSerial(row[0])) continue
    results.push({
      serial: String(row[0]).trim(),
      transferDate: toDateString(row[6]),
      f4Status: row[7] ? String(row[7]).trim() : null,
      reportSubmit: toDateString(row[9]),
    })
  }
  return results
}

function parseF4sReport(rows: unknown[][]): F4sReportRow[] {
  const results: F4sReportRow[] = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    if (!isValidSerial(row[0])) continue
    results.push({
      serial: String(row[0]).trim(),
      activity: row[1] ? String(row[1]).trim() : null,
      paymentDate: toDateString(row[2]),
      description: row[3] ? String(row[3]).trim() : null,
      seller: row[4] ? String(row[4]).trim() : null,
      paymentMethod: row[5] ? String(row[5]).trim() : null,
      amountSdg: toNumber(row[6]),
      amountUsd: toNumber(row[8]),
    })
  }
  return results
}

function loadGoogleCredentials(): Record<string, unknown> {
  const raw = process.env.GOOGLE_SHEETS
  if (!raw) throw new Error('GOOGLE_SHEETS environment variable is not set')
  const creds = JSON.parse(raw) as Record<string, unknown>
  if (typeof creds.private_key === 'string') {
    creds.private_key = (creds.private_key as string).replace(/\\n/g, '\n')
  }
  return creds
}

export async function loadFcdoFinancialTabs(
  sheetId: string = FCDO_FINANCIAL_SHEET_ID
): Promise<Record<string, unknown[][]>> {
  const auth = new google.auth.GoogleAuth({
    credentials: loadGoogleCredentials() as any,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
  const api = google.sheets({ version: 'v4', auth })
  const tabs = ['Spending Summary', 'Disbursement Overview', 'F4s Report'] as const
  const out: Record<string, unknown[][]> = {}
  for (const tab of tabs) {
    const res = await api.spreadsheets.values.get({ spreadsheetId: sheetId, range: tab })
    out[tab] = (res.data.values || []) as unknown[][]
  }
  return out
}

export interface FcdoF4SyncStats {
  resolverMatched: number
  sheetSerials: number
  spending: {
    matched: number
    skippedExisting: number
    summariesCreated: number
    expensesCreated: number
    errors: number
  }
  projects: {
    matched: number
    updated: number
    skipped: number
    errors: number
  }
  f4s: {
    serialsMatched: number
    serialsSkipped: number
    expensesInserted: number
    errors: number
  }
}

/**
 * Sync F4 tables for sheet serials that resolve to portal projects.
 * Unmatched sheet serials are ignored. No writes to activities_raw_import.
 */
export async function syncFcdoF4TablesOnly(opts: {
  supabase: AnySupabase
  tabs: Record<string, unknown[][]>
  dryRun?: boolean
}): Promise<FcdoF4SyncStats> {
  const { supabase, tabs, dryRun = false } = opts

  const spendingRows = parseSpendingSummary(tabs['Spending Summary'] || [])
  const disbursementRows = parseDisbursementOverview(tabs['Disbursement Overview'] || [])
  const f4sRows = parseF4sReport(tabs['F4s Report'] || [])

  const allPortalProjects: { id: string; grant_id: string | null }[] = await fetchAllRows(
    supabase,
    'err_projects',
    'id, grant_id'
  )

  const allSerials = [
    ...spendingRows.map((r) => r.serial),
    ...disbursementRows.map((r) => r.serial),
    ...f4sRows.map((r) => r.serial),
  ]
  const resolver = buildSerialResolver(allSerials, allPortalProjects)
  const uniqueSheet = new Set(allSerials)

  const stats: FcdoF4SyncStats = {
    resolverMatched: resolver.size,
    sheetSerials: uniqueSheet.size,
    spending: { matched: 0, skippedExisting: 0, summariesCreated: 0, expensesCreated: 0, errors: 0 },
    projects: { matched: 0, updated: 0, skipped: 0, errors: 0 },
    f4s: { serialsMatched: 0, serialsSkipped: 0, expensesInserted: 0, errors: 0 },
  }

  // ── Spending Summary → err_summary + sector err_expense (portal only) ─────
  const existingSummaries = await fetchAllRows(supabase, 'err_summary', 'id, project_id')
  const existingByProjectId = new Set<string>()
  const projectIdToSummaryId = new Map<string, number>()
  for (const s of existingSummaries || []) {
    if (s.project_id) {
      existingByProjectId.add(String(s.project_id))
      projectIdToSummaryId.set(String(s.project_id), Number(s.id))
    }
  }

  for (const row of spendingRows) {
    const ref = resolver.get(row.serial)
    if (!ref) continue
    stats.spending.matched++

    if (existingByProjectId.has(ref.projectId)) {
      stats.spending.skippedExisting++
      continue
    }

    if (dryRun) {
      stats.spending.summariesCreated++
      stats.spending.expensesCreated += row.sectorAmounts.length
      continue
    }

    try {
      const { data: inserted, error: insErr } = await supabase
        .from('err_summary')
        .insert({
          activities_raw_import_id: null,
          project_id: ref.projectId,
          total_expenses: row.totalExpenses,
          total_grant: row.totalBudget,
          remainder: row.balance,
          language: 'en',
          review_status: 'pending_review',
        })
        .select('id')
        .single()
      if (insErr) throw insErr

      existingByProjectId.add(ref.projectId)
      projectIdToSummaryId.set(ref.projectId, Number(inserted.id))
      stats.spending.summariesCreated++

      if (row.sectorAmounts.length > 0) {
        const expensePayload = row.sectorAmounts.map(({ name, amount }) => ({
          activities_raw_import_id: null,
          project_id: ref.projectId,
          summary_id: inserted.id,
          expense_activity: name,
          expense_amount: amount,
          language: 'en',
        }))
        const { error: expErr } = await supabase.from('err_expense').insert(expensePayload)
        if (expErr) throw expErr
        stats.spending.expensesCreated += expensePayload.length
      }
    } catch (e: unknown) {
      stats.spending.errors++
      console.error(`  [spending] ${row.serial} → ${ref.grantId}:`, (e as any)?.message || e)
    }
  }

  // ── Disbursement → err_projects F4 fields only ────────────────────────────
  const portalProjects = await fetchAllRows(
    supabase,
    'err_projects',
    'id, grant_id, f4_status, date_transfer, date_report_completed'
  )
  const projectById = new Map(portalProjects.map((p: any) => [String(p.id), p]))

  for (const row of disbursementRows) {
    const ref = resolver.get(row.serial)
    if (!ref) continue
    const project = projectById.get(ref.projectId)
    if (!project) continue
    stats.projects.matched++

    const updatePayload: Record<string, unknown> = {}
    if (!project.date_transfer && row.transferDate) {
      updatePayload.date_transfer = row.transferDate
    }
    const normF4 = normaliseF4Status(row.f4Status)
    if (normF4 && normF4 !== 'waiting' && (!project.f4_status || project.f4_status === 'waiting')) {
      updatePayload.f4_status = normF4
    }
    if (!project.date_report_completed && row.reportSubmit) {
      updatePayload.date_report_completed = row.reportSubmit
    }

    if (Object.keys(updatePayload).length === 0) {
      stats.projects.skipped++
      continue
    }

    if (dryRun) {
      stats.projects.updated++
      continue
    }

    try {
      const { error: updErr } = await supabase
        .from('err_projects')
        .update(updatePayload)
        .eq('id', ref.projectId)
      if (updErr) throw updErr
      stats.projects.updated++
    } catch (e: unknown) {
      stats.projects.errors++
      console.error(`  [projects] ${row.serial} → ${ref.grantId}:`, (e as any)?.message || e)
    }
  }

  // ── F4s Report → detailed err_expense under portal summaries ──────────────
  // Refresh summaries map after spending pass
  const summariesRefresh = await fetchAllRows(supabase, 'err_summary', 'id, project_id')
  projectIdToSummaryId.clear()
  for (const s of summariesRefresh || []) {
    if (s.project_id) projectIdToSummaryId.set(String(s.project_id), Number(s.id))
  }

  const { data: existingDetailed } = await supabase
    .from('err_expense')
    .select('summary_id')
    .not('expense_description', 'is', null)
  const summaryIdsWithDetail = new Set<number>(
    (existingDetailed || []).map((r: any) => r.summary_id).filter(Boolean)
  )

  const bySerial = new Map<string, F4sReportRow[]>()
  for (const row of f4sRows) {
    const ref = resolver.get(row.serial)
    if (!ref) continue
    const list = bySerial.get(row.serial) || []
    list.push(row)
    bySerial.set(row.serial, list)
  }

  for (const [serial, serialRows] of bySerial) {
    const ref = resolver.get(serial)!
    const summaryId = projectIdToSummaryId.get(ref.projectId)
    if (!summaryId) continue
    stats.f4s.serialsMatched++

    if (summaryIdsWithDetail.has(summaryId)) {
      stats.f4s.serialsSkipped++
      continue
    }

    if (dryRun) {
      stats.f4s.expensesInserted += serialRows.length
      continue
    }

    try {
      const payload = serialRows.map((row) => ({
        activities_raw_import_id: null,
        project_id: ref.projectId,
        summary_id: summaryId,
        expense_activity: row.activity,
        expense_description: row.description,
        expense_amount: row.amountUsd,
        expense_amount_sdg: row.amountSdg,
        payment_date: row.paymentDate,
        payment_method: row.paymentMethod,
        seller: row.seller,
        language: 'en',
      }))

      for (let i = 0; i < payload.length; i += 200) {
        const chunk = payload.slice(i, i + 200)
        const { error: insErr } = await supabase.from('err_expense').insert(chunk)
        if (insErr) throw insErr
      }
      stats.f4s.expensesInserted += serialRows.length
      summaryIdsWithDetail.add(summaryId)
    } catch (e: unknown) {
      stats.f4s.errors++
      console.error(`  [f4s] ${serial} → ${ref.grantId}:`, (e as any)?.message || e)
    }
  }

  return stats
}
