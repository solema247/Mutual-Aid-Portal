import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { syncLogger } from '@/lib/syncLogger'

const AIRTABLE_BASE_ID = 'appq9qjlnEW7d0tqZ'
const AIRTABLE_TOKEN_ENV = 'Airtable_Personal_Access_Token'

type TableSyncConfig = {
  airtableTable: string
  supabaseTable: string
  upsertKey: string
}

const TABLES: TableSyncConfig[] = [
  {
    airtableTable: 'Distribution_Decision',
    supabaseTable: 'distribution_decision_master_sheet_1',
    upsertKey: 'decision_id_proposed',
  },
  {
    airtableTable: 'transfer_segment',
    supabaseTable: 'transfer_segment_partner_grouping_1',
    upsertKey: 'Transfer_ID',
  },
]

type AirtableRecord = {
  id: string
  fields: Record<string, any>
}

function getAirtableToken() {
  const token = process.env[AIRTABLE_TOKEN_ENV]
  if (!token) {
    throw new Error(`Missing ${AIRTABLE_TOKEN_ENV} environment variable`)
  }
  return token
}

async function fetchAirtableRecords(tableName: string): Promise<AirtableRecord[]> {
  const token = getAirtableToken()
  const records: AirtableRecord[] = []
  let offset: string | undefined

  do {
    const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}`)
    url.searchParams.set('pageSize', '100')
    if (offset) url.searchParams.set('offset', offset)

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Airtable fetch failed for ${tableName}: ${res.status} ${body}`)
    }

    const data = await res.json()
    records.push(...(data.records || []))
    offset = data.offset
  } while (offset)

  return records
}

function normalizeRecord(fields: Record<string, any>) {
  const normalized: Record<string, any> = {}
  for (const [key, value] of Object.entries(fields)) {
    normalized[key] = value === undefined ? null : value
  }
  return normalized
}

function inferColumnType(values: any[]): 'text' | 'numeric' | 'boolean' | 'jsonb' {
  const nonNull = values.filter((v) => v !== null && v !== undefined)
  if (nonNull.length === 0) return 'text'

  const isBoolean = nonNull.every((v) => typeof v === 'boolean')
  if (isBoolean) return 'boolean'

  const isNumber = nonNull.every((v) => typeof v === 'number' && Number.isFinite(v))
  if (isNumber) return 'numeric'

  const isString = nonNull.every((v) => typeof v === 'string')
  if (isString) return 'text'

  return 'jsonb'
}

async function executeSql(sql: string) {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.rpc('execute_sql', { sql })
  if (error) {
    if (error.message?.includes('function execute_sql')) {
      throw new Error(
        'Missing execute_sql RPC. Create a SQL function named execute_sql(text) to enable schema updates.'
      )
    }
    throw new Error(`Failed to execute SQL: ${error.message}`)
  }
}

function extractMissingColumn(errorMessage: string): string | null {
  const match = errorMessage.match(/column \"(.+?)\" of relation/)
  return match ? match[1] : null
}

async function ensureColumn(table: string, column: string, sampleValues: any[]) {
  const columnType = inferColumnType(sampleValues)
  const sql = `ALTER TABLE public.\"${table}\" ADD COLUMN IF NOT EXISTS \"${column}\" ${columnType};`
  await executeSql(sql)
}

async function upsertWithSchemaSync(
  table: string,
  upsertKey: string,
  records: Record<string, any>[]
) {
  const supabase = getSupabaseAdmin()
  const chunks: Record<string, any>[][] = []
  const chunkSize = 500
  for (let i = 0; i < records.length; i += chunkSize) {
    chunks.push(records.slice(i, i + chunkSize))
  }

  for (const chunk of chunks) {
    let attempts = 0
    while (attempts < 3) {
      const { error } = await supabase
        .from(table)
        .upsert(chunk, { onConflict: upsertKey })

      if (!error) break

      const missingColumn = extractMissingColumn(error.message)
      if (!missingColumn) {
        throw new Error(`Upsert failed for ${table}: ${error.message}`)
      }

      const sampleValues = chunk.map((row) => row[missingColumn])
      syncLogger.warn(`Missing column detected, adding ${missingColumn} to ${table}`, {
        table,
        column: missingColumn,
      })
      await ensureColumn(table, missingColumn, sampleValues)
      attempts += 1
    }
  }
}

async function syncTable(config: TableSyncConfig) {
  syncLogger.info(`Fetching Airtable records for ${config.airtableTable}`)
  const airtableRecords = await fetchAirtableRecords(config.airtableTable)

  const rows = airtableRecords
    .map((record) => normalizeRecord(record.fields))
    .filter((row) => row[config.upsertKey] !== null && row[config.upsertKey] !== undefined)

  syncLogger.info(`Upserting ${rows.length} records into ${config.supabaseTable}`)
  await upsertWithSchemaSync(config.supabaseTable, config.upsertKey, rows)
}

export async function GET() {
  const syncId = `airtable-sync-${Date.now()}`
  syncLogger.startSync(syncId)

  try {
    for (const config of TABLES) {
      await syncTable(config)
    }

    syncLogger.endSync(true, { tables: TABLES.map((t) => t.supabaseTable) })
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    syncLogger.error('Airtable sync failed', { error: error?.message || error })
    syncLogger.endSync(false, { error: error?.message || error })
    return NextResponse.json(
      { ok: false, error: error?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}
