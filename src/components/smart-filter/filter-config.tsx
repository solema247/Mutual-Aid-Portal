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

const GRANT_SEGMENT_OPTIONS = [
  { value: 'Flexible', label: 'Flexible' },
  { value: 'Sustainability', label: 'Sustainability' },
  { value: 'WRR', label: 'WRR' },
  { value: 'Capacity Building', label: 'Capacity Building' },
] as const

/** Report Tracker filter fields: Donor, Grant Segment, F4 Status, F5 Status, State, Date Range, Sector */
export function getReportTrackerFilterFields(options?: {
  stateOptions?: string[]
  donorOptions?: string[]
  expenseCategoryOptions?: string[]
}): FilterFieldConfig[] {
  const stateOptions = (options?.stateOptions ?? []).map((s) => ({ value: s, label: s }))
  const donorOptions = (options?.donorOptions ?? []).map((d) => ({ value: d, label: d }))
  const expenseCategoryOptions = (options?.expenseCategoryOptions ?? []).map((c) => ({ value: c, label: c }))

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
      id: 'grant_segment',
      label: 'Grant Segment',
      type: 'select',
      options: [...GRANT_SEGMENT_OPTIONS],
      placeholder: 'All segments',
      accessorKey: 'grant_segment',
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
    {
      id: 'expense_category',
      label: 'Sector',
      type: 'select',
      options: expenseCategoryOptions,
      placeholder: 'All sectors',
      accessorKey: 'expense_category_list',
    },
  ]
}

const HISTORICAL_NEW_OPTIONS = [
  { value: 'historical', label: 'Historical (before 2026)' },
  { value: 'new', label: 'New (2026+)' },
] as const

/** Project Management filter fields: Historical/New, State, Date Range, F4 Status, F5 Status, Grant Segment, Grant, Sector, Grant Serial */
export function getProjectManagementFilterFields(options?: {
  stateOptions?: string[]
  f4StatusOptions?: string[]
  f5StatusOptions?: string[]
  grantSegmentOptions?: string[]
  expenseCategoryOptions?: string[]
  grants?: Array<{ id: string; grant_id: string; donor_name: string; project_name: string | null }>
}): FilterFieldConfig[] {
  const stateOptions = (options?.stateOptions ?? []).map((s) => ({ value: s, label: s }))
  const f4Options = (options?.f4StatusOptions ?? []).map((s) => ({ value: s, label: s }))
  const f5Options = (options?.f5StatusOptions ?? []).map((s) => ({ value: s, label: s }))
  const segmentOptions = (options?.grantSegmentOptions ?? []).map((s) => ({ value: s, label: s }))
  const expenseCategoryOptions = (options?.expenseCategoryOptions ?? []).map((c) => ({ value: c, label: c }))
  const grantOptions = [
    { value: '__unassigned__', label: 'Unassigned' },
    ...(options?.grants ?? []).map((g) => ({
      value: g.id,
      label: `${g.grant_id} – ${g.project_name || g.grant_id} (${g.donor_name})`,
    })),
  ]

  return [
    {
      id: 'historical_new',
      label: 'Historical / New',
      type: 'select',
      options: [...HISTORICAL_NEW_OPTIONS],
      placeholder: 'All',
      accessorKey: 'historical_new',
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
      accessorKey: 'filter_date',
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
      id: 'grant_segment',
      label: 'Grant Segment',
      type: 'select',
      options: [...(segmentOptions.length ? segmentOptions : GRANT_SEGMENT_OPTIONS.map((o) => ({ value: o.value, label: o.label })))],
      placeholder: 'All segments',
      accessorKey: 'grant_segment',
    },
    {
      id: 'grant',
      label: 'Grant',
      type: 'select',
      options: grantOptions,
      placeholder: 'All grants',
      accessorKey: 'grant',
    },
    {
      id: 'expense_category',
      label: 'Sector',
      type: 'select',
      options: expenseCategoryOptions,
      placeholder: 'All sectors',
      accessorKey: 'expense_category_list',
    },
    {
      id: 'grant_serial',
      label: 'Search by Grant Serial',
      type: 'text',
      placeholder: 'Search by serial',
      accessorKey: 'grant_serial_id',
    },
  ]
}
