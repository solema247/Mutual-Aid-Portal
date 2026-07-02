/**
 * Client-side filtering with AND logic.
 * Can be replaced with server-side fetch when using URL params.
 */

import type { ActiveFilter, FilterFieldConfig } from './types'

export interface ApplyFiltersOptions<T> {
  data: T[]
  filters: ActiveFilter[]
  fields: FilterFieldConfig[]
  getFieldValue: (row: T, fieldId: string) => string | null | undefined
}

/** Apply active filters to data (AND logic). Returns filtered array. */
export function applyFilters<T>({
  data,
  filters,
  fields,
  getFieldValue,
}: ApplyFiltersOptions<T>): T[] {
  if (filters.length === 0) return data

  const activeFilters = filters.filter((f) => {
    const field = fields.find((x) => x.id === f.fieldId)
    const v = f.value
    if (field?.type === 'multi_select' && Array.isArray(v)) {
      return v.some((item) => String(item).trim() !== '')
    }
    if (Array.isArray(v) && field?.type === 'date_range') {
      return v[0]?.trim() || v[1]?.trim()
    }
    return v != null && String(v).trim() !== ''
  })

  if (activeFilters.length === 0) return data

  return data.filter((row) => {
    return activeFilters.every((filter) => {
      const field = fields.find((f) => f.id === filter.fieldId)
      const rowValue = field ? getFieldValue(row, field.id) : undefined
      const raw = rowValue != null ? String(rowValue).trim() : ''

      const filterValue = filter.value

      if (field?.type === 'multi_select' && Array.isArray(filterValue)) {
        const selected = filterValue.map((v) => String(v).trim().toLowerCase()).filter(Boolean)
        if (selected.length === 0) return true
        return selected.includes(raw.toLowerCase())
      }

      if (Array.isArray(filterValue) && field?.type === 'date_range') {
        const [from, to] = filterValue
        if (!from && !to) return true
        const rowDate = raw ? new Date(raw).getTime() : NaN
        if (Number.isNaN(rowDate)) return false
        if (from && rowDate < new Date(from).getTime()) return false
        if (to && rowDate > new Date(to).getTime()) return false
        return true
      }

      const fv = String(filterValue).trim().toLowerCase()
      return fv === '' || raw.toLowerCase() === fv
    })
  })
}
