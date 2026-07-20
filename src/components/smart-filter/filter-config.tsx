/**
 * Filter field definitions for Report Tracker (and reusable presets).
 * Keep field config separate from UI so it can be shared with server-side or other pages.
 */

import type { FilterFieldConfig, FilterSelectOption } from './types'

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

/** Report Tracker filter fields: Donor, Grant, Grant Segment, F4 Status, F5 Status, State, Date Range, Sector */
export function getReportTrackerFilterFields(options?: {
  stateOptions?: string[]
  donorOptions?: string[]
  expenseCategoryOptions?: string[]
  grants?: Array<{ id: string; grant_id: string; donor_name: string; project_name: string | null }>
}): FilterFieldConfig[] {
  const stateOptions = (options?.stateOptions ?? []).map((s) => ({ value: s, label: s }))
  const donorOptions = (options?.donorOptions ?? []).map((d) => ({ value: d, label: d }))
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
      id: 'donor',
      label: 'Donor',
      type: 'select',
      options: donorOptions,
      placeholder: 'All donors',
      accessorKey: 'donor',
    },
    {
      id: 'grant',
      label: 'Grant',
      type: 'multi_select',
      options: grantOptions,
      placeholder: 'All grants',
      accessorKey: 'grant',
    },
    {
      id: 'grant_segment',
      label: 'Grant Segment',
      type: 'multi_select',
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
      type: 'multi_select',
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
      label: 'Sectors Covered',
      type: 'multi_select',
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
      type: 'multi_select',
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
      type: 'multi_select',
      options: [...(segmentOptions.length ? segmentOptions : GRANT_SEGMENT_OPTIONS.map((o) => ({ value: o.value, label: o.label })))],
      placeholder: 'All segments',
      accessorKey: 'grant_segment',
    },
    {
      id: 'grant',
      label: 'Grant',
      type: 'multi_select',
      options: grantOptions,
      placeholder: 'All grants',
      accessorKey: 'grant',
    },
    {
      id: 'expense_category',
      label: 'Sectors Covered',
      type: 'multi_select',
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

/** F4 / F5 reporting tables: Grant ID (text prefix match), room, State, Donor */
export function getF4F5ReportingFilterFields(options: {
  roomOptions: string[]
  stateOptions: string[]
  donorOptions: string[]
  labels: {
    grantId: string
    grantIdPlaceholder: string
    room: string
    state: string
    donor: string
    all: string
  }
  roomFieldId?: 'base_room' | 'err'
  roomAccessorKey?: 'base_room_name' | 'err_name'
}): FilterFieldConfig[] {
  const {
    roomOptions,
    stateOptions,
    donorOptions,
    labels,
    roomFieldId = 'err',
    roomAccessorKey = 'err_name',
  } = options
  return [
    {
      id: 'grant_id',
      label: labels.grantId,
      type: 'text',
      placeholder: labels.grantIdPlaceholder,
      accessorKey: 'grant_serial_id',
    },
    {
      id: roomFieldId,
      label: labels.room,
      type: 'select',
      options: roomOptions.map((s) => ({ value: s, label: s })),
      placeholder: labels.all,
      accessorKey: roomAccessorKey,
    },
    {
      id: 'state',
      label: labels.state,
      type: 'select',
      options: stateOptions.map((s) => ({ value: s, label: s })),
      placeholder: labels.all,
      accessorKey: 'state',
    },
    {
      id: 'donor',
      label: labels.donor,
      type: 'select',
      options: donorOptions.map((s) => ({ value: s, label: s })),
      placeholder: labels.all,
      accessorKey: 'donor',
    },
  ]
}

/** F3 MOUs list: multi-select filters (state, grant ID incl. unassigned) */
export function getF3MousFilterFields(options: {
  stateOptions: string[]
  grantIdOptions: string[]
  labels: {
    state: string
    grantId: string
    unassignedGrant: string
    all: string
  }
}): FilterFieldConfig[] {
  const { stateOptions, grantIdOptions, labels } = options
  return [
    {
      id: 'state',
      label: labels.state,
      type: 'multi_select',
      options: stateOptions.map((s) => ({ value: s, label: s })),
      placeholder: labels.all,
      accessorKey: 'state',
    },
    {
      id: 'grant_id',
      label: labels.grantId,
      type: 'multi_select',
      options: [
        { value: '__unassigned__', label: labels.unassignedGrant },
        ...grantIdOptions.map((s) => ({ value: s, label: s })),
      ],
      placeholder: labels.all,
      accessorKey: 'grant_id',
    },
  ]
}

/** F4 reporting: multi-select filters + report status */
export function getF4ReportingFilterFields(options: {
  baseRoomOptions: string[]
  stateOptions: string[]
  grantOptions: FilterSelectOption[]
  reportStatusOptions: FilterSelectOption[]
  labels: {
    grantId: string
    grantIdPlaceholder: string
    baseRoom: string
    state: string
    grant: string
    reportStatus: string
    all: string
  }
}): FilterFieldConfig[] {
  const { baseRoomOptions, stateOptions, grantOptions, reportStatusOptions, labels } = options
  return [
    {
      id: 'grant_id',
      label: labels.grantId,
      type: 'text',
      placeholder: labels.grantIdPlaceholder,
      accessorKey: 'grant_serial_id',
    },
    {
      id: 'base_room',
      label: labels.baseRoom,
      type: 'multi_select',
      options: baseRoomOptions.map((s) => ({ value: s, label: s })),
      placeholder: labels.all,
      accessorKey: 'base_room_name',
    },
    {
      id: 'state',
      label: labels.state,
      type: 'multi_select',
      options: stateOptions.map((s) => ({ value: s, label: s })),
      placeholder: labels.all,
      accessorKey: 'state',
    },
    {
      id: 'grant',
      label: labels.grant,
      type: 'multi_select',
      options: grantOptions,
      placeholder: labels.all,
      accessorKey: 'grant_call_id',
    },
    {
      id: 'report_status',
      label: labels.reportStatus,
      type: 'multi_select',
      options: reportStatusOptions,
      placeholder: labels.all,
      accessorKey: 'report_status',
    },
  ]
}

/** F5 reporting: F4 fields plus End Activity Status */
export function getF5ReportingFilterFields(options: {
  baseRoomOptions: string[]
  stateOptions: string[]
  grantOptions: FilterSelectOption[]
  reportStatusOptions: FilterSelectOption[]
  endActivityStatusOptions: FilterSelectOption[]
  labels: {
    grantId: string
    grantIdPlaceholder: string
    baseRoom: string
    state: string
    grant: string
    reportStatus: string
    endActivityStatus: string
    all: string
  }
}): FilterFieldConfig[] {
  const { endActivityStatusOptions, labels, ...shared } = options
  return [
    ...getF4ReportingFilterFields({
      ...shared,
      labels: {
        grantId: labels.grantId,
        grantIdPlaceholder: labels.grantIdPlaceholder,
        baseRoom: labels.baseRoom,
        state: labels.state,
        grant: labels.grant,
        reportStatus: labels.reportStatus,
        all: labels.all,
      },
    }),
    {
      id: 'end_activity_status',
      label: labels.endActivityStatus,
      type: 'multi_select',
      options: endActivityStatusOptions,
      placeholder: labels.all,
      accessorKey: 'end_activity_status',
    },
  ]
}
