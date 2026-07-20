/**
 * Canonical state-name normalization (aligned with Project Management /
 * projects_all_activities_view + states table spelling).
 */
const STATE_ALIASES: Record<string, string> = {
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

export function normalizeStateName(state: unknown): string {
  if (state == null) return 'Unknown'
  const trimmed = String(state).trim().replace(/\s+/g, ' ')
  if (!trimmed) return 'Unknown'

  const mapped = STATE_ALIASES[trimmed.toLowerCase()]
  if (mapped) return mapped

  return trimmed
}
