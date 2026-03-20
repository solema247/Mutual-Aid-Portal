/**
 * Escape a value for CSV (quote if contains comma, newline, or double quote).
 */
function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * Build CSV string from an array of row objects. Uses object keys of the first row as headers.
 * Pass customHeaders to override column order and labels.
 */
export function buildCsv<T extends Record<string, unknown>>(
  rows: T[],
  options?: { headers?: [keyof T, string][] }
): string {
  if (rows.length === 0) return ''
  const keys = options?.headers
    ? options.headers.map(([k]) => k)
    : (Object.keys(rows[0]) as (keyof T)[])
  const headerLabels = options?.headers
    ? options.headers.map(([, label]) => label)
    : keys
  const headerRow = headerLabels.map((l) => escapeCsvCell(String(l))).join(',')
  const dataRows = rows.map((row) =>
    keys.map((k) => escapeCsvCell(String(row[k] ?? ''))).join(',')
  )
  return [headerRow, ...dataRows].join('\r\n')
}

/**
 * Trigger browser download of a CSV file.
 */
export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
