/**
 * Canonical state names match the `states` table.
 * Source data (allocations FDW, activities_raw_import, etc.) often uses variants.
 * Aligned with Project Management / projects_all_activities_view spelling.
 */
const STATE_NAME_MAPPINGS: Record<string, string> = {
  'al jazeera': 'Al Jazirah',
  gezira: 'Al Jazirah',
  gadarif: 'Gadaref',
  sinar: 'Sennar',
  'northern state': 'Northern',
  northen: 'Northern',
  'northen state': 'Northern',
  'cross border': 'Cross-border',
  'cross-border': 'Cross-border',
  'cross borden': 'Cross-border',
}

/**
 * Normalize a free-text state name to the canonical spelling used in `states`.
 * Unknown values are trimmed and returned as-is (or 'Unknown' if empty).
 */
export function normalizeStateName(state: unknown): string {
  if (state == null) return 'Unknown'
  const trimmed = String(state).trim().replace(/\s+/g, ' ')
  if (!trimmed) return 'Unknown'

  const mapped = STATE_NAME_MAPPINGS[trimmed.toLowerCase()]
  return mapped ?? trimmed
}
