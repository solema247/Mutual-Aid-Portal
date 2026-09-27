/** List response summary — counts over the full filtered set (not the current page). */

export type { ReportingListSummary } from './reportingListSummaryShared'
export {
  EMPTY_REPORTING_LIST_SUMMARY,
  parseReportingListSummary,
} from './reportingListSummaryShared'

/** Mirrors `projectStatus.isReportingStatusCompleted`. */
function isReportingStatusCompleted(status: string | null | undefined): boolean {
  return String(status ?? '').trim().toLowerCase() === 'completed'
}

/** Mirrors `listCommon.computeF4ReportStatus` (avoid importing listCommon in this pure module). */
function computeF4ReportStatusForSummary(args: {
  has_f4_report: boolean
  activities_raw_import_id: unknown
  review_status: unknown
  f4_status?: unknown
}): string {
  if (args.activities_raw_import_id) return 'historical'
  if (!args.has_f4_report) {
    const f4Status = args.f4_status != null ? String(args.f4_status).trim().toLowerCase() : null
    if (f4Status === 'completed') return 'complete_no_report'
    return 'not_uploaded'
  }
  const status = String(args.review_status ?? 'pending_review').trim().toLowerCase()
  if (status === 'accepted') return 'accepted'
  if (status === 'rejected') return 'rejected'
  return 'pending_review'
}

import type { ReportingListSummary } from './reportingListSummaryShared'

function normalizeReportingStatus(status: unknown): string {
  const s = String(status ?? 'waiting').trim().toLowerCase()
  if (s === 'under review') return 'in review'
  return s || 'waiting'
}

function isInReviewReportingStatus(status: unknown): boolean {
  return normalizeReportingStatus(status) === 'in review'
}

function isPendingReportingStatus(status: unknown): boolean {
  const s = normalizeReportingStatus(status)
  return s === 'waiting' || s === 'partial'
}

type F4SummaryRow = {
  has_f4_report?: boolean
  f4_status?: string | null
  report_status?: string | null
  activities_raw_import_id?: unknown
  review_status?: string | null
}

type F5SummaryRow = {
  has_f5_report?: boolean
  f5_status?: string | null
  report_status?: string | null
}

function f4ReportStatusForRow(row: F4SummaryRow): string {
  if (row.report_status != null && String(row.report_status).trim() !== '') {
    return String(row.report_status).trim().toLowerCase()
  }
  return computeF4ReportStatusForSummary({
    has_f4_report: row.has_f4_report === true,
    activities_raw_import_id: row.activities_raw_import_id ?? null,
    review_status: row.review_status ?? null,
    f4_status: row.f4_status,
  })
}

function f5ReportStatusForRow(row: F5SummaryRow): string {
  return String(row.report_status ?? '').trim().toLowerCase()
}

export function classifyF4ListRowForSummary(
  row: F4SummaryRow
): 'completed' | 'underReview' | 'notUploaded' | 'other' {
  if (isReportingStatusCompleted(row.f4_status)) return 'completed'
  const reportStatus = f4ReportStatusForRow(row)
  if (reportStatus === 'complete_no_report') return 'completed'
  if (reportStatus === 'not_uploaded' || row.has_f4_report === false) return 'notUploaded'
  if (isInReviewReportingStatus(row.f4_status)) return 'underReview'
  return 'other'
}

export function classifyF5ListRowForSummary(
  row: F5SummaryRow
): 'completed' | 'underReview' | 'notUploaded' | 'other' {
  if (isReportingStatusCompleted(row.f5_status)) return 'completed'
  const reportStatus = f5ReportStatusForRow(row)
  if (reportStatus === 'complete_no_report') return 'completed'
  if (reportStatus === 'not_uploaded' || row.has_f5_report === false) return 'notUploaded'
  if (isInReviewReportingStatus(row.f5_status) || isPendingReportingStatus(row.f5_status)) {
    return 'underReview'
  }
  return 'other'
}

export function computeF4ListSummary(rows: F4SummaryRow[]): ReportingListSummary {
  let completed = 0
  let underReview = 0
  let notUploaded = 0

  for (const row of rows) {
    const bucket = classifyF4ListRowForSummary(row)
    if (bucket === 'completed') completed += 1
    else if (bucket === 'underReview') underReview += 1
    else if (bucket === 'notUploaded') notUploaded += 1
  }

  return {
    total: rows.length,
    completed,
    underReview,
    notUploaded,
  }
}

export function computeF5ListSummary(rows: F5SummaryRow[]): ReportingListSummary {
  let completed = 0
  let underReview = 0
  let notUploaded = 0

  for (const row of rows) {
    const bucket = classifyF5ListRowForSummary(row)
    if (bucket === 'completed') completed += 1
    else if (bucket === 'underReview') underReview += 1
    else if (bucket === 'notUploaded') notUploaded += 1
  }

  return {
    total: rows.length,
    completed,
    underReview,
    notUploaded,
  }
}
