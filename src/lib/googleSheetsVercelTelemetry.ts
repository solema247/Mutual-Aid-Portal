/**
 * Structured logs for Google Sheet ↔ portal automations.
 *
 * Vercel: Project → Logs (or Observability). Filter full-text by the stable token
 * `google_sheets_automation`, or parse JSON lines for dashboards / log drains.
 *
 * Each emission is a single JSON object (no pretty-print) for line-based parsers.
 */

export const GOOGLE_SHEETS_LOG_SOURCE = 'google_sheets_automation' as const

export type GoogleSheetsAutomationId =
  | 'fcdo_financial_report'
  | 'activities_sheet_sync'
  | 'f1_grant_sheet_append'

export type GoogleSheetsAutomationEvent = 'start' | 'complete' | 'error'

export type GoogleSheetsAutomationLog = {
  source: typeof GOOGLE_SHEETS_LOG_SOURCE
  automation: GoogleSheetsAutomationId
  event: GoogleSheetsAutomationEvent
  /** ISO timestamp */
  at: string
  /** HTTP method when the automation is triggered via a route */
  http_method?: string
  /** Wall time for the handler */
  duration_ms?: number
  /** Human-readable error (no secrets) */
  error_message?: string
  /** Optional counters / payload for complete events */
  metrics?: Record<string, unknown>
}

function emit(line: string, level: 'log' | 'error') {
  if (level === 'error') {
    console.error(line)
  } else {
    console.log(line)
  }
}

/**
 * Emit one structured line for Vercel log search and external metrics pipelines.
 */
export function logGoogleSheetsAutomation(entry: GoogleSheetsAutomationLog) {
  const line = JSON.stringify({
    ...entry,
    at: entry.at || new Date().toISOString(),
  })
  emit(line, entry.event === 'error' ? 'error' : 'log')
}
