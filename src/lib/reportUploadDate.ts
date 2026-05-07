/** Local calendar YYYY-MM-DD for `<input type="date" max />` and comparisons */
export function getTodayDateInputValue(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** If raw is after today (local), returns today; otherwise returns raw (may be empty). */
export function clampDateInputToToday(raw: string): string {
  if (!raw) return ''
  const max = getTodayDateInputValue()
  return raw > max ? max : raw
}

/** Normalize stored/API values to YYYY-MM-DD for date inputs */
export function normalizeReportDateInput(value: unknown): string {
  if (value == null || value === '') return ''
  const s = String(value).trim()
  if (!s) return ''
  const dayPart = s.includes('T') ? s.split('T')[0] : s.slice(0, 10)
  return dayPart.length >= 10 ? dayPart.slice(0, 10) : dayPart
}

/** Non-empty, YYYY-MM-DD, and not after today (local) */
export function isValidReportDate(value: string): boolean {
  const v = normalizeReportDateInput(value)
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  return v <= getTodayDateInputValue()
}
