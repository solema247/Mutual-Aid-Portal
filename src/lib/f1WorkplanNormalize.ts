/** Shared F1 date normalization (MMYY / ISO -> Postgres date string). */

export function normalizeF1DateForDb (dateStr: string | null | undefined): string | null {
  if (dateStr == null || typeof dateStr !== 'string') return null
  const val = dateStr.trim()
  if (val === '') return null
  if (/^\d{4}$/.test(val)) {
    const mm = val.slice(0, 2)
    const yy = val.slice(2, 4)
    return `20${yy}-${mm}-01`
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val
  return null
}
