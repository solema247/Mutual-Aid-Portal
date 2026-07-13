/**
 * Canonical state names match the `states` table.
 * Source data (allocations FDW, activities_raw_import, etc.) often uses variants.
 */
const STATE_NAME_MAPPINGS: Record<string, string> = {
  'al jazeera': 'Al Jazirah',
  'gadarif': 'Gadaref',
  'sinar': 'Sennar',
  'cross border': 'Cross-border',
  'cross-border': 'Cross-border',
  'northern state': 'Northern',
  'northen': 'Northern',
  'northen state': 'Northern',
}

/**
 * Normalize a free-text state name to the canonical spelling used in `states`.
 * Unknown values are trimmed and returned as-is (or 'Unknown' if empty).
 */
export function normalizeStateName(state: unknown): string {
  if (state == null) return 'Unknown'
  const trimmed = String(state).trim()
  if (trimmed === '') return 'Unknown'

  const mapped = STATE_NAME_MAPPINGS[trimmed.toLowerCase()]
  return mapped ?? trimmed
}
