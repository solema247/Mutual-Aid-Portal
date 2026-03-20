/**
 * Normalize "Project Donor" from activities_raw_import to match grant_id from grants table.
 * e.g. "FCDO SHPR" (space) -> "FCDO-SHPR" (hyphen) so historical amounts map to the correct grant row.
 */
export function normalizeProjectDonorToGrantId(s: string | null | undefined): string {
  if (s == null || typeof s !== 'string') return ''
  return s.trim().replace(/\s+/g, '-')
}
