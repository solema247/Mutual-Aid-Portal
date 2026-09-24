/**
 * Audit Log list total — when exact COUNT(*) can be skipped (Phase 2A).
 * Derived totals are exact for partial/empty pages; full pages still use DB count.
 */

export type AuditLogTotalResolution =
  | { mode: 'derived'; total: number }
  | { mode: 'needs_db_count' }

/**
 * If the current page returned fewer than pageSize rows (or empty page 1),
 * total is exact without a database COUNT.
 */
export function resolveAuditLogListTotalNeed(
  page: number,
  pageSize: number,
  rowCount: number
): AuditLogTotalResolution {
  const safePage = Math.max(1, page)
  const safeSize = Math.max(1, pageSize)

  if (rowCount === 0 && safePage === 1) {
    return { mode: 'derived', total: 0 }
  }
  if (rowCount === 0 && safePage > 1) {
    return { mode: 'needs_db_count' }
  }
  if (rowCount < safeSize) {
    return {
      mode: 'derived',
      total: (safePage - 1) * safeSize + rowCount,
    }
  }
  return { mode: 'needs_db_count' }
}
