/**
 * sync-fcdo-financial-report.ts
 *
 * Syncs three sheets from an FCDO Financial Report Excel file into Supabase:
 *
 *   1. "Spending Summary" → err_summary + err_expense (sector aggregates)
 *      - One err_summary per F1 serial (skipped if already exists)
 *      - One err_expense row per non-zero sector per F1 serial
 *
 *   2. "Disbursement Overview" → activities_raw_import (upsert by Serial Number)
 *
 *   3. "F4s Report" → err_expense (individual receipt line items)
 *      - Each row inserted as a detailed expense under its serial's err_summary
 *      - Adds alongside existing aggregate entries (no deletion)
 *      - Skips serials already loaded in this session (idempotent via LHub-import tag)
 *
 * Usage:
 *   npx ts-node --project tsconfig.json scripts/sync-fcdo-financial-report.ts \
 *     --file "docs/Compliance check feature/LCC-FCDO-0325-0001 Financial Report .xlsx"
 *
 * Prerequisite: Run sql/add_disbursement_paid_to.sql in the Supabase SQL editor first.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = ReturnType<typeof createClient>

// ── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const BATCH_SIZE = 50

// Sector columns in Spending Summary (columns B–P, index 1–15)
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseArgs(): { file: string; dryRun: boolean } {
  const args = process.argv.slice(2)
  let file = ''
  let dryRun = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) file = args[++i]
    if (args[i] === '--dry-run') dryRun = true
  }
  if (!file) {
    console.error('Error: --file <path> is required')
    process.exit(1)
  }
  return { file, dryRun }
}

function toNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null
  const n = Number(val)
  return isNaN(n) ? null : n
}

function toDateString(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null
  // XLSX stores dates as serial numbers or strings
  if (typeof val === 'number') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const date = (XLSX.SSF as any).parse_date_code(val)
    if (date) {
      const y = date.y
      const m = String(date.m).padStart(2, '0')
      const d = String(date.d).padStart(2, '0')
      return `${y}-${m}-${d}`
    }
  }
  if (typeof val === 'string') {
    const s = val.trim()
    if (!s) return null
    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10)
    // DD/MM/YYYY
    const dmyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`
    // Try native Date parse
    const d = new Date(s)
    if (!isNaN(d.getTime())) return d.toISOString().substring(0, 10)
  }
  return null
}

function isValidSerial(serial: unknown): serial is string {
  return typeof serial === 'string' && /^LCC-/.test(serial.trim())
}

// ── Excel parsing ─────────────────────────────────────────────────────────────

interface SpendingSummaryRow {
  serial: string
  sectorAmounts: { name: string; amount: number }[]
  totalExpenses: number | null   // col R
  submitPct: number | null       // col S
  totalBudget: number | null     // col T
  balance: number | null         // col U
  state: string | null           // col V
}

interface DisbursementRow {
  serial: string
  errName: string | null
  sdg: number | null
  usd: number | null
  rate: number | null
  paidTo: string | null
  transferDate: string | null
  f4Status: string | null
  state: string | null
  reportSubmit: string | null
  lhubComment: string | null
}

function parseSpendingSummary(sheet: XLSX.WorkSheet): SpendingSummaryRow[] {
  // Row 1 = sector group headers, Row 2 = column headers, Rows 3+ = data
  // We use raw row-based access (sheet_to_json skipping header rows)
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })

  const results: SpendingSummaryRow[] = []

  // Data starts at row index 2 (0-based) = row 3 in Excel
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    const serial = row[0]
    if (!isValidSerial(serial)) continue

    const sectorAmounts: { name: string; amount: number }[] = []
    for (const { col, name } of SECTOR_COLUMNS) {
      const amt = toNumber(row[col])
      if (amt !== null && amt > 0) {
        sectorAmounts.push({ name, amount: amt })
      }
    }

    results.push({
      serial: String(serial).trim(),
      sectorAmounts,
      totalExpenses: toNumber(row[17]),  // col R (0-indexed = 17)
      submitPct: toNumber(row[18]),       // col S
      totalBudget: toNumber(row[19]),     // col T
      balance: toNumber(row[20]),         // col U
      state: row[21] ? String(row[21]).trim() : null,  // col V
    })
  }

  return results
}

function parseDisbursementOverview(sheet: XLSX.WorkSheet): DisbursementRow[] {
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })
  const results: DisbursementRow[] = []

  // Row 0 = headers, Rows 1+ = data
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    const serial = row[0]
    if (!isValidSerial(serial)) continue

    results.push({
      serial: String(serial).trim(),
      errName: row[1] ? String(row[1]).trim() : null,
      sdg: toNumber(row[2]),
      usd: toNumber(row[3]),
      rate: toNumber(row[4]),
      paidTo: row[5] ? String(row[5]).trim() : null,
      transferDate: toDateString(row[6]),
      f4Status: row[7] ? String(row[7]).trim() : null,
      state: row[8] ? String(row[8]).trim() : null,
      reportSubmit: toDateString(row[9]),
      // col K (index 10) = Activity Duration — computed, skipped
      lhubComment: row[11] ? String(row[11]).trim() : null,
    })
  }

  return results
}

// ── Main sync logic ───────────────────────────────────────────────────────────

async function syncSpendingSummary(
  supabase: AnySupabase,
  rows: SpendingSummaryRow[],
  dryRun: boolean
) {
  console.log(`\n=== Spending Summary: ${rows.length} F1 serials ===`)

  // Fetch all activities_raw_import records for fast in-memory lookup
  console.log('Loading activities_raw_import records...')
  const { data: rawImports, error: rawErr } = await supabase
    .from('activities_raw_import')
    .select('id, "Serial Number"')
  if (rawErr) throw new Error(`Failed to load activities_raw_import: ${rawErr.message}`)

  const serialToImportId = new Map<string, string>()
  for (const rec of rawImports || []) {
    const sn = rec['Serial Number']
    if (sn) serialToImportId.set(String(sn).trim(), rec.id)
  }
  console.log(`  Loaded ${serialToImportId.size} activities_raw_import records`)

  // Also check portal projects
  console.log('Loading err_projects records...')
  const { data: portalProjects, error: ppErr } = await supabase
    .from('err_projects')
    .select('id, grant_serial_id')
  if (ppErr) throw new Error(`Failed to load err_projects: ${ppErr.message}`)

  const serialToProjectId = new Map<string, string>()
  for (const p of portalProjects || []) {
    if (p.grant_serial_id) serialToProjectId.set(String(p.grant_serial_id).trim(), p.id)
  }
  console.log(`  Loaded ${serialToProjectId.size} err_projects records`)

  // Fetch existing err_summary records to skip duplicates
  console.log('Loading existing err_summary records...')
  const { data: existingSummaries, error: esErr } = await supabase
    .from('err_summary')
    .select('id, activities_raw_import_id, project_id')
  if (esErr) throw new Error(`Failed to load err_summary: ${esErr.message}`)

  const existingByImportId = new Set<string>()
  const existingByProjectId = new Set<string>()
  for (const s of existingSummaries || []) {
    if (s.activities_raw_import_id) existingByImportId.add(s.activities_raw_import_id)
    if (s.project_id) existingByProjectId.add(s.project_id)
  }
  console.log(`  Found ${existingByImportId.size + existingByProjectId.size} existing summaries`)

  const stats = {
    matched: 0,
    unmatched: 0,
    skippedExisting: 0,
    summariesCreated: 0,
    expensesCreated: 0,
    errors: 0,
  }

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)

    for (const row of batch) {
      const importId = serialToImportId.get(row.serial)
      const projectId = serialToProjectId.get(row.serial)

      if (!importId && !projectId) {
        console.warn(`  [UNMATCHED] ${row.serial}`)
        stats.unmatched++
        continue
      }
      stats.matched++

      // Skip if summary already exists
      if (importId && existingByImportId.has(importId)) {
        stats.skippedExisting++
        continue
      }
      if (projectId && existingByProjectId.has(projectId)) {
        stats.skippedExisting++
        continue
      }

      if (dryRun) {
        console.log(`  [DRY RUN] Would create summary for ${row.serial} (${row.sectorAmounts.length} sectors)`)
        stats.summariesCreated++
        stats.expensesCreated += row.sectorAmounts.length
        continue
      }

      try {
        // Insert err_summary
        const summaryPayload: Record<string, unknown> = {
          activities_raw_import_id: importId || null,
          project_id: projectId || null,
          total_expenses: row.totalExpenses,
          total_grant: row.totalBudget,
          remainder: row.balance,
          language: 'en',
          review_status: 'pending_review',
        }

        const { data: inserted, error: insErr } = await supabase
          .from('err_summary')
          .insert(summaryPayload)
          .select('id')
          .single()

        if (insErr) throw insErr
        const summary_id = inserted.id
        stats.summariesCreated++

        // Track so we don't try to insert again in this run
        if (importId) existingByImportId.add(importId)
        if (projectId) existingByProjectId.add(projectId)

        // Insert err_expense rows (one per sector)
        if (row.sectorAmounts.length > 0) {
          const expensePayload = row.sectorAmounts.map(({ name, amount }) => ({
            activities_raw_import_id: importId || null,
            project_id: projectId || null,
            summary_id,
            expense_activity: name,
            expense_amount: amount,
            language: 'en',
          }))

          const { error: expErr } = await supabase
            .from('err_expense')
            .insert(expensePayload)

          if (expErr) throw expErr
          stats.expensesCreated += expensePayload.length
        }
      } catch (e: unknown) {
        const msg = e instanceof Error
          ? e.message
          // Supabase errors are plain objects with .message
          : (e as any)?.message || (e as any)?.details || JSON.stringify(e)
        console.error(`  [ERROR] ${row.serial}: ${msg}`)
        stats.errors++
      }
    }

    const processed = Math.min(i + BATCH_SIZE, rows.length)
    process.stdout.write(`\r  Progress: ${processed}/${rows.length}`)
  }

  console.log('\n')
  console.log('Spending Summary results:')
  console.log(`  Matched to DB:     ${stats.matched}`)
  console.log(`  Unmatched:         ${stats.unmatched}`)
  console.log(`  Skipped (existing):${stats.skippedExisting}`)
  console.log(`  Summaries created: ${stats.summariesCreated}`)
  console.log(`  Expenses created:  ${stats.expensesCreated}`)
  console.log(`  Errors:            ${stats.errors}`)
}

async function syncDisbursementOverview(
  supabase: AnySupabase,
  rows: DisbursementRow[],
  dryRun: boolean,
  hasPaidToColumn: boolean
) {
  console.log(`\n=== Disbursement Overview: ${rows.length} rows ===`)

  const stats = {
    updated: 0,
    inserted: 0,
    errors: 0,
  }

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)

    for (const row of batch) {
      if (dryRun) {
        console.log(`  [DRY RUN] Would upsert ${row.serial} → F4: ${row.f4Status}, USD: ${row.usd}`)
        stats.updated++
        continue
      }

      try {
        // Check if record already exists
        const { data: existing, error: chkErr } = await supabase
          .from('activities_raw_import')
          .select('id')
          .eq('Serial Number', row.serial)
          .maybeSingle()

        if (chkErr) throw chkErr

        const updatePayload: Record<string, unknown> = {
          'ERR Name': row.errName,
          'SDG': row.sdg,
          'USD': row.usd,
          'Rate': row.rate,
          'Date Transfer': row.transferDate,
          'F4': row.f4Status,
          'State': row.state,
          'Date Report Completed': row.reportSubmit,
          'Comments': row.lhubComment,
        }

        if (hasPaidToColumn && row.paidTo !== null) {
          updatePayload['Paid To'] = row.paidTo
        }

        // Remove null values to avoid overwriting existing data with null
        const cleanPayload = Object.fromEntries(
          Object.entries(updatePayload).filter(([, v]) => v !== null && v !== undefined)
        )

        if (existing) {
          const { error: updErr } = await supabase
            .from('activities_raw_import')
            .update(cleanPayload)
            .eq('id', existing.id)

          if (updErr) throw updErr
          stats.updated++
        } else {
          // Insert new record with serial number
          const insertPayload: Record<string, unknown> = { 'Serial Number': row.serial, ...cleanPayload }
          const { error: insErr } = await supabase
            .from('activities_raw_import')
            .insert(insertPayload)

          if (insErr) throw insErr
          stats.inserted++
        }
      } catch (e: unknown) {
        const msg = e instanceof Error
          ? e.message
          : (e as any)?.message || (e as any)?.details || JSON.stringify(e)
        console.error(`  [ERROR] ${row.serial}: ${msg}`)
        stats.errors++
      }
    }

    const processed = Math.min(i + BATCH_SIZE, rows.length)
    process.stdout.write(`\r  Progress: ${processed}/${rows.length}`)
  }

  console.log('\n')
  console.log('Disbursement Overview results:')
  console.log(`  Updated:  ${stats.updated}`)
  console.log(`  Inserted: ${stats.inserted}`)
  console.log(`  Errors:   ${stats.errors}`)
}

// ── F4s Report ───────────────────────────────────────────────────────────────

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

function parseF4sReport(sheet: XLSX.WorkSheet): F4sReportRow[] {
  // Row 0 = headers, Rows 1+ = data
  // Cols: A=Serial, B=Activity, C=PaymentDate, D=Description, E=Seller, F=Payment Method,
  //       G=Expenditure SDG, H=Exg Rate, I=Expenditure USD, J=LHub Comment
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })
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
      amountUsd: toNumber(row[8]),  // col I (index 8), skip col H (exchange rate)
    })
  }

  return results
}

async function syncF4sReport(
  supabase: AnySupabase,
  rows: F4sReportRow[],
  dryRun: boolean
) {
  console.log(`\n=== F4s Report: ${rows.length} line items ===`)

  // Load serial → {importId, summaryId} mapping
  console.log('Loading err_summary records (serial lookup)...')
  const { data: summaries, error: sumErr } = await supabase
    .from('err_summary')
    .select('id, activities_raw_import_id, project_id')
    .not('activities_raw_import_id', 'is', null)
  if (sumErr) throw new Error(`Failed to load err_summary: ${sumErr.message}`)

  // Load import records to get serial → import_id mapping
  const { data: imports, error: impErr } = await supabase
    .from('activities_raw_import')
    .select('id, "Serial Number"')
  if (impErr) throw new Error(`Failed to load activities_raw_import: ${impErr.message}`)

  const serialToImportId = new Map<string, string>()
  for (const rec of imports || []) {
    const sn = rec['Serial Number']
    if (sn) serialToImportId.set(String(sn).trim(), rec.id)
  }

  const importIdToSummaryId = new Map<string, number>()
  for (const s of summaries || []) {
    if (s.activities_raw_import_id) importIdToSummaryId.set(s.activities_raw_import_id, s.id)
  }

  // Check which serials already have detailed expenses loaded (non-null description)
  // Group by summary_id to detect already-imported serials
  const { data: existingDetailed } = await supabase
    .from('err_expense')
    .select('summary_id')
    .not('expense_description', 'is', null)

  const summaryIdsWithDetail = new Set<number>(
    (existingDetailed || []).map((r: any) => r.summary_id).filter(Boolean)
  )
  console.log(`  Loaded ${serialToImportId.size} import records, ${importIdToSummaryId.size} summaries`)
  console.log(`  Summaries already with detailed expenses: ${summaryIdsWithDetail.size}`)

  // Group F4s rows by serial to batch-insert per serial
  const bySerial = new Map<string, F4sReportRow[]>()
  for (const row of rows) {
    const existing = bySerial.get(row.serial) || []
    existing.push(row)
    bySerial.set(row.serial, existing)
  }

  const stats = {
    serialsMatched: 0,
    serialsUnmatched: 0,
    serialsSkipped: 0,
    expensesInserted: 0,
    errors: 0,
  }

  let processed = 0
  for (const [serial, serialRows] of bySerial) {
    processed++
    process.stdout.write(`\r  Progress: ${processed}/${bySerial.size}`)

    const importId = serialToImportId.get(serial)
    if (!importId) {
      stats.serialsUnmatched++
      continue
    }

    const summaryId = importIdToSummaryId.get(importId)
    if (!summaryId) {
      // No summary for this serial — skip (spending summary didn't create one)
      stats.serialsUnmatched++
      continue
    }
    stats.serialsMatched++

    // Skip if this summary already has detailed expenses
    if (summaryIdsWithDetail.has(summaryId)) {
      stats.serialsSkipped++
      continue
    }

    if (dryRun) {
      console.log(`  [DRY RUN] Would insert ${serialRows.length} expenses for ${serial}`)
      stats.expensesInserted += serialRows.length
      continue
    }

    try {
      const payload = serialRows.map((row) => ({
        activities_raw_import_id: importId,
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

      // Insert in sub-batches of 200
      for (let i = 0; i < payload.length; i += 200) {
        const chunk = payload.slice(i, i + 200)
        const { error: insErr } = await supabase.from('err_expense').insert(chunk)
        if (insErr) throw insErr
      }

      stats.expensesInserted += serialRows.length
      // Mark as having detailed so we don't double-insert within this run
      summaryIdsWithDetail.add(summaryId)
    } catch (e: unknown) {
      const msg = e instanceof Error
        ? e.message
        : (e as any)?.message || (e as any)?.details || JSON.stringify(e)
      console.error(`  [ERROR] ${serial}: ${msg}`)
      stats.errors++
    }
  }

  console.log('\n')
  console.log('F4s Report results:')
  console.log(`  Serials matched:   ${stats.serialsMatched}`)
  console.log(`  Serials unmatched: ${stats.serialsUnmatched}`)
  console.log(`  Serials skipped (already loaded): ${stats.serialsSkipped}`)
  console.log(`  Expenses inserted: ${stats.expensesInserted}`)
  console.log(`  Errors:            ${stats.errors}`)
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  const { file, dryRun } = parseArgs()
  const filePath = path.resolve(process.cwd(), file)

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`)
    process.exit(1)
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.')
    console.error('Set them in .env.local or export them before running.')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  console.log(`Reading Excel: ${filePath}`)
  if (dryRun) console.log('*** DRY RUN MODE — no writes will occur ***')

  const workbook = XLSX.readFile(filePath)
  console.log('Sheets found:', workbook.SheetNames.join(', '))

  // Verify required sheets exist
  const spendingSheet = workbook.Sheets['Spending Summary']
  const disbursementSheet = workbook.Sheets['Disbursement Overview']
  const f4sReportSheet = workbook.Sheets['F4s Report']

  if (!spendingSheet) {
    console.error('Sheet "Spending Summary" not found in workbook')
    process.exit(1)
  }
  if (!disbursementSheet) {
    console.error('Sheet "Disbursement Overview" not found in workbook')
    process.exit(1)
  }

  const spendingRows = parseSpendingSummary(spendingSheet)
  console.log(`Parsed ${spendingRows.length} Spending Summary rows`)

  const disbursementRows = parseDisbursementOverview(disbursementSheet)
  console.log(`Parsed ${disbursementRows.length} Disbursement Overview rows`)

  const f4sRows = f4sReportSheet ? parseF4sReport(f4sReportSheet) : []
  console.log(`Parsed ${f4sRows.length} F4s Report line items`)

  // Check if "Paid To" column exists
  let hasPaidToColumn = false
  if (!dryRun) {
    const { error: ptErr } = await supabase
      .from('activities_raw_import')
      .select('"Paid To"')
      .limit(1)
    hasPaidToColumn = !ptErr
    if (!hasPaidToColumn) {
      console.warn('\nWARNING: "Paid To" column does not exist in activities_raw_import.')
      console.warn('Run sql/add_disbursement_paid_to.sql in the Supabase SQL editor to add it.')
      console.warn('"Paid To" data will be skipped for now.\n')
    }
  }

  // Run syncs
  await syncSpendingSummary(supabase, spendingRows, dryRun)
  await syncDisbursementOverview(supabase, disbursementRows, dryRun, hasPaidToColumn)
  if (f4sRows.length > 0) {
    await syncF4sReport(supabase, f4sRows, dryRun)
  } else {
    console.log('\n(No F4s Report sheet found — skipping)')
  }

  console.log('\nDone.')
}

main().catch((e) => {
  console.error('Fatal error:', e)
  process.exit(1)
})
