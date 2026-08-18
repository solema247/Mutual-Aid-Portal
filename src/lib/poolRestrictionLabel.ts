/** Display label when Restriction or Grant Segment is empty. */
export const UNSPECIFIED_RESTRICTION = 'Unspecified'

/**
 * Grouping key for Restriction (allocations) vs Grant Segment (F1s).
 * Equal names match. WRR and WERR are the same programme.
 */
export function normalizeRestrictionLabel(raw: unknown): string {
  const s = String(raw ?? '').trim()
  if (!s) return UNSPECIFIED_RESTRICTION
  const lower = s.toLowerCase()
  if (lower === 'wrr' || lower === 'werr') return 'WRR'
  return s
}
