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

const PROJECT_STATUS_FALLBACK = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
] as const

function titleCaseStatus(value: string): string {
  return value
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

/** Project Management filter fields: Historical/New, State, Project Date Range, Transfer Date Range, Date Transfer Exists, Project Status, F4 Status, F5 Status, Grant Segment, Grant, Sector, Grant Serial */
export function getProjectManagementFilterFields(options?: {
  stateOptions?: string[]
  localityOptions?: string[]
  projectStatusOptions?: string[]
  f4StatusOptions?: string[]
  f5StatusOptions?: string[]
  grantSegmentOptions?: string[]
  expenseCategoryOptions?: string[]
  grants?: Array<{ id: string; grant_id: string; donor_name: string; project_name: string | null }>
}): FilterFieldConfig[] {
  const stateOptions = (options?.stateOptions ?? []).map((s) => ({ value: s, label: s }))
  const localityOptions = (options?.localityOptions ?? []).map((s) => ({ value: s, label: s }))
  const projectStatusOptions = (options?.projectStatusOptions ?? []).length
    ? (options?.projectStatusOptions ?? []).map((s) => ({ value: s, label: titleCaseStatus(s) }))
    : [...PROJECT_STATUS_FALLBACK]
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
      id: 'locality',
      label: 'Locality',
      type: 'multi_select',
      options: localityOptions,
      placeholder: 'All localities',
      accessorKey: 'locality',
    },
    {
      id: 'date_range',
      label: 'Project Date Range',
      type: 'date_range',
      placeholder: 'From – To',
      accessorKey: 'filter_date',
    },
    {
      id: 'transfer_date_range',
      label: 'Transfer Date Range',
      type: 'date_range',
      placeholder: 'From – To',
      accessorKey: 'date_transfer',
    },
    {
      id: 'date_transfer_exists',
      label: 'Date Transfer Exists',
      type: 'select',
      options: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ],
      placeholder: 'All',
      accessorKey: 'date_transfer',
    },
    {
      id: 'project_status',
      label: 'Project Status',
      type: 'multi_select',
      options: projectStatusOptions,
      placeholder: 'All statuses',
      accessorKey: 'status',
    },
    {
      id: 'f4_status',
      label: 'F4 Status',
      type: 'multi_select',
      options: STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
      placeholder: 'All statuses',
      accessorKey: 'f4_status',
    },
    {
      id: 'f5_status',
      label: 'F5 Status',
      type: 'multi_select',
      options: STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
      placeholder: 'All statuses',
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

/** Distribution decisions table: Decision ID, Date Range, Partner, Restriction, Grant, State */
export function getDistributionDecisionsFilterFields(options?: {
  partnerOptions?: string[]
  restrictionOptions?: string[]
  grantOptions?: string[]
  stateOptions?: string[]
}): FilterFieldConfig[] {
  const partnerOptions = (options?.partnerOptions ?? []).map((s) => ({ value: s, label: s }))
  const restrictionOptions = (options?.restrictionOptions ?? []).map((s) => ({ value: s, label: s }))
  const grantOptions = [
    { value: '__unassigned__', label: 'Unassigned' },
    ...(options?.grantOptions ?? []).map((s) => ({ value: s, label: s })),
  ]
  const stateOptions = (options?.stateOptions ?? []).map((s) => ({ value: s, label: s }))

  return [
    {
      id: 'decision_id',
      label: 'Decision ID',
      type: 'text',
      placeholder: 'Search by decision ID',
      accessorKey: 'decision_id',
    },
    {
      id: 'date_range',
      label: 'Date Range',
      type: 'date_range',
      placeholder: 'From – To',
      accessorKey: 'decision_date',
    },
    {
      id: 'partner',
      label: 'Partner',
      type: 'multi_select',
      options: partnerOptions,
      placeholder: 'All partners',
      accessorKey: 'partner',
    },
    {
      id: 'restriction',
      label: 'Restriction',
      type: 'multi_select',
      options: restrictionOptions,
      placeholder: 'All restrictions',
      accessorKey: 'restriction',
    },
    {
      id: 'grant',
      label: 'Grant',
      type: 'multi_select',
      options: grantOptions,
      placeholder: 'All grants',
      accessorKey: 'grant_name',
    },
    {
      id: 'state',
      label: 'State',
      type: 'multi_select',
      options: stateOptions,
      placeholder: 'All states',
      accessorKey: 'allocated_states',
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
  localityOptions: FilterSelectOption[]
  stateOptions: string[]
  grantOptions: FilterSelectOption[]
  reportStatusOptions: FilterSelectOption[]
  completionOptions: FilterSelectOption[]
  labels: {
    grantId: string
    grantIdPlaceholder: string
    baseRoom: string
    locality: string
    localitySelectStateFirst: string
    state: string
    grant: string
    reportStatus: string
    completion: string
    all: string
  }
}): FilterFieldConfig[] {
  const {
    baseRoomOptions,
    localityOptions,
    stateOptions,
    grantOptions,
    reportStatusOptions,
    completionOptions,
    labels,
  } = options
  return [
    {
      id: 'completion',
      label: labels.completion,
      type: 'select',
      options: completionOptions,
      placeholder: labels.all,
      accessorKey: 'completion',
    },
    {
      id: 'grant_id',
      label: labels.grantId,
      type: 'text',
      placeholder: labels.grantIdPlaceholder,
      accessorKey: 'grant_serial_id',
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
      id: 'locality',
      label: labels.locality,
      type: 'multi_select',
      options: localityOptions,
      placeholder: localityOptions.length ? labels.all : labels.localitySelectStateFirst,
      accessorKey: 'locality',
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

/** F2 uncommitted F1s: Search, State, Date Range */
export function getF2UncommittedFilterFields(options: {
  stateOptions: string[]
  labels: {
    search: string
    searchPlaceholder: string
    state: string
    dateRange: string
    all: string
  }
}): FilterFieldConfig[] {
  const { stateOptions, labels } = options
  return [
    {
      id: 'search',
      label: labels.search,
      type: 'text',
      placeholder: labels.searchPlaceholder,
      accessorKey: 'err_id',
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
      id: 'date_range',
      label: labels.dateRange,
      type: 'date_range',
      placeholder: 'From – To',
      accessorKey: 'date',
    },
  ]
}

/** F2 committed F1s: Search, State, Date Range, Grant, Donor */
export function getF2CommittedFilterFields(options: {
  stateOptions: string[]
  donorOptions: string[]
  grants: Array<{ grant_id: string; donor_name: string; project_name?: string | null }>
  labels: {
    search: string
    searchPlaceholder: string
    state: string
    dateRange: string
    grant: string
    donor: string
    unassignedGrant: string
    all: string
  }
}): FilterFieldConfig[] {
  const { stateOptions, donorOptions, grants, labels } = options
  return [
    {
      id: 'search',
      label: labels.search,
      type: 'text',
      placeholder: labels.searchPlaceholder,
      accessorKey: 'err_id',
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
      id: 'date_range',
      label: labels.dateRange,
      type: 'date_range',
      placeholder: 'From – To',
      accessorKey: 'date',
    },
    {
      id: 'grant',
      label: labels.grant,
      type: 'multi_select',
      options: [
        { value: '__unassigned__', label: labels.unassignedGrant },
        ...grants.map((g) => ({
          value: `${g.grant_id}|${g.donor_name}`,
          label: `${g.grant_id} – ${g.project_name || g.grant_id} (${g.donor_name})`,
        })),
      ],
      placeholder: labels.all,
      accessorKey: 'grant',
    },
    {
      id: 'donor',
      label: labels.donor,
      type: 'multi_select',
      options: donorOptions.map((s) => ({ value: s, label: s })),
      placeholder: labels.all,
      accessorKey: 'donor_name',
    },
  ]
}

/** F5 reporting: F4 fields plus End Activity Status */
export function getF5ReportingFilterFields(options: {
  baseRoomOptions: string[]
  localityOptions: FilterSelectOption[]
  stateOptions: string[]
  grantOptions: FilterSelectOption[]
  reportStatusOptions: FilterSelectOption[]
  endActivityStatusOptions: FilterSelectOption[]
  completionOptions: FilterSelectOption[]
  labels: {
    grantId: string
    grantIdPlaceholder: string
    baseRoom: string
    locality: string
    localitySelectStateFirst: string
    state: string
    grant: string
    reportStatus: string
    endActivityStatus: string
    completion: string
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
        locality: labels.locality,
        localitySelectStateFirst: labels.localitySelectStateFirst,
        state: labels.state,
        grant: labels.grant,
        reportStatus: labels.reportStatus,
        completion: labels.completion,
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

/** User Management: Role, Status, Scope, State, ERR / Room, Partner (all multi-select) */
export function getUserManagementFilterFields(options: {
  stateOptions: FilterSelectOption[]
  errOptions: FilterSelectOption[]
  partnerOptions: FilterSelectOption[]
  roleOptions: FilterSelectOption[]
  labels?: {
    role?: string
    status?: string
    scope?: string
    state?: string
    errRoom?: string
    partner?: string
    active?: string
    suspended?: string
    allStates?: string
    stateScope?: string
    emergencyRoom?: string
    partnerGrant?: string
    noState?: string
  }
}): FilterFieldConfig[] {
  const labels = options.labels ?? {}
  return [
    {
      id: 'role',
      label: labels.role ?? 'Role',
      type: 'multi_select',
      options: options.roleOptions,
      placeholder: 'All roles',
      accessorKey: 'role',
    },
    {
      id: 'status',
      label: labels.status ?? 'Status',
      type: 'multi_select',
      options: [
        { value: 'active', label: labels.active ?? 'Active' },
        { value: 'suspended', label: labels.suspended ?? 'Suspended' },
      ],
      placeholder: 'All statuses',
      accessorKey: 'status',
    },
    {
      id: 'scope',
      label: labels.scope ?? 'Scope',
      type: 'multi_select',
      options: [
        { value: 'all_states', label: labels.allStates ?? 'All States' },
        { value: 'state', label: labels.stateScope ?? 'State' },
        { value: 'emergency_room', label: labels.emergencyRoom ?? 'Emergency Room' },
        { value: 'partner_grant', label: labels.partnerGrant ?? 'Partner / Grant' },
      ],
      placeholder: 'All scopes',
      accessorKey: 'scope',
    },
    {
      id: 'state',
      label: labels.state ?? 'State',
      type: 'multi_select',
      options: [
        { value: 'no_state', label: labels.noState ?? 'No State' },
        ...options.stateOptions,
      ],
      placeholder: 'All states',
      accessorKey: 'state',
    },
    {
      id: 'err',
      label: labels.errRoom ?? 'ERR / Room',
      type: 'multi_select',
      options: options.errOptions,
      placeholder: 'All ERRs',
      accessorKey: 'err_id',
    },
    {
      id: 'partner',
      label: labels.partner ?? 'Partner',
      type: 'multi_select',
      options: options.partnerOptions,
      placeholder: 'All partners',
      accessorKey: 'partner_id',
    },
  ]
}

/** Audit Log filter fields: Action, Actor, Target Type, Date Range */
export function getAuditLogFilterFields(options: {
  actionOptions: FilterSelectOption[]
  actorOptions: FilterSelectOption[]
  targetTypeOptions: FilterSelectOption[]
  labels?: {
    action?: string
    actor?: string
    targetType?: string
    dateRange?: string
  }
}): FilterFieldConfig[] {
  const labels = options.labels ?? {}
  return [
    {
      id: 'action',
      label: labels.action ?? 'Action',
      type: 'multi_select',
      options: options.actionOptions,
      placeholder: 'All actions',
      accessorKey: 'action',
    },
    {
      id: 'actor',
      label: labels.actor ?? 'Actor',
      type: 'multi_select',
      options: options.actorOptions,
      placeholder: 'All actors',
      accessorKey: 'actor',
    },
    {
      id: 'target_type',
      label: labels.targetType ?? 'Target Type',
      type: 'multi_select',
      options: options.targetTypeOptions,
      placeholder: 'All types',
      accessorKey: 'target_type',
    },
    {
      id: 'date_range',
      label: labels.dateRange ?? 'Date Range',
      type: 'date_range',
      placeholder: 'From – To',
      accessorKey: 'created_at',
    },
  ]
}
