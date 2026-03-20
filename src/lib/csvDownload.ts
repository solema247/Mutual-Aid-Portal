/**
 * Build a CSV string from columns and rows, then trigger a file download.
 */

function escapeCsvValue(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export interface CsvColumn<T = any> {
  key: keyof T | string
  header: string
  format?: (value: any, row: T) => string | number
}

export function downloadCsv<T extends Record<string, any>>(
  columns: CsvColumn<T>[],
  rows: T[],
  filename: string
): void {
  const header = columns.map((c) => escapeCsvValue(c.header)).join(',')
  const body = rows.map((row) =>
    columns
      .map((c) => {
        const raw = row[c.key as keyof T]
        const value = c.format != null ? c.format(raw, row) : raw
        return escapeCsvValue(value)
      })
      .join(',')
  )
  const csv = [header, ...body].join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
}
