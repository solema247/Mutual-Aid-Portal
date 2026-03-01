/**
 * Filter field definitions for Report Tracker (and reusable presets).
 * Keep field config separate from UI so it can be shared with server-side or other pages.
 */

import type { FilterFieldConfig } from './types'

export const STATUS_OPTIONS = [
  { value: 'waiting', label: 'Waiting' },
  { value: 'partial', label: 'Partial' },
  { value: 'in review', label: 'Under review' },
  { value: 'completed', label: 'Completed' },
] as const

/** Report Tracker filter fields: Donor, F4 Status, F5 Status, State, Date Range */
export function getReportTrackerFilterFields(options?: {
  stateOptions?: string[]
  donorOptions?: string[]
}): FilterFieldConfig[] {
  const stateOptions = (options?.stateOptions ?? []).map((s) => ({ value: s, label: s }))
  const donorOptions = (options?.donorOptions ?? []).map((d) => ({ value: d, label: d }))

  return [
    {
      id: 'donor',
      label: 'Donor',
      type: 'select',
      options: donorOptions,
      placeholder: 'All donors',
      accessorKey: 'donor',
    },
    {
      id: 'f4_status',
      label: 'F4 Status',
      type: 'select',
      options: STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
      placeholder: 'All',
      accessorKey: 'f4_status',
    },
    {
      id: 'f5_status',
      label: 'F5 Status',
      type: 'select',
      options: STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
      placeholder: 'All',
      accessorKey: 'f5_status',
    },
    {
      id: 'state',
      label: 'State',
      type: 'select',
      options: stateOptions,
      placeholder: 'All states',
      accessorKey: 'state',
    },
    {
      id: 'date_range',
      label: 'Date Range',
      type: 'date_range',
      placeholder: 'From – To',
      accessorKey: 'date',
    },
  ]
}
