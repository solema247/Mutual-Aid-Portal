/**
 * Allocation-decision ID helpers.
 *
 * Decision:   LCC.AD.{Partner}.{YY-MM-DD}-{serial}
 * Allocation: LCC.AD.{Partner}.{YY-MM-DD}-{01|02|…}
 */

export const AD_ID_PREFIX = 'LCC.AD'

/** Partner segment for IDs: trim, collapse spaces. */
export function partnerCodeForId(partner: string | null | undefined): string | null {
  if (!partner?.trim()) return null
  return partner.trim().replace(/\s+/g, '')
}

/** ISO date (YYYY-MM-DD) → YY-MM-DD */
export function formatAdDateYyMmDd(isoDate: string | null | undefined): string | null {
  if (!isoDate?.trim()) return null
  const m = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  return `${m[1].slice(2)}-${m[2]}-${m[3]}`
}

/** Trailing serial from hyphen-style AD ids: LCC.AD.P2H.26-07-15-63 → 63 */
export function extractAdHyphenSerial(id: string | null | undefined): number | null {
  if (!id) return null
  const m = String(id).trim().match(/^LCC\.AD\.[^.]+\.\d{2}-\d{2}-\d{2}-(\d+)$/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

export function buildAdDecisionId(partner: string, isoDate: string, serial: number): string {
  const code = partnerCodeForId(partner)
  const datePart = formatAdDateYyMmDd(isoDate)
  if (!code || !datePart) {
    throw new Error('Partner and decision date are required to build decision ID')
  }
  return `${AD_ID_PREFIX}.${code}.${datePart}-${serial}`
}

export function buildAdAllocationId(
  partner: string,
  isoDate: string,
  allocSerial: number
): string {
  const code = partnerCodeForId(partner)
  const datePart = formatAdDateYyMmDd(isoDate)
  if (!code || !datePart) {
    throw new Error('Partner and decision date are required to build allocation ID')
  }
  const padded = String(allocSerial).padStart(2, '0')
  return `${AD_ID_PREFIX}.${code}.${datePart}-${padded}`
}

/** User-stated last known hyphen decision serial in the AD series. */
export const AD_DECISION_SERIAL_FLOOR = 63
