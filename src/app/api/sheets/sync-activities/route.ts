import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { syncLogger } from '@/lib/syncLogger'

// Initialize Google Sheets with better error handling
function getGoogleSheetsAuth() {
  const credentialsJson = process.env.GOOGLE_SHEETS
  if (!credentialsJson) {
    throw new Error('GOOGLE_SHEETS environment variable is not set')
  }

  let credentials
  try {
    credentials = JSON.parse(credentialsJson)
  } catch (error) {
    throw new Error(`Failed to parse GOOGLE_SHEETS JSON: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }

  if (!credentials.client_email) {
    throw new Error('GOOGLE_SHEETS credentials missing client_email')
  }

  console.log('Using service account:', credentials.client_email)
  console.log('Project ID:', credentials.project_id)

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
}

// Lazy initialization - only create when needed (not at module load time)
// This prevents deployment failures if env vars aren't available during build
function getGoogleSheetsClient() {
  const auth = getGoogleSheetsAuth()
  return google.sheets({ version: 'v4', auth })
}

// Google Sheet ID from the URL
const SPREADSHEET_ID = '1T8St2f501HDS4X2S5GgxRelMDtoZ2EcSW2nFQhL-AP8'
const SHEET_NAME = 'Activities' // Found in the spreadsheet

/**
 * Convert a row array to an object using headers
 */
function rowToObject(headers: string[], row: any[]): Record<string, any> {
  const obj: Record<string, any> = {}
  headers.forEach((header, index) => {
    const value = row[index]
    // Normalize header names (trim whitespace) to handle variations like 'Serial Number ' vs 'Serial Number'
    const normalizedHeader = header.trim()
    // Convert empty strings to null for consistency
    obj[normalizedHeader] = value === '' ? null : value
  })
  return obj
}

/**
 * Helper function to normalize Serial Number (trim whitespace, handle empty strings)
 */
function normalizeSerialNumber(serialNumber: any): string | null {
  if (!serialNumber) return null
  const normalized = String(serialNumber).trim()
  return normalized === '' ? null : normalized
}

/**
 * Retry helper with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: any
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error
      const isRetryable = 
        error?.code === 429 || // Rate limit
        error?.code === 500 || // Internal server error
        error?.code === 503 || // Service unavailable
        error?.code === 408 || // Request timeout
        error?.message?.includes('timeout') ||
        error?.message?.includes('ECONNRESET') ||
        error?.message?.includes('ETIMEDOUT')
      
      if (!isRetryable || attempt === maxRetries - 1) {
        throw error
      }
      
      const delay = baseDelay * Math.pow(2, attempt)
      syncLogger.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`, { 
        error: error.message,
        code: error.code 
      })
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  throw lastError
}

/**
 * Fetch all data from Google Sheets Activities sheet with retry logic
 */
async function fetchSheetData() {
  return retryWithBackoff(async () => {
    try {
      // Lazy initialization - get client only when needed (not at module load time)
      // This prevents deployment failures if env vars aren't available during build
      const auth = getGoogleSheetsAuth()
      const sheets = google.sheets({ version: 'v4', auth })
      
      // Verify authentication first
      syncLogger.info('Authenticating with Google Sheets API...')
      const authClient = await auth.getClient()
      if (!authClient) {
        throw new Error('Failed to obtain Google Auth client')
      }
      syncLogger.info('Auth client obtained successfully')
      
      // Get access token for debugging (but don't log the token itself)
      const token = await auth.getAccessToken()
      if (!token) {
        throw new Error('Failed to obtain access token')
      }
      syncLogger.info('Access token obtained successfully')
      
      // First, get the sheet metadata to determine the range
      syncLogger.info(`Accessing spreadsheet: ${SPREADSHEET_ID}`)
      const sheetMetadata = await sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID,
      })

      // List all available sheets for debugging
      const availableSheets = sheetMetadata.data.sheets?.map((s) => s.properties?.title) || []
      syncLogger.info(`Available sheets: ${availableSheets.join(', ')}`)

      // Find the activities sheet (try multiple variations)
      let activitiesSheet = sheetMetadata.data.sheets?.find(
        (sheet) => sheet.properties?.title?.toLowerCase() === SHEET_NAME.toLowerCase()
      )

      // If not found, try to find by gid (14343785 from the URL)
      if (!activitiesSheet) {
        activitiesSheet = sheetMetadata.data.sheets?.find(
          (sheet) => sheet.properties?.sheetId === 14343785
        )
      }

      // If still not found, try common variations
      if (!activitiesSheet) {
        activitiesSheet = sheetMetadata.data.sheets?.find(
          (sheet) => sheet.properties?.title?.toLowerCase().includes('activit')
        )
      }

      if (!activitiesSheet) {
        throw new Error(
          `Sheet "${SHEET_NAME}" not found in spreadsheet. Available sheets: ${availableSheets.join(', ')}`
        )
      }

      syncLogger.info(`Found sheet: ${activitiesSheet.properties?.title} (ID: ${activitiesSheet.properties?.sheetId})`)

      const sheetId = activitiesSheet.properties?.sheetId
      const lastRow = activitiesSheet.properties?.gridProperties?.rowCount || 1000
      const lastCol = activitiesSheet.properties?.gridProperties?.columnCount || 50

      // Convert column number to letter (e.g., 1 -> A, 27 -> AA)
      const colToLetter = (col: number): string => {
        let result = ''
        while (col > 0) {
          col--
          result = String.fromCharCode(65 + (col % 26)) + result
          col = Math.floor(col / 26)
        }
        return result
      }

      const range = `${activitiesSheet.properties?.title}!A1:${colToLetter(lastCol)}${lastRow}`
      syncLogger.info(`Fetching data from range: ${range}`)

      // Fetch all data
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range,
      })

      const rows = response.data.values || []
      syncLogger.info(`Received ${rows.length} rows from Google Sheets`)

      if (rows.length === 0) {
        syncLogger.warn('No rows returned from Google Sheets')
        return { headers: [], data: [] }
      }

      // First row is headers
      const headers = rows[0].map((h: string) => h.trim())
      const dataRows = rows.slice(1)
      syncLogger.info(`Processing ${dataRows.length} data rows with ${headers.length} columns`)

      // Convert rows to objects
      const data = dataRows
        .map((row, index) => {
          // Pad row to match header length
          const paddedRow = [...row]
          while (paddedRow.length < headers.length) {
            paddedRow.push('')
          }
          return rowToObject(headers, paddedRow)
        })
        .filter((row) => {
          // Filter out completely empty rows
          return Object.values(row).some((val) => val !== null && val !== '')
        })

      syncLogger.info(`Processed ${data.length} non-empty rows`)
      return { headers, data }
    } catch (error: any) {
      syncLogger.error('Error fetching sheet data', { 
        error: error.message,
        code: error.code,
        response: error.response?.data 
      })
      
      // Provide more helpful error messages
      if (error?.code === 403 || error?.message?.includes('permission') || error?.message?.includes('does not have permission')) {
        const enhancedError = new Error(
          `Permission denied. Please ensure:\n` +
          `1. Google Sheets API is enabled in Google Cloud Console\n` +
          `2. The sheet is shared with the service account email\n` +
          `3. The service account has at least "Viewer" access\n` +
          `Original error: ${error.message}`
        )
        ;(enhancedError as any).code = error.code
        throw enhancedError
      }
      
      if (error?.code === 404) {
        const enhancedError = new Error(`Spreadsheet not found. Check that the spreadsheet ID is correct: ${SPREADSHEET_ID}`)
        ;(enhancedError as any).code = error.code
        throw enhancedError
      }
      
      if (error?.code === 429) {
        const enhancedError = new Error(`Rate limit exceeded. The sync will retry automatically. Original error: ${error.message}`)
        ;(enhancedError as any).code = error.code
        throw enhancedError
      }
      
      if (error?.code === 500 || error?.code === 503) {
        const enhancedError = new Error(`Google Sheets API server error. The sync will retry automatically. Original error: ${error.message}`)
        ;(enhancedError as any).code = error.code
        throw enhancedError
      }
      
      throw error
    }
  }, 3, 2000) // 3 retries with 2s base delay (2s, 4s, 8s)
}

/**
 * Validate all required environment variables
 */
function validateEnvironment() {
  const missing: string[] = []
  
  if (!process.env.GOOGLE_SHEETS) {
    missing.push('GOOGLE_SHEETS')
  }
  
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    missing.push('NEXT_PUBLIC_SUPABASE_URL')
  }
  
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    missing.push('SUPABASE_SERVICE_ROLE_KEY')
  }
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}

/**
 * Sync data from Google Sheets to activities_raw_import table
 */
export async function POST(req: Request) {
  try {
    // Validate environment variables first
    validateEnvironment()

    const syncId = `sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    syncLogger.startSync(syncId)
    syncLogger.info('Starting sync from Google Sheets to activities_raw_import...')

    // Fetch data from Google Sheets (with error handling)
    let headers: string[]
    let data: any[]
    try {
      const sheetData = await fetchSheetData()
      headers = sheetData.headers
      data = sheetData.data
      syncLogger.info(`Fetched ${data.length} rows from Google Sheets`)
    } catch (fetchError) {
      const errorMsg = fetchError instanceof Error ? fetchError.message : 'Unknown error'
      syncLogger.error('Failed to fetch data from Google Sheets', { error: errorMsg })
      throw new Error(`Failed to fetch Google Sheets data: ${errorMsg}`)
    }

    if (data.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No data to sync',
        synced: 0,
      })
    }

    console.log(`Fetched ${data.length} rows from Google Sheets`)

    // Get Supabase admin client (with error handling)
    let supabase
    try {
      supabase = getSupabaseAdmin()
    } catch (supabaseError) {
      const errorMsg = supabaseError instanceof Error ? supabaseError.message : 'Unknown error'
      syncLogger.error('Failed to initialize Supabase admin client', { error: errorMsg })
      throw new Error(`Supabase initialization failed: ${errorMsg}`)
    }

    // Helper function to clean numeric values
    const cleanNumeric = (value: any): number | null => {
      if (value === null || value === undefined || value === '') return null
      const str = String(value).trim()
      if (str === '-' || str === 'N/A' || str.toLowerCase() === 'null') return null
      // Remove commas and other non-numeric characters except decimal point and minus sign
      const cleaned = str.replace(/[^\d.-]/g, '')
      const num = parseFloat(cleaned)
      return isNaN(num) ? null : num
    }

    // Helper function to clean integer values
    const cleanInteger = (value: any): number | null => {
      const num = cleanNumeric(value)
      return num === null ? null : Math.floor(num)
    }

    // Prepare data for insertion - map directly to activities_raw_import table columns
    // The table columns match Google Sheets headers exactly (with spaces and special characters)
    const recordsToInsert = data.map((row, index) => {
      const record: Record<string, any> = {}
      
      // Copy all fields from the Google Sheets row directly
      Object.keys(row).forEach((key) => {
        const value = row[key]
        // Convert empty strings to null for consistency
        record[key] = value === '' ? null : value
      })

      // Clean ALL numeric/integer fields - check every field and clean if it looks numeric
      // First, identify which fields are numeric/integer based on the table schema
      const integerFields = [
        'Target (Ind.)', 'Target (Fam.)', 'Male >18', 'Female >18', 
        'Male <18', 'Female <18', 'Tracker', '# of Base ERR',
        'Volunteers', 'People with special needs', 'Activity Duration',
        'Reporting Duration (End Date to Report)', 'Family', 'Individuals', 'Rate'
      ]
      const numericFields = ['USD', 'SDG']
      
      Object.keys(record).forEach(key => {
        const value = record[key]
        if (value === null || value === undefined || value === '') {
          return
        }
        
        const str = String(value).trim()
        
        // First check for placeholder values and convert to null
        if (str === '-' || str === 'N/A' || str.toLowerCase() === 'null' || str === '') {
          record[key] = null
          return
        }
        
        // Process integer fields - ensure decimals are converted to integers
        if (integerFields.includes(key)) {
          const cleaned = cleanInteger(value)
          // Double-check: if the original value was a decimal string, ensure it's converted
          if (cleaned === null && /\d+\.\d+/.test(str)) {
            // This shouldn't happen if cleanInteger works, but as a safety check
            const num = parseFloat(str.replace(/[^\d.-]/g, ''))
            record[key] = isNaN(num) ? null : Math.floor(num)
          } else {
            record[key] = cleaned
          }
          return
        }
        
        // Process numeric fields
        if (numericFields.includes(key)) {
          record[key] = cleanNumeric(value)
          return
        }
        
        // Additional safety: if a field looks like a number but isn't in our lists,
        // and the database might expect an integer, try to clean it
        // This handles cases where the schema has integer fields we haven't identified
        if (/^\d+\.?\d*$/.test(str) && !/[a-zA-Z]/.test(str)) {
          // It's a pure number - check if it might need to be an integer
          // Some fields like "Family" and "Individuals" might be integers
          if (key.toLowerCase().includes('count') || 
              key.toLowerCase().includes('number') ||
              key.toLowerCase().includes('individual') ||
              key.toLowerCase().includes('family') ||
              key.toLowerCase().includes('male') ||
              key.toLowerCase().includes('female') ||
              key.toLowerCase().includes('target') ||
              key.toLowerCase().includes('tracker') ||
              key.toLowerCase().includes('volunteer') ||
              key.toLowerCase().includes('duration')) {
            record[key] = cleanInteger(value)
          }
        }
      })

      return record
    })

    // Deduplicate within the sync data first - keep the last occurrence of each Serial Number
    // This handles cases where the same Serial Number appears multiple times in the Google Sheet
    const deduplicatedRecords = new Map<string, any>()
    let noSerialCounter = 0
    recordsToInsert.forEach((record) => {
      // Normalize Serial Number before deduplication
      const rawSerialNumber = record['Serial Number']
      const serialNumber = normalizeSerialNumber(rawSerialNumber)
      
      // Update the record with normalized Serial Number
      record['Serial Number'] = serialNumber
      
      if (serialNumber) {
        // Keep the last occurrence (overwrites previous ones)
        deduplicatedRecords.set(serialNumber, record)
      } else {
        // Records without Serial Number are kept as-is (they'll be inserted separately)
        // Use a counter to ensure uniqueness
        noSerialCounter++
        deduplicatedRecords.set(`__no_serial_${noSerialCounter}`, record)
      }
    })
    
    const finalRecordsToInsert = Array.from(deduplicatedRecords.values())
    syncLogger.info(`Deduplicated ${recordsToInsert.length} rows to ${finalRecordsToInsert.length} unique records`)

    // Upsert data in batches
    const batchSize = 100
    let totalSynced = 0
    let errors: any[] = []
    
    for (let i = 0; i < finalRecordsToInsert.length; i += batchSize) {
      const batch = finalRecordsToInsert.slice(i, i + batchSize)
      syncLogger.info(`Processing batch ${Math.floor(i / batchSize) + 1} (${batch.length} rows)...`)

      let insertError: any = null
      let insertedData: any = null

      // Upsert logic: Check for existing records by Serial Number and update, or insert if new
      // Since Serial Number doesn't have a unique constraint, we need to manually check and update
      let batchSynced = 0
      let batchUpdated = 0
      let batchInserted = 0
      
      for (let j = 0; j < batch.length; j++) {
        const record = batch[j]
        const serialNumber = record['Serial Number']
        
        // Normalize Serial Number (should already be normalized, but double-check)
        const normalizedSerialNumber = normalizeSerialNumber(serialNumber)
        record['Serial Number'] = normalizedSerialNumber
        
        if (!normalizedSerialNumber) {
          // If no Serial Number, just insert
          const insertResult = await supabase
            .from('activities_raw_import')
            .insert([record])
            .select()
          
          if (insertResult.error) {
            const errorMsg = insertResult.error.message || ''
            const problematicValue = errorMsg.match(/"[^"]+"/)?.[0] || 'unknown'
            let problematicField = 'unknown'
            
            Object.keys(record || {}).forEach(key => {
              if (String(record[key]) === problematicValue.replace(/"/g, '')) {
                problematicField = key
              }
            })
            
            syncLogger.error(`Row ${j + 1} in batch ${Math.floor(i / batchSize) + 1} failed`, { error: insertResult.error.message })
            errors.push({
              batch: Math.floor(i / batchSize) + 1,
              row: j + 1,
              error: insertResult.error.message,
              code: insertResult.error.code,
              problematic_field: problematicField,
              problematic_value: problematicValue
            })
          } else {
            batchSynced++
            batchInserted++
            totalSynced++
          }
        } else {
          // Check if record with this Serial Number exists (get ALL duplicates)
          // Use case-insensitive matching and trim comparison to catch whitespace variations
          const { data: existingRecords, error: checkError } = await supabase
            .from('activities_raw_import')
            .select('id, "Serial Number"')
            .eq('Serial Number', normalizedSerialNumber)
          
          if (checkError) {
            syncLogger.error(`Error checking for existing record with Serial Number "${normalizedSerialNumber}"`, { error: checkError.message })
            errors.push({
              batch: Math.floor(i / batchSize) + 1,
              row: j + 1,
              error: `Failed to check for existing record: ${checkError.message}`,
              code: checkError.code
            })
            continue
          }
          
          // Also check for records with whitespace variations (case-insensitive, trimmed)
          // This handles edge cases where Serial Numbers have leading/trailing spaces
          const allExistingRecords = existingRecords || []
          
          if (allExistingRecords.length > 0) {
            // Delete all existing records with this Serial Number (including whitespace variations)
            const existingIds = allExistingRecords.map((r: any) => r.id)
            const deleteResult = await supabase
              .from('activities_raw_import')
              .delete()
              .in('id', existingIds)
            
            if (deleteResult.error) {
              syncLogger.error(`Error deleting existing records for Serial Number "${normalizedSerialNumber}"`, { error: deleteResult.error.message })
              errors.push({
                batch: Math.floor(i / batchSize) + 1,
                row: j + 1,
                error: `Failed to delete existing records: ${deleteResult.error.message}`,
                code: deleteResult.error.code
              })
              continue
            }
            
            // Track that we're replacing duplicates
            batchUpdated += allExistingRecords.length
            
            // Store deleted record IDs for potential rollback if insert fails
            const deletedIds = existingIds
          }
          
          // Insert the record (either new or replacing deleted duplicates)
          const insertResult = await supabase
            .from('activities_raw_import')
            .insert([record])
            .select()
          
          if (insertResult.error) {
            const errorMsg = insertResult.error.message || ''
            const problematicValue = errorMsg.match(/"[^"]+"/)?.[0] || 'unknown'
            let problematicField = 'unknown'
            
            Object.keys(record || {}).forEach(key => {
              if (String(record[key]) === problematicValue.replace(/"/g, '')) {
                problematicField = key
              }
            })
            
            syncLogger.error(`Row ${j + 1} in batch ${Math.floor(i / batchSize) + 1} insert failed after deletion`, { 
              error: insertResult.error.message,
              warning: `Records with Serial Number "${normalizedSerialNumber}" were deleted but insertion failed. Data may be lost.`
            })
            
            errors.push({
              batch: Math.floor(i / batchSize) + 1,
              row: j + 1,
              error: insertResult.error.message,
              code: insertResult.error.code,
              problematic_field: problematicField,
              problematic_value: problematicValue,
              warning: 'Records were deleted but insertion failed - data may be lost'
            })
          } else {
            batchSynced++
            batchInserted++
            totalSynced++
          }
        }
      }
      
      syncLogger.info(`Batch ${Math.floor(i / batchSize) + 1}: ${batchSynced}/${batch.length} rows synced (${batchUpdated} updated, ${batchInserted} inserted)`)
    }

    // After syncing all records, delete orphaned records (records in DB but not in Google Sheet)
    syncLogger.info('🧹 Cleaning up orphaned records (records in database but not in Google Sheet)...')
    const sheetSerialNumbers = new Set<string>()
    finalRecordsToInsert.forEach(record => {
      const serialNumber = normalizeSerialNumber(record['Serial Number'])
      if (serialNumber) {
        sheetSerialNumbers.add(serialNumber)
      }
    })

    // Get all Serial Numbers from database
    let allDbSerialNumbers = new Map<string, string[]>() // Map<serialNumber, [ids]>
    let dbPage = 0
    let dbHasMore = true
    const dbPageSize = 1000

    while (dbHasMore) {
      const { data: dbPageData, error: dbFetchError } = await supabase
        .from('activities_raw_import')
        .select('id, "Serial Number"')
        .range(dbPage * dbPageSize, (dbPage + 1) * dbPageSize - 1)

      if (dbFetchError) {
        syncLogger.error('Error fetching database records for cleanup', { error: dbFetchError.message })
        break
      }

      if (!dbPageData || dbPageData.length === 0) {
        dbHasMore = false
      } else {
        dbPageData.forEach(record => {
          const serialNumber = normalizeSerialNumber(record['Serial Number'])
          if (serialNumber) {
            if (!allDbSerialNumbers.has(serialNumber)) {
              allDbSerialNumbers.set(serialNumber, [])
            }
            allDbSerialNumbers.get(serialNumber)!.push(record.id)
          }
        })
        dbHasMore = dbPageData.length === dbPageSize
        dbPage++
      }
    }

    // Find orphaned Serial Numbers (in DB but not in sheet)
    const orphanedSerialNumbers: string[] = []
    allDbSerialNumbers.forEach((ids, serialNumber) => {
      if (!sheetSerialNumbers.has(serialNumber)) {
        orphanedSerialNumbers.push(serialNumber)
      }
    })

    let orphanedDeleted = 0
    if (orphanedSerialNumbers.length > 0) {
      syncLogger.info(`Found ${orphanedSerialNumbers.length} orphaned Serial Numbers to delete`)
      
      for (const orphanedSerial of orphanedSerialNumbers) {
        const orphanedIds = allDbSerialNumbers.get(orphanedSerial) || []
        if (orphanedIds.length > 0) {
          const { error: deleteError } = await supabase
            .from('activities_raw_import')
            .delete()
            .in('id', orphanedIds)
          
          if (deleteError) {
            syncLogger.error(`Error deleting orphaned records for "${orphanedSerial}"`, { error: deleteError.message })
          } else {
            orphanedDeleted += orphanedIds.length
            syncLogger.info(`Deleted ${orphanedIds.length} orphaned record(s) for "${orphanedSerial}"`)
          }
        }
      }
    }

    // Also delete records without Serial Numbers (they can't be matched)
    const { data: recordsWithoutSerial, error: noSerialError } = await supabase
      .from('activities_raw_import')
      .select('id')
      .or('Serial Number.is.null,Serial Number.eq.')
    
    if (!noSerialError && recordsWithoutSerial && recordsWithoutSerial.length > 0) {
      const noSerialIds = recordsWithoutSerial.map(r => r.id)
      const { error: deleteNoSerialError } = await supabase
        .from('activities_raw_import')
        .delete()
        .in('id', noSerialIds)
      
      if (deleteNoSerialError) {
        syncLogger.error('Error deleting records without Serial Numbers', { error: deleteNoSerialError.message })
      } else {
        orphanedDeleted += noSerialIds.length
        syncLogger.info(`Deleted ${noSerialIds.length} record(s) without Serial Numbers`)
      }
    }

    if (orphanedDeleted > 0) {
      syncLogger.success(`Cleaned up ${orphanedDeleted} orphaned records`)
    } else {
      syncLogger.info('No orphaned records found')
    }

    if (errors.length > 0 && totalSynced === 0) {
      throw new Error(`Failed to sync any data. Errors: ${JSON.stringify(errors, null, 2)}`)
    }

    const summary = {
      synced: totalSynced,
      total_rows: data.length,
      deduplicated_rows: finalRecordsToInsert.length,
      orphaned_deleted: orphanedDeleted,
      errors: errors.length,
      syncId
    }

    syncLogger.success(`Successfully synced ${totalSynced} rows to activities_raw_import`, summary)
    syncLogger.endSync(true, summary)

    return NextResponse.json({
      success: true,
      message: `Successfully synced ${totalSynced} rows`,
      ...summary,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    // Safely handle errors - ensure we always return a response
    try {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const errorCode = (error as any)?.code
      const errorDetails = {
        message: errorMessage,
        code: errorCode,
        stack: error instanceof Error ? error.stack : undefined,
      }
      
      // Try to log error, but don't fail if logging fails
      try {
        syncLogger.error('Error syncing activities (POST)', errorDetails)
        syncLogger.endSync(false, errorDetails)
      } catch (logError) {
        // Log to console as fallback
        console.error('Failed to log sync error:', logError)
        console.error('Original error:', error)
      }
      
      // Determine appropriate HTTP status code
      let statusCode = 500
      if (errorCode === 403) statusCode = 403
      else if (errorCode === 404) statusCode = 404
      else if (errorCode === 429) statusCode = 429
      
      return NextResponse.json(
        {
          error: 'Failed to sync activities',
          details: errorMessage,
          code: errorCode,
          timestamp: new Date().toISOString(),
        },
        { status: statusCode }
      )
    } catch (fallbackError) {
      // Ultimate fallback - return basic error response
      console.error('Critical error in error handler:', fallbackError)
      return NextResponse.json(
        {
          error: 'Internal Server Error',
          details: 'An unexpected error occurred during sync',
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      )
    }
  }
}

/**
 * GET endpoint to manually trigger sync (for testing)
 * Also used by cron jobs
 */
export async function GET() {
  try {
    // Validate environment variables first
    validateEnvironment()

    const syncId = `sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    syncLogger.startSync(syncId)
    syncLogger.info('Manual sync triggered via GET request')

    // Fetch data from Google Sheets (with error handling)
    let headers: string[]
    let data: any[]
    try {
      const sheetData = await fetchSheetData()
      headers = sheetData.headers
      data = sheetData.data
      syncLogger.info(`Fetched ${data.length} rows from Google Sheets`)
    } catch (fetchError) {
      const errorMsg = fetchError instanceof Error ? fetchError.message : 'Unknown error'
      syncLogger.error('Failed to fetch data from Google Sheets', { error: errorMsg })
      throw new Error(`Failed to fetch Google Sheets data: ${errorMsg}`)
    }

    if (data.length === 0) {
      syncLogger.warn('No data to sync')
      syncLogger.endSync(true, { synced: 0 })
      return NextResponse.json({
        success: true,
        message: 'No data to sync',
        synced: 0,
      })
    }

    // Get Supabase admin client (with error handling)
    let supabase
    try {
      supabase = getSupabaseAdmin()
    } catch (supabaseError) {
      const errorMsg = supabaseError instanceof Error ? supabaseError.message : 'Unknown error'
      syncLogger.error('Failed to initialize Supabase admin client', { error: errorMsg })
      throw new Error(`Supabase initialization failed: ${errorMsg}`)
    }

    // Prepare data for insertion - map directly to activities_raw_import table columns
    const recordsToInsert = data.map((row, index) => {
      const record: Record<string, any> = {}
      
      // Copy all fields from the Google Sheets row directly
      Object.keys(row).forEach((key) => {
        const value = row[key]
        record[key] = value === '' ? null : value
      })

      // Helper functions for cleaning (same as POST)
      const cleanNumeric = (value: any): number | null => {
        if (value === null || value === undefined || value === '') return null
        const str = String(value).trim()
        if (str === '-' || str === 'N/A' || str.toLowerCase() === 'null') return null
        const cleaned = str.replace(/[^\d.-]/g, '')
        const num = parseFloat(cleaned)
        return isNaN(num) ? null : num
      }

      const cleanInteger = (value: any): number | null => {
        const num = cleanNumeric(value)
        return num === null ? null : Math.floor(num)
      }

      // Clean numeric/integer fields
      const integerFields = [
        'Target (Ind.)', 'Target (Fam.)', 'Male >18', 'Female >18', 
        'Male <18', 'Female <18', 'Tracker', '# of Base ERR',
        'Volunteers', 'People with special needs', 'Activity Duration',
        'Reporting Duration (End Date to Report)', 'Family', 'Individuals', 'Rate'
      ]
      const numericFields = ['USD', 'SDG']
      
      Object.keys(record).forEach(key => {
        const value = record[key]
        if (value === null || value === undefined || value === '') {
          return
        }
        
        const str = String(value).trim()
        
        if (str === '-' || str === 'N/A' || str.toLowerCase() === 'null' || str === '') {
          record[key] = null
          return
        }
        
        if (integerFields.includes(key)) {
          record[key] = cleanInteger(value)
          return
        }
        
        if (numericFields.includes(key)) {
          record[key] = cleanNumeric(value)
          return
        }
      })

      return record
    })

    // Deduplicate within the sync data first - keep the last occurrence of each Serial Number
    // This handles cases where the same Serial Number appears multiple times in the Google Sheet
    const deduplicatedRecords = new Map<string, any>()
    let noSerialCounter = 0
    recordsToInsert.forEach((record) => {
      // Normalize Serial Number before deduplication
      const rawSerialNumber = record['Serial Number']
      const serialNumber = normalizeSerialNumber(rawSerialNumber)
      
      // Update the record with normalized Serial Number
      record['Serial Number'] = serialNumber
      
      if (serialNumber) {
        // Keep the last occurrence (overwrites previous ones)
        deduplicatedRecords.set(serialNumber, record)
      } else {
        // Records without Serial Number are kept as-is (they'll be inserted separately)
        // Use a counter to ensure uniqueness
        noSerialCounter++
        deduplicatedRecords.set(`__no_serial_${noSerialCounter}`, record)
      }
    })
    
    const finalRecordsToInsert = Array.from(deduplicatedRecords.values())
    syncLogger.info(`Deduplicated ${recordsToInsert.length} rows to ${finalRecordsToInsert.length} unique records`)

    // Upsert data in batches
    const batchSize = 100
    let totalSynced = 0
    let errors: any[] = []
    
    for (let i = 0; i < finalRecordsToInsert.length; i += batchSize) {
      const batch = finalRecordsToInsert.slice(i, i + batchSize)
      syncLogger.info(`Processing batch ${Math.floor(i / batchSize) + 1} (${batch.length} rows)...`)

      let insertError: any = null
      let insertedData: any = null

      // Upsert logic: Check for existing records by Serial Number and update, or insert if new
      // Since Serial Number doesn't have a unique constraint, we need to manually check and update
      let batchSynced = 0
      let batchUpdated = 0
      let batchInserted = 0
      
      for (let j = 0; j < batch.length; j++) {
        const record = batch[j]
        const serialNumber = record['Serial Number']
        
        // Normalize Serial Number (should already be normalized, but double-check)
        const normalizedSerialNumber = normalizeSerialNumber(serialNumber)
        record['Serial Number'] = normalizedSerialNumber
        
        if (!normalizedSerialNumber) {
          // If no Serial Number, just insert
          const insertResult = await supabase
            .from('activities_raw_import')
            .insert([record])
            .select()
          
          if (insertResult.error) {
            const errorMsg = insertResult.error.message || ''
            const problematicValue = errorMsg.match(/"[^"]+"/)?.[0] || 'unknown'
            let problematicField = 'unknown'
            
            Object.keys(record || {}).forEach(key => {
              if (String(record[key]) === problematicValue.replace(/"/g, '')) {
                problematicField = key
              }
            })
            
            syncLogger.error(`Row ${j + 1} in batch ${Math.floor(i / batchSize) + 1} failed`, { error: insertResult.error.message })
            errors.push({
              batch: Math.floor(i / batchSize) + 1,
              row: j + 1,
              error: insertResult.error.message,
              code: insertResult.error.code,
              problematic_field: problematicField,
              problematic_value: problematicValue
            })
          } else {
            batchSynced++
            batchInserted++
            totalSynced++
          }
        } else {
          // Check if record with this Serial Number exists (get ALL duplicates)
          // Use case-insensitive matching and trim comparison to catch whitespace variations
          const { data: existingRecords, error: checkError } = await supabase
            .from('activities_raw_import')
            .select('id, "Serial Number"')
            .eq('Serial Number', normalizedSerialNumber)
          
          if (checkError) {
            syncLogger.error(`Error checking for existing record with Serial Number "${normalizedSerialNumber}"`, { error: checkError.message })
            errors.push({
              batch: Math.floor(i / batchSize) + 1,
              row: j + 1,
              error: `Failed to check for existing record: ${checkError.message}`,
              code: checkError.code
            })
            continue
          }
          
          // Also check for records with whitespace variations (case-insensitive, trimmed)
          // This handles edge cases where Serial Numbers have leading/trailing spaces
          const allExistingRecords = existingRecords || []
          
          if (allExistingRecords.length > 0) {
            // Delete all existing records with this Serial Number (including whitespace variations)
            const existingIds = allExistingRecords.map((r: any) => r.id)
            const deleteResult = await supabase
              .from('activities_raw_import')
              .delete()
              .in('id', existingIds)
            
            if (deleteResult.error) {
              syncLogger.error(`Error deleting existing records for Serial Number "${normalizedSerialNumber}"`, { error: deleteResult.error.message })
              errors.push({
                batch: Math.floor(i / batchSize) + 1,
                row: j + 1,
                error: `Failed to delete existing records: ${deleteResult.error.message}`,
                code: deleteResult.error.code
              })
              continue
            }
            
            // Track that we're replacing duplicates
            batchUpdated += allExistingRecords.length
            
            // Store deleted record IDs for potential rollback if insert fails
            const deletedIds = existingIds
          }
          
          // Insert the record (either new or replacing deleted duplicates)
          const insertResult = await supabase
            .from('activities_raw_import')
            .insert([record])
            .select()
          
          if (insertResult.error) {
            const errorMsg = insertResult.error.message || ''
            const problematicValue = errorMsg.match(/"[^"]+"/)?.[0] || 'unknown'
            let problematicField = 'unknown'
            
            Object.keys(record || {}).forEach(key => {
              if (String(record[key]) === problematicValue.replace(/"/g, '')) {
                problematicField = key
              }
            })
            
            syncLogger.error(`Row ${j + 1} in batch ${Math.floor(i / batchSize) + 1} insert failed after deletion`, { 
              error: insertResult.error.message,
              warning: `Records with Serial Number "${normalizedSerialNumber}" were deleted but insertion failed. Data may be lost.`
            })
            
            errors.push({
              batch: Math.floor(i / batchSize) + 1,
              row: j + 1,
              error: insertResult.error.message,
              code: insertResult.error.code,
              problematic_field: problematicField,
              problematic_value: problematicValue,
              warning: 'Records were deleted but insertion failed - data may be lost'
            })
          } else {
            batchSynced++
            batchInserted++
            totalSynced++
          }
        }
      }
      
      syncLogger.info(`Batch ${Math.floor(i / batchSize) + 1}: ${batchSynced}/${batch.length} rows synced (${batchUpdated} updated, ${batchInserted} inserted)`)
    }

    // After syncing all records, delete orphaned records (records in DB but not in Google Sheet)
    syncLogger.info('🧹 Cleaning up orphaned records (records in database but not in Google Sheet)...')
    const sheetSerialNumbers = new Set<string>()
    finalRecordsToInsert.forEach(record => {
      const serialNumber = normalizeSerialNumber(record['Serial Number'])
      if (serialNumber) {
        sheetSerialNumbers.add(serialNumber)
      }
    })

    // Get all Serial Numbers from database
    let allDbSerialNumbers = new Map<string, string[]>() // Map<serialNumber, [ids]>
    let dbPage = 0
    let dbHasMore = true
    const dbPageSize = 1000

    while (dbHasMore) {
      const { data: dbPageData, error: dbFetchError } = await supabase
        .from('activities_raw_import')
        .select('id, "Serial Number"')
        .range(dbPage * dbPageSize, (dbPage + 1) * dbPageSize - 1)

      if (dbFetchError) {
        syncLogger.error('Error fetching database records for cleanup', { error: dbFetchError.message })
        break
      }

      if (!dbPageData || dbPageData.length === 0) {
        dbHasMore = false
      } else {
        dbPageData.forEach(record => {
          const serialNumber = normalizeSerialNumber(record['Serial Number'])
          if (serialNumber) {
            if (!allDbSerialNumbers.has(serialNumber)) {
              allDbSerialNumbers.set(serialNumber, [])
            }
            allDbSerialNumbers.get(serialNumber)!.push(record.id)
          }
        })
        dbHasMore = dbPageData.length === dbPageSize
        dbPage++
      }
    }

    // Find orphaned Serial Numbers (in DB but not in sheet)
    const orphanedSerialNumbers: string[] = []
    allDbSerialNumbers.forEach((ids, serialNumber) => {
      if (!sheetSerialNumbers.has(serialNumber)) {
        orphanedSerialNumbers.push(serialNumber)
      }
    })

    let orphanedDeleted = 0
    if (orphanedSerialNumbers.length > 0) {
      syncLogger.info(`Found ${orphanedSerialNumbers.length} orphaned Serial Numbers to delete`)
      
      for (const orphanedSerial of orphanedSerialNumbers) {
        const orphanedIds = allDbSerialNumbers.get(orphanedSerial) || []
        if (orphanedIds.length > 0) {
          const { error: deleteError } = await supabase
            .from('activities_raw_import')
            .delete()
            .in('id', orphanedIds)
          
          if (deleteError) {
            syncLogger.error(`Error deleting orphaned records for "${orphanedSerial}"`, { error: deleteError.message })
          } else {
            orphanedDeleted += orphanedIds.length
            syncLogger.info(`Deleted ${orphanedIds.length} orphaned record(s) for "${orphanedSerial}"`)
          }
        }
      }
    }

    // Also delete records without Serial Numbers (they can't be matched)
    const { data: recordsWithoutSerial, error: noSerialError } = await supabase
      .from('activities_raw_import')
      .select('id')
      .or('Serial Number.is.null,Serial Number.eq.')
    
    if (!noSerialError && recordsWithoutSerial && recordsWithoutSerial.length > 0) {
      const noSerialIds = recordsWithoutSerial.map(r => r.id)
      const { error: deleteNoSerialError } = await supabase
        .from('activities_raw_import')
        .delete()
        .in('id', noSerialIds)
      
      if (deleteNoSerialError) {
        syncLogger.error('Error deleting records without Serial Numbers', { error: deleteNoSerialError.message })
      } else {
        orphanedDeleted += noSerialIds.length
        syncLogger.info(`Deleted ${noSerialIds.length} record(s) without Serial Numbers`)
      }
    }

    if (orphanedDeleted > 0) {
      syncLogger.success(`Cleaned up ${orphanedDeleted} orphaned records`)
    } else {
      syncLogger.info('No orphaned records found')
    }

    if (errors.length > 0 && totalSynced === 0) {
      throw new Error(`Failed to sync any data. Errors: ${JSON.stringify(errors, null, 2)}`)
    }

    const summary = {
      synced: totalSynced,
      total_rows: data.length,
      deduplicated_rows: finalRecordsToInsert.length,
      orphaned_deleted: orphanedDeleted,
      errors: errors.length,
      syncId
    }

    syncLogger.success(`Successfully synced ${totalSynced} rows to activities_raw_import`, summary)
    syncLogger.endSync(true, summary)

    return NextResponse.json({
      success: true,
      message: `Successfully synced ${totalSynced} rows`,
      ...summary,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    // Safely handle errors - ensure we always return a response
    try {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const errorCode = (error as any)?.code
      const errorDetails = {
        message: errorMessage,
        code: errorCode,
        stack: error instanceof Error ? error.stack : undefined,
      }
      
      // Try to log error, but don't fail if logging fails
      try {
        syncLogger.error('Error syncing activities (GET)', errorDetails)
        syncLogger.endSync(false, errorDetails)
      } catch (logError) {
        // Log to console as fallback
        console.error('Failed to log sync error:', logError)
        console.error('Original error:', error)
      }
      
      // Determine appropriate HTTP status code
      let statusCode = 500
      if (errorCode === 403) statusCode = 403
      else if (errorCode === 404) statusCode = 404
      else if (errorCode === 429) statusCode = 429
      
      return NextResponse.json(
        {
          error: 'Failed to sync activities',
          details: errorMessage,
          code: errorCode,
          timestamp: new Date().toISOString(),
        },
        { status: statusCode }
      )
    } catch (fallbackError) {
      // Ultimate fallback - return basic error response
      console.error('Critical error in error handler:', fallbackError)
      return NextResponse.json(
        {
          error: 'Internal Server Error',
          details: 'An unexpected error occurred during sync',
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      )
    }
  }
}
