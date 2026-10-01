/**
 * Opaque keyset cursors for GET /api/audit-logs (created_at DESC, id DESC).
 * Filters are never embedded in the cursor.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type AuditLogCursorPayload = {
  t: string
  i: string
}

export function isValidAuditLogCursorUuid(id: string): boolean {
  return UUID_RE.test(id)
}

function isParseableTimestamptz(t: string): boolean {
  const ms = Date.parse(t)
  return Number.isFinite(ms)
}

/** Quote values for PostgREST filter grammar (timestamps, etc.). */
export function postgrestFilterValue(raw: string): string {
  if (/[(),]/.test(raw) || raw.includes(':') || raw.includes('+') || raw.includes('.')) {
    return `"${raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  }
  return raw
}

/**
 * OR branch for keyset page after cursor row (exclusive in DESC order).
 * ANDed with all other filters by PostgREST.
 */
export function buildKeysetCursorOrFilter(t: string, id: string): string {
  const tVal = postgrestFilterValue(t)
  const idVal = postgrestFilterValue(id)
  return `created_at.lt.${tVal},and(created_at.eq.${tVal},id.lt.${idVal})`
}

export function encodeAuditLogCursor(createdAt: string, id: string): string {
  const payload: AuditLogCursorPayload = { t: createdAt, i: id }
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

export function decodeAuditLogCursor(token: string): AuditLogCursorPayload | null {
  if (!token || typeof token !== 'string') return null
  try {
    const json = Buffer.from(token, 'base64url').toString('utf8')
    const parsed = JSON.parse(json) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const t = (parsed as AuditLogCursorPayload).t
    const i = (parsed as AuditLogCursorPayload).i
    if (typeof t !== 'string' || typeof i !== 'string') return null
    if (!isValidAuditLogCursorUuid(i)) return null
    if (!isParseableTimestamptz(t)) return null
    return { t, i }
  } catch {
    return null
  }
}

export type AuditLogPaginationMode = 'keyset' | 'keyset_first_page' | 'offset_legacy'

export function resolveAuditLogPaginationMode(
  page: number,
  hasValidCursor: boolean
): AuditLogPaginationMode {
  if (hasValidCursor) return 'keyset'
  if (page <= 1) return 'keyset_first_page'
  return 'offset_legacy'
}
