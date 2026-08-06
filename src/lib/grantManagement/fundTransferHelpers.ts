/** Helpers for fund requests / transfer segments / FSPs */

export const TRANSFER_PURPOSES = [
  'ERR Activity Plans',
  'Capacity Building Projects',
  'Lohub Operations',
  'WRR Activity Plans',
  'CHAD',
] as const

export const TRANSFER_STATUSES = ['Received', 'Requested'] as const

export const FSP_STATUSES = ['Contracted', 'Prospect', 'Terminated'] as const

export function transferAmount(
  activityAmount: number | null | undefined,
  feeAmount: number | null | undefined
): number | null {
  const a = activityAmount != null && !Number.isNaN(Number(activityAmount)) ? Number(activityAmount) : null
  const f = feeAmount != null && !Number.isNaN(Number(feeAmount)) ? Number(feeAmount) : null
  if (a == null && f == null) return null
  return (a ?? 0) + (f ?? 0)
}

/**
 * Existing AT pattern: `{YYYY}-{Partner}-{NNN}` e.g. 2025-P2H-030, 2025-Avaaz-07.
 * Next serial = max for that partner+year + 1, zero-padded to at least 3 digits.
 */
export function suggestFundRequestId(
  partnerName: string,
  dateSubmitted: string | null | undefined,
  existingRequestIds: string[]
): string | null {
  const partner = partnerName.trim()
  if (!partner) return null
  const year =
    dateSubmitted && /^\d{4}/.test(dateSubmitted)
      ? dateSubmitted.slice(0, 4)
      : String(new Date().getFullYear())

  const prefix = `${year}-${partner}-`
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`^${escaped}(\\d+)$`, 'i')

  let maxSerial = 0
  let width = 3
  for (const id of existingRequestIds) {
    const m = id.trim().match(re)
    if (!m) continue
    const n = Number(m[1])
    if (!Number.isFinite(n)) continue
    if (n > maxSerial) maxSerial = n
    width = Math.max(width, m[1].length)
  }

  const next = maxSerial + 1
  return `${prefix}${String(next).padStart(width, '0')}`
}

export function normalizeTransferStatus(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  const s = raw.trim()
  if (s === 'Received' || s === 'Requested') return s
  if (s.startsWith('http')) return 'Requested'
  return s
}

/** Mirror AT formula: Partner-YYYYMMDD-Auto */
export function buildTransferId(
  partnerName: string | null | undefined,
  dateSubmitted: string | null | undefined,
  autoNumber: number
): string {
  const partner = (partnerName || 'UNK').replace(/\s+/g, '')
  const d = dateSubmitted ? dateSubmitted.replace(/-/g, '').slice(0, 8) : '00000000'
  return `${partner}-${d}-${autoNumber}`
}

export function parseMoney(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const cleaned = String(v).replace(/[$,]/g, '').trim()
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}
