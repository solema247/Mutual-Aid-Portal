/** Client-safe list API summary shape and parsing (no server / Supabase imports). */

export type ReportingListSummary = {
  total: number
  completed: number
  underReview: number
  notUploaded: number
}

export const EMPTY_REPORTING_LIST_SUMMARY: ReportingListSummary = {
  total: 0,
  completed: 0,
  underReview: 0,
  notUploaded: 0,
}

/** Normalize list API `summary` (camelCase or legacy snake_case). */
export function parseReportingListSummary(raw: unknown): ReportingListSummary | null {
  if (raw == null || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (!('total' in o) && !('completed' in o) && !('underReview' in o) && !('under_review' in o)) {
    return null
  }
  const toCount = (v: unknown) => {
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 ? n : 0
  }
  return {
    total: toCount(o.total),
    completed: toCount(o.completed),
    underReview: toCount(o.underReview ?? o.under_review),
    notUploaded: toCount(o.notUploaded ?? o.not_uploaded),
  }
}
