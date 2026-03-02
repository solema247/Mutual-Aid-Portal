/**
 * Smart Dynamic Filter – production-ready reusable filter component
 *
 * - Add Filter button → dropdown with available fields
 * - Each selected field becomes a chip (label + input + remove)
 * - AND logic, Clear all, URL sync (useSearchParams)
 * - Separate: types, config, SmartFilter, applyFilters for table
 */

export type {
  FilterInputType,
  FilterSelectOption,
  FilterFieldConfig,
  ActiveFilter,
  FilterValues,
  SmartFilterProps,
  UseFilterStateOptions,
} from './types'

export { SmartFilter, parseFiltersFromSearchParams, filtersToSearchParams } from './SmartFilter'
export { FilterChip } from './FilterChip'
export { applyFilters } from './useFilteredData'
export type { FilterChipProps } from './FilterChip'
export type { ApplyFiltersOptions } from './useFilteredData'
export { getReportTrackerFilterFields, STATUS_OPTIONS } from './filter-config'
export { STATUS_DISPLAY, getStatusDisplay } from './status-config'
