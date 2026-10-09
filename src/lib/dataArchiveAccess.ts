export const DATA_ARCHIVE_ROLES = new Set(['partner', 'support'])

export function canAccessDataArchive(role: string | null | undefined): boolean {
  return !!role && DATA_ARCHIVE_ROLES.has(role)
}
