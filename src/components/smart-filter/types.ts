/**
 * Smart Dynamic Filter – TypeScript types
 * Reusable filter system with AND logic, URL sync, and server-side ready shape.
 */

export type FilterInputType = 'text' | 'select' | 'date' | 'date_range'

export interface FilterSelectOption {
  value: string
  label: string
}

/** Single filter field definition (from config) */
export interface FilterFieldConfig {
  id: string
  label: string
  type: FilterInputType
  /** For type 'select', options list */
  options?: FilterSelectOption[]
  /** Optional placeholder */
  placeholder?: string
  /** Optional accessor key for filtering a row (defaults to id) */
  accessorKey?: string
}

/** One active filter instance (field + value) */
export interface ActiveFilter<V = string | [string, string]> {
  id: string
  fieldId: string
  value: V
}

/** Parsed filter state: fieldId -> value. Used for AND logic and URL. */
export type FilterValues = Record<string, string | [string, string]>

/** Props for the SmartFilter component */
export interface SmartFilterProps {
  /** Available filter fields */
  fields: FilterFieldConfig[]
  /** Current active filters (controlled) */
  filters: ActiveFilter[]
  /** Callback when filters change */
  onFiltersChange: (filters: ActiveFilter[]) => void
  /** Optional: sync with URL search params (param key prefix, e.g. 'f_') */
  urlParamPrefix?: string
  /** Optional: custom class for container */
  className?: string
  /** Optional: show title/count (e.g. "Report Tracker (37)") */
  title?: string
  count?: number
}

/** Props for applying filters to data (client-side) */
export interface UseFilterStateOptions<T> {
  data: T[]
  filters: ActiveFilter[]
  fields: FilterFieldConfig[]
  /** For each row, return the value for a given fieldId (for comparison) */
  getFieldValue: (row: T, fieldId: string) => string | null | undefined
}
