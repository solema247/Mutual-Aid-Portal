/**
 * sync_status values for grant-management canonical tables.
 *
 * - legacy: backfilled / pre-Portal_* era; already in Airtable display tables
 * - pending: portal mutation waiting for Portal_* push (or push failed → retry)
 * - synced: successfully pushed to Portal_* raw table
 * - failed: push exhausted retries; needs attention
 */
export const SYNC_STATUS = {
  LEGACY: 'legacy',
  PENDING: 'pending',
  SYNCED: 'synced',
  FAILED: 'failed',
} as const

export type SyncStatus = (typeof SYNC_STATUS)[keyof typeof SYNC_STATUS]

/** Rows eligible for Portal_* push or retry drain. */
export function needsPortalPush(syncStatus: string | null | undefined): boolean {
  return syncStatus === SYNC_STATUS.PENDING || syncStatus === SYNC_STATUS.FAILED
}
