'use client'

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'
import { Input } from '@/components/ui/input'
import {
  EMPTY_REPORTING_LIST_SUMMARY,
  parseReportingListSummary,
  type ReportingListSummary,
} from '@/lib/f4f5/reportingListSummaryShared'
import {
  f4SummaryCards,
  f5SummaryCards,
  ReportingSummaryCards,
  ReportingToolbarRefreshIndicator,
} from './ReportingSummaryCards'
import {
  ReportingListPagination,
  type ReportingPaginationPending,
} from './ReportingListPagination'
import {
  REPORTING_EMPTY,
  REPORTING_LOADING,
  REPORTING_PAGE_SECTION,
  REPORTING_PANEL,
  REPORTING_PANEL_TOOLBAR,
  REPORTING_SECTION_TITLE,
  REPORTING_SORT_BUTTON,
  REPORTING_TABLE,
  REPORTING_TABLE_BODY_ROW,
  REPORTING_TABLE_HEADER_ROW,
  REPORTING_TABLE_SCROLL,
} from './reportingTableShell'
import {
  SmartFilter,
  getF4ReportingFilterFields,
  getF5ReportingFilterFields,
  type ActiveFilter,
} from '@/components/smart-filter'
import {
  buildF4ListSearchParams,
  buildF5ListSearchParams,
  parseF4ListQuery,
  parseF5ListQuery,
  type F4SortKey,
  type F5SortKey,
  type SortDirection,
} from '@/lib/f4f5/listQueryParams'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import UploadF4Modal from './components/UploadF4Modal'
import { useTranslation } from 'react-i18next'
import ViewF4Modal from './components/ViewF4Modal'
import UploadF5Modal from './components/UploadF5Modal'
import ViewF5Modal from './components/ViewF5Modal'
import F1ProjectViewerSheet from './components/F1ProjectViewerSheet'
import { useF4F5ReportingPageExplainer } from './F4F5ReportingPageExplainer'
import { useSearchParams, useRouter } from 'next/navigation'
import { Check, CheckCircle2, Eye, FileText, Loader2, XCircle } from 'lucide-react'
import { getStatusDisplay } from '@/components/smart-filter/status-config'
import { isReportingStatusCompleted } from '@/lib/projectStatus'
import {
  deriveLocationChipOptions,
  sanitizeLocationActiveFilters,
  sanitizeLocationListFilters,
  type LocalityFilterOption,
  type RoomFilterOption,
} from '@/lib/f4f5/locationFilterMeta'
interface F4Row {
  id: number | null
  project_id: string | null
  err_id: string | null
  base_room_name?: string | null
  err_name?: string | null
  state?: string | null
  donor?: string | null
  payment_date?: string | null
  amount_sdg?: number | null
  exchange_rate?: number | null
  report_date: string | null
  total_grant: number | null
  total_expenses: number | null
  remainder: number | null
  attachments_count: number
  updated_at: string | null
  review_status?: string | null
  review_comment?: string | null
  reviewed_at?: string | null
  grant_serial_id?: string | null
  grant_id?: string | null
  /** grants_grid_view.grant_id via err_projects.grant_grid_id */
  grant_call_id?: string | null
  grant_name?: string | null
  report_status?: string | null
  has_f4_report?: boolean
  f4_status?: string | null
  /** Set for tracker/historical rows; review workflow does not apply */
  activities_raw_import_id?: string | null
}

interface F5Row {
  id: string | null
  project_id: string | null
  err_id?: string | null
  base_room_name?: string | null
  err_name?: string | null
  grant_serial_id?: string | null
  grant_id?: string | null
  /** grants_grid_view.grant_id via err_projects.grant_grid_id */
  grant_call_id?: string | null
  grant_name?: string | null
  state?: string | null
  donor?: string | null
  payment_date?: string | null
  amount_sdg?: number | null
  exchange_rate?: number | null
  report_date: string | null
  activities_count: number
  updated_at: string | null
  report_status?: string | null
  has_f5_report?: boolean
  f5_status?: string | null
  /** complete = uploaded with ≥1 activity end_date; missing = uploaded without; null = not uploaded */
  end_activity_status?: 'complete' | 'missing' | null
}

type ListPagination = {
  page: number
  pageSize: number
  total: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

type FilterMeta = {
  baseRooms: string[]
  states: string[]
  grants: { value: string; label: string }[]
  localities: LocalityFilterOption[]
  rooms: RoomFilterOption[]
}

function locationMetaFromFilterMeta(meta: FilterMeta) {
  return {
    localities: meta.localities ?? [],
    rooms: meta.rooms ?? [],
  }
}

function f4RowCanAccept(r: F4Row): boolean {
  const hasReport = r.has_f4_report !== false && r.id != null
  if (!hasReport || r.activities_raw_import_id) return false
  if (r.review_status === 'accepted' || r.review_status === 'rejected') return false
  const rs = String(r.report_status ?? '').toLowerCase()
  if (rs === 'not_uploaded' || rs === 'complete_no_report' || rs === 'historical') return false
  return true
}

function grantIdTableText(r: { grant_serial_id?: string | null; grant_id?: string | null }) {
  const v = r.grant_serial_id ?? r.grant_id
  if (v == null || String(v).trim() === '') return '-'
  return String(v).trim()
}

function formatMoneyTwoDecimals(n: number | null | undefined) {
  return Number(n ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function reportingStatusChipLabel(status: string | null | undefined): string {
  const s = String(status ?? 'waiting').trim().toLowerCase()
  if (s === 'completed') return 'Done'
  if (s === 'in review' || s === 'under review') return 'In review'
  if (s === 'partial') return 'Partial'
  return 'Waiting'
}

function ReportingStatusChip({ status }: { status: string | null | undefined }) {
  const normalized = String(status ?? 'waiting').trim().toLowerCase() || 'waiting'
  const display = getStatusDisplay(normalized === 'under review' ? 'in review' : normalized)
  return (
    <span
      className="inline-flex h-6 max-w-full shrink-0 items-center truncate rounded-md border px-2 text-[10px] font-semibold leading-none"
      style={{ backgroundColor: display.pillBg, color: display.pillText, borderColor: 'transparent' }}
    >
      {reportingStatusChipLabel(normalized)}
    </span>
  )
}

function F4F5ReportingPageContent() {
  const { t } = useTranslation(['f4f5', 'common'])
  const searchParams = useSearchParams()
  const router = useRouter()
  const { can, isLoading: permissionsLoading } = useAllowedFunctions()
  const canViewPage = can('f4_f5_view_page')
  const canUploadF4 = can('f4_upload')
  const canUploadF5 = can('f5_upload')
  const canViewF4 = can('f4_view_report')
  const canViewF5 = can('f5_view_report')
  const canReviewF4 = can('f4_review')
  const canEditReportingStatus = can('management_edit_reporting_status')
  const [tab, setTab] = useState<'f4'|'f5'>('f4')
  const [rows, setRows] = useState<F4Row[]>([])
  const [loading, setLoading] = useState(false)
  const [f4Filters, setF4Filters] = useState<ActiveFilter[]>([])
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadProjectId, setUploadProjectId] = useState<string | null>(null)
  const [viewId, setViewId] = useState<number | null>(null)
  const [viewOpen, setViewOpen] = useState(false)
  const [rejectSummaryId, setRejectSummaryId] = useState<number | null>(null)
  const [acceptSummaryId, setAcceptSummaryId] = useState<number | null>(null)
  const [rejectComment, setRejectComment] = useState('')
  const [reviewSaving, setReviewSaving] = useState(false)
  const [f1ViewerOpen, setF1ViewerOpen] = useState(false)
  const [f1ViewerProjectId, setF1ViewerProjectId] = useState<string | null>(null)
  const [markCompleteSavingId, setMarkCompleteSavingId] = useState<string | null>(null)
  const [confirmMarkComplete, setConfirmMarkComplete] = useState<{
    projectId: string
    field: 'f4_status' | 'f5_status'
  } | null>(null)

  // F5 state
  const [f5Rows, setF5Rows] = useState<F5Row[]>([])
  const [f5Loading, setF5Loading] = useState(false)
  const [f5Filters, setF5Filters] = useState<ActiveFilter[]>([])
  const [uploadF5Open, setUploadF5Open] = useState(false)
  const [uploadF5ProjectId, setUploadF5ProjectId] = useState<string | null>(null)
  const [viewF5Id, setViewF5Id] = useState<string | null>(null)
  const [viewF5Open, setViewF5Open] = useState(false)
  const [f4Pagination, setF4Pagination] = useState<ListPagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  })
  const [f5Pagination, setF5Pagination] = useState<ListPagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  })
  const [f4FilterMeta, setF4FilterMeta] = useState<FilterMeta>({
    baseRooms: [],
    states: [],
    grants: [],
    localities: [],
    rooms: [],
  })
  const [f5FilterMeta, setF5FilterMeta] = useState<FilterMeta>({
    baseRooms: [],
    states: [],
    grants: [],
    localities: [],
    rooms: [],
  })
  const [f4Summary, setF4Summary] = useState<ReportingListSummary | null>(null)
  const [f5Summary, setF5Summary] = useState<ReportingListSummary | null>(null)
  /** f5ListKey last served successfully by GET /api/f5/list (tab-switch dedup only) */
  const f5LoadedListKeyRef = useRef<string | null>(null)
  const f4FetchGenerationRef = useRef(0)
  const f5FetchGenerationRef = useRef(0)
  const f4PaginationLockRef = useRef(false)
  const f5PaginationLockRef = useRef(false)
  const [f4PaginationPending, setF4PaginationPending] = useState<ReportingPaginationPending>(null)
  const [f5PaginationPending, setF5PaginationPending] = useState<ReportingPaginationPending>(null)

  const f4Query = useMemo(() => parseF4ListQuery(searchParams), [searchParams])
  const f5Query = useMemo(() => parseF5ListQuery(searchParams), [searchParams])
  const f4ListKey = useMemo(() => buildF4ListSearchParams(f4Query), [f4Query])
  const f5ListKey = useMemo(() => buildF5ListSearchParams(f5Query), [f5Query])

  const patchUrlParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') params.delete(key)
        else params.set(key, value)
      }
      const qs = params.toString()
      router.replace(qs ? `?${qs}` : '/err-portal/f4-f5-reporting', { scroll: false })
    },
    [router, searchParams]
  )

  const beginF4Pagination = useCallback(
    (pending: ReportingPaginationPending, updates: Record<string, string | null>) => {
      if (f4PaginationLockRef.current) return
      f4PaginationLockRef.current = true
      setF4PaginationPending(pending)
      patchUrlParams(updates)
    },
    [patchUrlParams]
  )

  const beginF5Pagination = useCallback(
    (pending: ReportingPaginationPending, updates: Record<string, string | null>) => {
      if (f5PaginationLockRef.current) return
      f5PaginationLockRef.current = true
      setF5PaginationPending(pending)
      patchUrlParams(updates)
    },
    [patchUrlParams]
  )

  const load = useCallback(async () => {
    const fetchGeneration = ++f4FetchGenerationRef.current
    try {
      setLoading(true)
      const res = await fetch(`/api/f4/list?${f4ListKey}`, { cache: 'no-store' })
      if (fetchGeneration !== f4FetchGenerationRef.current) return
      if (!res.ok) throw new Error('failed list')
      const body = await res.json()
      if (fetchGeneration !== f4FetchGenerationRef.current) return
      setRows(body.data ?? [])
      if (body.pagination) setF4Pagination(body.pagination)
      if (body.filterMeta) {
        setF4FilterMeta({
          baseRooms: body.filterMeta.baseRooms ?? [],
          states: body.filterMeta.states ?? [],
          grants: body.filterMeta.grants ?? [],
          localities: body.filterMeta.localities ?? [],
          rooms: body.filterMeta.rooms ?? [],
        })
      }
      const parsedSummary = parseReportingListSummary(body.summary)
      if (parsedSummary !== null) {
        setF4Summary(parsedSummary)
      } else if (typeof body.pagination?.total === 'number') {
        setF4Summary({ ...EMPTY_REPORTING_LIST_SUMMARY, total: body.pagination.total })
      }
    } catch {
      /* list load failed — keep prior rows */
    } finally {
      if (fetchGeneration === f4FetchGenerationRef.current) {
        setLoading(false)
        f4PaginationLockRef.current = false
        setF4PaginationPending(null)
      }
    }
  }, [f4ListKey])

  const loadF5 = useCallback(async (options?: { force?: boolean }) => {
    const force = options?.force ?? false
    if (!force && f5LoadedListKeyRef.current === f5ListKey) {
      return
    }
    const fetchGeneration = ++f5FetchGenerationRef.current
    try {
      setF5Loading(true)
      const res = await fetch(`/api/f5/list?${f5ListKey}`, { cache: 'no-store' })
      if (fetchGeneration !== f5FetchGenerationRef.current) return
      if (!res.ok) throw new Error('failed f5 list')
      const body = await res.json()
      if (fetchGeneration !== f5FetchGenerationRef.current) return
      setF5Rows(body.data ?? [])
      if (body.pagination) setF5Pagination(body.pagination)
      if (body.filterMeta) {
        setF5FilterMeta({
          baseRooms: body.filterMeta.baseRooms ?? [],
          states: body.filterMeta.states ?? [],
          grants: body.filterMeta.grants ?? [],
          localities: body.filterMeta.localities ?? [],
          rooms: body.filterMeta.rooms ?? [],
        })
      }
      const parsedSummary = parseReportingListSummary(body.summary)
      if (parsedSummary !== null) {
        setF5Summary(parsedSummary)
      } else if (typeof body.pagination?.total === 'number') {
        setF5Summary({ ...EMPTY_REPORTING_LIST_SUMMARY, total: body.pagination.total })
      }
      f5LoadedListKeyRef.current = f5ListKey
    } catch {
      /* F5 list load failed — do not mark key loaded; keep prior rows */
    } finally {
      if (fetchGeneration === f5FetchGenerationRef.current) {
        setF5Loading(false)
        f5PaginationLockRef.current = false
        setF5PaginationPending(null)
      }
    }
  }, [f5ListKey])

  const refreshF5 = useCallback(() => loadF5({ force: true }), [loadF5])

  const submitReview = async (summaryId: number, status: 'accepted' | 'rejected', comment?: string) => {
    setReviewSaving(true)
    try {
      const res = await fetch(`/api/f4/summary/${summaryId}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, comment: comment || '' })
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed')
      setRejectSummaryId(null)
      setAcceptSummaryId(null)
      setRejectComment('')
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Review failed')
    } finally {
      setReviewSaving(false)
    }
  }

  const markCompleteReportingStatus = async (
    projectId: string,
    field: 'f4_status' | 'f5_status',
  ) => {
    if (!projectId || projectId.startsWith('historical_')) return
    setMarkCompleteSavingId(`${field}:${projectId}`)
    try {
      const res = await fetch(`/api/projects/${projectId}/reporting-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: 'completed' }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed')
      setConfirmMarkComplete(null)
      if (field === 'f4_status') await load()
      else await refreshF5()
    } catch {
      /* mark complete failed */
    } finally {
      setMarkCompleteSavingId(null)
    }
  }

  useEffect(() => {
    if (!canViewPage) {
      router.replace('/err-portal')
    }
  }, [canViewPage, router])

  useEffect(() => {
    if (!canViewPage) return
    load()
  }, [canViewPage, load])

  useEffect(() => {
    if (!canViewPage || tab !== 'f5') return
    loadF5()
  }, [canViewPage, tab, loadF5])

  const f4Sort = useMemo(
    () => ({ key: f4Query.sortBy, dir: f4Query.sortDir }),
    [f4Query.sortBy, f4Query.sortDir]
  )
  const f5Sort = useMemo(
    () => ({ key: f5Query.sortBy, dir: f5Query.sortDir }),
    [f5Query.sortBy, f5Query.sortDir]
  )

  const completionFilterOptions = useMemo(
    () => [
      { value: 'active', label: t('f4.filters.completion_active') },
      { value: 'completed', label: t('f4.filters.completion_completed') },
      { value: 'all', label: t('f4.filters.completion_all') },
    ],
    [t]
  )

  const f4ReportStatusOptions = useMemo(
    () => [
      { value: 'not_uploaded', label: t('f4.report_status.not_uploaded') },
      { value: 'complete_no_report', label: t('f4.report_status.complete_no_report') },
      { value: 'pending_review', label: t('f4.report_status.pending_review') },
      { value: 'accepted', label: t('f4.report_status.accepted') },
      { value: 'rejected', label: t('f4.report_status.rejected') },
      { value: 'historical', label: t('f4.report_status.historical') },
    ],
    [t]
  )

  const f4DerivedLocation = useMemo(
    () =>
      deriveLocationChipOptions(
        locationMetaFromFilterMeta(f4FilterMeta),
        f4Query.filters.states,
        f4Query.filters.localities
      ),
    [f4FilterMeta, f4Query.filters.states, f4Query.filters.localities]
  )

  const f4ChipOptionsByFieldId = useMemo(
    () => ({
      locality: f4DerivedLocation.locality,
      base_room: f4DerivedLocation.base_room,
    }),
    [f4DerivedLocation]
  )

  const f4FilterFields = useMemo(
    () =>
      getF4ReportingFilterFields({
        baseRoomOptions: f4DerivedLocation.base_room.map((o) => o.value),
        localityOptions: f4DerivedLocation.locality,
        stateOptions: f4FilterMeta.states,
        grantOptions: f4FilterMeta.grants,
        reportStatusOptions: f4ReportStatusOptions,
        completionOptions: completionFilterOptions,
        labels: {
          grantId: t('f4.filters.grant_id'),
          grantIdPlaceholder: t('f4.filters.grant_id_placeholder'),
          baseRoom: t('f4.filters.base_room'),
          locality: t('f4.filters.locality'),
          localitySelectStateFirst: t('f4.filters.locality_select_state_first'),
          state: t('f4.filters.state'),
          grant: t('f4.filters.grant'),
          reportStatus: t('f4.filters.report_status'),
          completion: t('f4.filters.completion'),
          all: t('f4.filters.all'),
        },
      }),
    [f4FilterMeta.states, f4FilterMeta.grants, f4DerivedLocation, f4ReportStatusOptions, completionFilterOptions, t]
  )

  const f5ReportStatusOptions = useMemo(
    () => [
      { value: 'not_uploaded', label: t('f5.report_status.not_uploaded') },
      { value: 'complete_no_report', label: t('f5.report_status.complete_no_report') },
      { value: 'uploaded', label: t('f5.report_status.uploaded') },
    ],
    [t]
  )
  const f5EndActivityStatusOptions = useMemo(
    () => [
      { value: 'complete', label: t('f5.end_activity_status.complete') },
      { value: 'missing', label: t('f5.end_activity_status.missing') },
    ],
    [t]
  )

  const f5DerivedLocation = useMemo(
    () =>
      deriveLocationChipOptions(
        locationMetaFromFilterMeta(f5FilterMeta),
        f5Query.filters.states,
        f5Query.filters.localities
      ),
    [f5FilterMeta, f5Query.filters.states, f5Query.filters.localities]
  )

  const f5ChipOptionsByFieldId = useMemo(
    () => ({
      locality: f5DerivedLocation.locality,
      base_room: f5DerivedLocation.base_room,
    }),
    [f5DerivedLocation]
  )

  const f5FilterFields = useMemo(
    () =>
      getF5ReportingFilterFields({
        baseRoomOptions: f5DerivedLocation.base_room.map((o) => o.value),
        localityOptions: f5DerivedLocation.locality,
        stateOptions: f5FilterMeta.states,
        grantOptions: f5FilterMeta.grants,
        reportStatusOptions: f5ReportStatusOptions,
        endActivityStatusOptions: f5EndActivityStatusOptions,
        completionOptions: completionFilterOptions.map((o) => ({
          ...o,
          label:
            o.value === 'active'
              ? t('f5.filters.completion_active')
              : o.value === 'completed'
                ? t('f5.filters.completion_completed')
                : t('f5.filters.completion_all'),
        })),
        labels: {
          grantId: t('f5.filters.grant_id'),
          grantIdPlaceholder: t('f5.filters.grant_id_placeholder'),
          baseRoom: t('f5.filters.base_room'),
          locality: t('f5.filters.locality'),
          localitySelectStateFirst: t('f5.filters.locality_select_state_first'),
          state: t('f5.filters.state'),
          grant: t('f5.filters.grant'),
          reportStatus: t('f5.filters.report_status'),
          endActivityStatus: t('f5.filters.end_activity_status'),
          completion: t('f5.filters.completion'),
          all: t('f5.filters.all'),
        },
      }),
    [f5FilterMeta.states, f5FilterMeta.grants, f5DerivedLocation, f5ReportStatusOptions, f5EndActivityStatusOptions, completionFilterOptions, t]
  )

  const openViewF1 = useCallback((projectId: string | null) => {
    if (!projectId || projectId.startsWith('historical_')) return
    setF1ViewerProjectId(projectId)
    setF1ViewerOpen(true)
  }, [])

  const onF4FiltersChange = useCallback(
    (filters: ActiveFilter[]) => {
      const sanitized = sanitizeLocationActiveFilters(filters, locationMetaFromFilterMeta(f4FilterMeta))
      setF4Filters(sanitized)
      patchUrlParams({ f4p_page: '1' })
    },
    [patchUrlParams, f4FilterMeta]
  )

  const onF5FiltersChange = useCallback(
    (filters: ActiveFilter[]) => {
      const sanitized = sanitizeLocationActiveFilters(filters, locationMetaFromFilterMeta(f5FilterMeta))
      setF5Filters(sanitized)
      patchUrlParams({ f5p_page: '1' })
    },
    [patchUrlParams, f5FilterMeta]
  )

  useEffect(() => {
    const locMeta = locationMetaFromFilterMeta(f4FilterMeta)
    if (locMeta.localities.length === 0 && locMeta.rooms.length === 0) return
    const { localities, baseRooms, changed } = sanitizeLocationListFilters(
      {
        states: f4Query.filters.states,
        localities: f4Query.filters.localities,
        baseRooms: f4Query.filters.baseRooms,
      },
      locMeta
    )
    if (!changed) return
    patchUrlParams({
      f4f_locality: localities.length ? localities.join('|') : null,
      f4f_base_room: baseRooms.length ? baseRooms.join('|') : null,
    })
  }, [f4FilterMeta, f4Query.filters.states, f4Query.filters.localities, f4Query.filters.baseRooms, patchUrlParams])

  useEffect(() => {
    const locMeta = locationMetaFromFilterMeta(f5FilterMeta)
    if (locMeta.localities.length === 0 && locMeta.rooms.length === 0) return
    const { localities, baseRooms, changed } = sanitizeLocationListFilters(
      {
        states: f5Query.filters.states,
        localities: f5Query.filters.localities,
        baseRooms: f5Query.filters.baseRooms,
      },
      locMeta
    )
    if (!changed) return
    patchUrlParams({
      f5f_locality: localities.length ? localities.join('|') : null,
      f5f_base_room: baseRooms.length ? baseRooms.join('|') : null,
    })
  }, [f5FilterMeta, f5Query.filters.states, f5Query.filters.localities, f5Query.filters.baseRooms, patchUrlParams])

  const toggleF4Sort = (key: F4SortKey) => {
    const dir: SortDirection =
      f4Sort.key === key ? (f4Sort.dir === 'asc' ? 'desc' : 'asc') : 'asc'
    patchUrlParams({ f4p_sortBy: key, f4p_sortDir: dir, f4p_page: '1' })
  }

  const toggleF5Sort = (key: F5SortKey) => {
    const dir: SortDirection =
      f5Sort.key === key ? (f5Sort.dir === 'asc' ? 'desc' : 'asc') : 'asc'
    patchUrlParams({ f5p_sortBy: key, f5p_sortDir: dir, f5p_page: '1' })
  }

  const sortIndicator = (active: boolean, dir: SortDirection) => (active ? (dir === 'asc' ? '▲' : '▼') : '↕')

  // Handle restore from minimized across pages and when search params change
  useEffect(() => {
    const restore = searchParams.get('restore')
    const localRestore = (typeof window !== 'undefined') ? window.localStorage.getItem('err_restore') : null

    const target = restore || localRestore || null
    if (target === 'f4') {
      // Ensure F4 tab is active so modal component is mounted
      setTab('f4')
      setUploadOpen(true)
      if (restore) router.replace('/err-portal/f4-f5-reporting')
      try { window.localStorage.removeItem('err_restore') } catch {}
    } else if (target === 'f5') {
      // Ensure F5 tab is active so modal component is mounted
      setTab('f5')
      setUploadF5Open(true)
      if (restore) router.replace('/err-portal/f4-f5-reporting')
      try { window.localStorage.removeItem('err_restore') } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const f4InitialLoading = loading && rows.length === 0
  const f4Refreshing = loading && rows.length > 0
  const f5InitialLoading = f5Loading && f5Rows.length === 0
  const f5Refreshing = f5Loading && f5Rows.length > 0

  useF4F5ReportingPageExplainer(!permissionsLoading && canViewPage && !f4InitialLoading)

  if (!canViewPage) return null

  return (
    <div className={REPORTING_PAGE_SECTION}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t('explainer_title')}
          </h1>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {t('explainer_intro')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {tab === 'f4' && canUploadF4 && (
            <Button
              size="sm"
              onClick={() => {
                try {
                  window.localStorage.removeItem('err_minimized_modal')
                  window.localStorage.removeItem('err_minimized_payload')
                  window.localStorage.removeItem('err_restore')
                  window.dispatchEvent(new CustomEvent('err_minimized_modal_change'))
                } catch {}
                setUploadProjectId(null)
                setUploadOpen(true)
              }}
            >
              {t('f4.upload')}
            </Button>
          )}
          {tab === 'f5' && canUploadF5 && (
            <Button
              size="sm"
              onClick={() => {
                try {
                  window.localStorage.removeItem('err_minimized_modal')
                  window.localStorage.removeItem('err_minimized_payload')
                  window.localStorage.removeItem('err_restore')
                  window.dispatchEvent(new CustomEvent('err_minimized_modal_change'))
                } catch {}
                setUploadF5ProjectId(null)
                setUploadF5Open(true)
              }}
            >
              {t('f5.upload')}
            </Button>
          )}
        </div>
      </div>

      {tab === 'f4' ? (
        <ReportingSummaryCards
          cards={f4SummaryCards(f4Summary, t)}
          loading={f4InitialLoading && f4Summary == null}
          updating={f4Refreshing}
        />
      ) : (
        <ReportingSummaryCards
          cards={f5SummaryCards(f5Summary, t)}
          loading={f5InitialLoading && f5Summary == null}
          updating={f5Refreshing}
        />
      )}

      <Tabs value={tab} onValueChange={(v) => { if (v === 'f4' || v === 'f5') setTab(v) }}>
        <TabsList>
          <TabsTrigger value="f4">{t('tabs.f4')}</TabsTrigger>
          <TabsTrigger value="f5">{t('tabs.f5')}</TabsTrigger>
        </TabsList>

        <TabsContent value="f4" className="mt-4 space-y-4">
          <div className={REPORTING_PANEL}>
            <div className={REPORTING_PANEL_TOOLBAR}>
              <span className={REPORTING_SECTION_TITLE}>
                {t('f4.title')}
                {!f4InitialLoading && (
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    ({f4Pagination.total})
                  </span>
                )}
              </span>
              {!f4InitialLoading && (
                <>
                  <SmartFilter
                    layout="inline"
                    className="min-w-0 flex-1"
                    fields={f4FilterFields}
                    filters={f4Filters}
                    onFiltersChange={onF4FiltersChange}
                    urlParamPrefix="f4f_"
                    chipOptionsByFieldId={f4ChipOptionsByFieldId}
                  />
                  {f4Refreshing && (
                    <ReportingToolbarRefreshIndicator
                      label={t('f4.updating')}
                      className="ms-auto"
                    />
                  )}
                </>
              )}
            </div>
            <div className={REPORTING_TABLE_SCROLL}>
                <Table noOverflowWrapper className={REPORTING_TABLE}>
                  <TableHeader>
                    <TableRow className={REPORTING_TABLE_HEADER_ROW}>
                      <TableHead className="text-xs whitespace-nowrap">
                        <button type="button" className={REPORTING_SORT_BUTTON} onClick={() => toggleF4Sort('base_room_name')}>
                          {t('f4.headers.base_room')} <span className="text-[10px]">{sortIndicator(f4Sort.key === 'base_room_name', f4Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap">
                        <button type="button" className={REPORTING_SORT_BUTTON} onClick={() => toggleF4Sort('grant')}>
                          {t('f4.headers.grant_id')} <span className="text-[10px]">{sortIndicator(f4Sort.key === 'grant', f4Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap">
                        <button type="button" className={REPORTING_SORT_BUTTON} onClick={() => toggleF4Sort('state')}>
                          {t('f4.headers.state')} <span className="text-[10px]">{sortIndicator(f4Sort.key === 'state', f4Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap">
                        <button type="button" className={REPORTING_SORT_BUTTON} onClick={() => toggleF4Sort('donor')}>
                          {t('f4.headers.donor')} <span className="text-[10px]">{sortIndicator(f4Sort.key === 'donor', f4Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap">
                        <button type="button" className={REPORTING_SORT_BUTTON} onClick={() => toggleF4Sort('payment_date')}>
                          {t('f4.headers.payment_date')} <span className="text-[10px]">{sortIndicator(f4Sort.key === 'payment_date', f4Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs text-right whitespace-nowrap">
                        <button type="button" className={REPORTING_SORT_BUTTON} onClick={() => toggleF4Sort('amount_sdg')}>
                          {t('f4.headers.amount_sdg')} <span className="text-[10px]">{sortIndicator(f4Sort.key === 'amount_sdg', f4Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs text-right whitespace-nowrap">
                        <button type="button" className={REPORTING_SORT_BUTTON} onClick={() => toggleF4Sort('exchange_rate')}>
                          {t('f4.headers.exchange_rate')} <span className="text-[10px]">{sortIndicator(f4Sort.key === 'exchange_rate', f4Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap">
                        <button type="button" className={REPORTING_SORT_BUTTON} onClick={() => toggleF4Sort('report_date')}>
                          {t('f4.headers.report_date')} <span className="text-[10px]">{sortIndicator(f4Sort.key === 'report_date', f4Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs text-right whitespace-nowrap">
                        <button type="button" className={REPORTING_SORT_BUTTON} onClick={() => toggleF4Sort('total_grant')}>
                          {t('f4.headers.total_grant')} <span className="text-[10px]">{sortIndicator(f4Sort.key === 'total_grant', f4Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs text-right whitespace-nowrap">
                        <button type="button" className={REPORTING_SORT_BUTTON} onClick={() => toggleF4Sort('total_expenses')}>
                          {t('f4.headers.total_expenses')} <span className="text-[10px]">{sortIndicator(f4Sort.key === 'total_expenses', f4Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs text-right whitespace-nowrap">
                        <button type="button" className={REPORTING_SORT_BUTTON} onClick={() => toggleF4Sort('remainder')}>
                          {t('f4.headers.remainder')} <span className="text-[10px]">{sortIndicator(f4Sort.key === 'remainder', f4Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap w-[1%]">{t('f4.headers.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {f4InitialLoading ? (
                      <TableRow><TableCell colSpan={12} className={REPORTING_LOADING}>{t('f4.loading')}</TableCell></TableRow>
                    ) : !loading && f4Pagination.total === 0 ? (
                      <TableRow><TableCell colSpan={12} className={REPORTING_EMPTY}>{t('f4.empty')}</TableCell></TableRow>
                    ) : rows.map(r => {
                      const grantCol = grantIdTableText(r)
                      const hasReport = r.has_f4_report !== false && r.id != null
                      const rowKey = r.id != null ? `summary-${r.id}` : `project-${r.project_id}`
                      return (
                      <TableRow key={rowKey} className={REPORTING_TABLE_BODY_ROW}>
                        <TableCell className="min-w-0 truncate" title={String(r.base_room_name || '')}>{r.base_room_name || '-'}</TableCell>
                        <TableCell className="text-xs min-w-0 truncate" title={grantCol === '-' ? '' : grantCol}>{grantCol}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{r.state || '-'}</TableCell>
                        <TableCell className="text-xs min-w-0 truncate" title={String(r.donor || '')}>{r.donor || '-'}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{r.payment_date ? new Date(r.payment_date).toLocaleDateString() : '-'}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{r.amount_sdg != null ? formatMoneyTwoDecimals(r.amount_sdg) : '-'}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{r.exchange_rate != null ? formatMoneyTwoDecimals(r.exchange_rate) : '-'}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{r.report_date ? new Date(r.report_date).toLocaleDateString() : '-'}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{formatMoneyTwoDecimals(r.total_grant)}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{formatMoneyTwoDecimals(r.total_expenses)}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{formatMoneyTwoDecimals(r.remainder)}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          <div className="flex flex-nowrap items-center justify-end gap-1">
                            {!r.activities_raw_import_id && (
                              <ReportingStatusChip status={r.f4_status} />
                            )}
                            {hasReport && (r.review_status === 'accepted' || r.review_status === 'rejected') && (
                              <span className="text-[10px] leading-none text-muted-foreground capitalize shrink-0 mr-0.5">{r.review_status}</span>
                            )}
                            {r.project_id && !r.project_id.startsWith('historical_') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-foreground"
                                onClick={() => openViewF1(r.project_id)}
                                aria-label={t('f4.view_f1')}
                                title={t('f4.view_f1')}
                              >
                                <FileText className="size-4" />
                              </Button>
                            )}
                            {hasReport && canViewF4 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-foreground"
                                onClick={()=>{ setViewId(r.id); setViewOpen(true) }}
                                aria-label={t('f4.view')}
                                title={t('f4.view')}
                              >
                                <Eye className="size-4" />
                              </Button>
                            )}
                            {!hasReport && canUploadF4 && r.project_id && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 py-0 text-[11px] leading-none shrink-0"
                                onClick={() => {
                                  try {
                                    window.localStorage.removeItem('err_minimized_modal')
                                    window.localStorage.removeItem('err_minimized_payload')
                                    window.localStorage.removeItem('err_restore')
                                    window.dispatchEvent(new CustomEvent('err_minimized_modal_change'))
                                  } catch {}
                                  setUploadProjectId(r.project_id)
                                  setUploadOpen(true)
                                }}
                              >
                                {t('f4.upload')}
                              </Button>
                            )}
                            {hasReport &&
                              (canEditReportingStatus || canUploadF4) &&
                              r.project_id &&
                              !r.activities_raw_import_id &&
                              !isReportingStatusCompleted(r.f4_status) && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 w-7 p-0 shrink-0 text-green-700 border-green-200 hover:bg-green-50"
                                onClick={() => r.project_id && setConfirmMarkComplete({ projectId: r.project_id, field: 'f4_status' })}
                                disabled={markCompleteSavingId === `f4_status:${r.project_id}`}
                                aria-label={t('f4.mark_complete')}
                                title={t('f4.mark_complete')}
                              >
                                {markCompleteSavingId === `f4_status:${r.project_id}`
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <Check className="h-3.5 w-3.5" />}
                              </Button>
                            )}
                            {canReviewF4 && f4RowCanAccept(r) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 shrink-0 text-green-700 hover:text-green-800 hover:bg-green-50"
                                onClick={() => r.id != null && setAcceptSummaryId(r.id)}
                                disabled={reviewSaving}
                                aria-label={t('f4.accept_tooltip')}
                                title={t('f4.accept_tooltip')}
                              >
                                {reviewSaving && acceptSummaryId === r.id ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="size-4" />
                                )}
                              </Button>
                            )}
                            {hasReport &&
                              canReviewF4 &&
                              !r.activities_raw_import_id &&
                              r.review_status !== 'rejected' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 shrink-0 text-destructive hover:bg-destructive/10"
                                onClick={() => r.id != null && setRejectSummaryId(r.id)}
                                disabled={reviewSaving}
                                aria-label={t('f4.reject_tooltip')}
                                title={t('f4.reject_tooltip')}
                              >
                                <XCircle className="size-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )})}
                  </TableBody>
                </Table>
            </div>
            <ReportingListPagination
              pagination={f4Pagination}
              pending={f4PaginationPending}
              listRefreshing={f4Refreshing}
              hasRows={rows.length > 0}
              listLoading={loading}
              previousLabel={t('common:previous', { defaultValue: 'Previous' })}
              nextLabel={t('common:next', { defaultValue: 'Next' })}
              onGoToPage={(page) => beginF4Pagination({ page }, { f4p_page: String(page) })}
              onPrevious={() =>
                beginF4Pagination('prev', {
                  f4p_page: String(Math.max(1, f4Pagination.page - 1)),
                })
              }
              onNext={() =>
                beginF4Pagination('next', { f4p_page: String(f4Pagination.page + 1) })
              }
              onPageSizeChange={(v) =>
                beginF4Pagination('pageSize', { f4p_pageSize: v, f4p_page: '1' })
              }
            />
          </div>

          <UploadF4Modal
            open={uploadOpen}
            onOpenChange={(open) => {
              setUploadOpen(open)
              if (!open) setUploadProjectId(null)
            }}
            onSaved={load}
            initialProjectId={uploadProjectId}
          />
          <ViewF4Modal summaryId={viewId} open={viewOpen} onOpenChange={(v)=>{ setViewOpen(v); if (!v) setViewId(null) }} onSaved={load} />

          <Dialog open={rejectSummaryId != null} onOpenChange={(open) => { if (!open) { setRejectSummaryId(null); setRejectComment('') } }}>
            <DialogContent>
              <DialogHeader><DialogTitle>{t('f4.reject_dialog_title')}</DialogTitle></DialogHeader>
              <p className="text-sm text-muted-foreground">{t('f4.reject_dialog_body')}</p>
              <Input placeholder={t('f4.reject_dialog_comment_placeholder')} value={rejectComment} onChange={(e) => setRejectComment(e.target.value)} className="mt-2" />
              <DialogFooter>
                <Button variant="outline" onClick={() => { setRejectSummaryId(null); setRejectComment('') }}>{t('common:cancel', { defaultValue: 'Cancel' })}</Button>
                <Button variant="destructive" disabled={reviewSaving} onClick={() => rejectSummaryId != null && submitReview(rejectSummaryId, 'rejected', rejectComment)}>
                  {reviewSaving ? t('f4.review_saving') : t('f4.reject')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={acceptSummaryId != null} onOpenChange={(open) => { if (!open) setAcceptSummaryId(null) }}>
            <DialogContent>
              <DialogHeader><DialogTitle>{t('f4.accept_dialog_title')}</DialogTitle></DialogHeader>
              <p className="text-sm text-muted-foreground">{t('f4.accept_dialog_body')}</p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAcceptSummaryId(null)}>{t('common:cancel', { defaultValue: 'Cancel' })}</Button>
                <Button
                  disabled={reviewSaving}
                  className="bg-green-700 hover:bg-green-800"
                  onClick={() => acceptSummaryId != null && submitReview(acceptSummaryId, 'accepted')}
                >
                  {reviewSaving ? t('f4.review_saving') : t('f4.accept')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="f5" className="mt-4 space-y-4">
          <div className={REPORTING_PANEL}>
            <div className={REPORTING_PANEL_TOOLBAR}>
              <span className={REPORTING_SECTION_TITLE}>
                {t('f5.title')}
                {!f5InitialLoading && (
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    ({f5Pagination.total})
                  </span>
                )}
              </span>
              {!f5InitialLoading && (
                <>
                  <SmartFilter
                    layout="inline"
                    className="min-w-0 flex-1"
                    fields={f5FilterFields}
                    filters={f5Filters}
                    onFiltersChange={onF5FiltersChange}
                    urlParamPrefix="f5f_"
                    chipOptionsByFieldId={f5ChipOptionsByFieldId}
                  />
                  {f5Refreshing && (
                    <ReportingToolbarRefreshIndicator
                      label={t('f5.updating')}
                      className="ms-auto"
                    />
                  )}
                </>
              )}
            </div>
            <div className={REPORTING_TABLE_SCROLL}>
                <Table noOverflowWrapper className={REPORTING_TABLE}>
                  <TableHeader>
                    <TableRow className={REPORTING_TABLE_HEADER_ROW}>
                      <TableHead className="text-xs whitespace-nowrap">
                        <button type="button" className={REPORTING_SORT_BUTTON} onClick={() => toggleF5Sort('base_room_name')}>
                          {t('f5.headers.base_room')} <span className="text-[10px]">{sortIndicator(f5Sort.key === 'base_room_name', f5Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap">
                        <button type="button" className={REPORTING_SORT_BUTTON} onClick={() => toggleF5Sort('grant')}>
                          {t('f5.headers.grant_id')} <span className="text-[10px]">{sortIndicator(f5Sort.key === 'grant', f5Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap">
                        <button type="button" className={REPORTING_SORT_BUTTON} onClick={() => toggleF5Sort('state')}>
                          {t('f5.headers.state')} <span className="text-[10px]">{sortIndicator(f5Sort.key === 'state', f5Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap">
                        <button type="button" className={REPORTING_SORT_BUTTON} onClick={() => toggleF5Sort('donor')}>
                          {t('f5.headers.donor')} <span className="text-[10px]">{sortIndicator(f5Sort.key === 'donor', f5Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap">
                        <button type="button" className={REPORTING_SORT_BUTTON} onClick={() => toggleF5Sort('payment_date')}>
                          {t('f5.headers.payment_date')} <span className="text-[10px]">{sortIndicator(f5Sort.key === 'payment_date', f5Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs text-right whitespace-nowrap">
                        <button type="button" className={REPORTING_SORT_BUTTON} onClick={() => toggleF5Sort('amount_sdg')}>
                          {t('f5.headers.amount_sdg')} <span className="text-[10px]">{sortIndicator(f5Sort.key === 'amount_sdg', f5Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs text-right whitespace-nowrap">
                        <button type="button" className={REPORTING_SORT_BUTTON} onClick={() => toggleF5Sort('exchange_rate')}>
                          {t('f5.headers.exchange_rate')} <span className="text-[10px]">{sortIndicator(f5Sort.key === 'exchange_rate', f5Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap">
                        <button type="button" className={REPORTING_SORT_BUTTON} onClick={() => toggleF5Sort('report_date')}>
                          {t('f5.headers.report_date')} <span className="text-[10px]">{sortIndicator(f5Sort.key === 'report_date', f5Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs text-right whitespace-nowrap">
                        <button type="button" className={REPORTING_SORT_BUTTON} onClick={() => toggleF5Sort('activities_count')}>
                          {t('f5.headers.activities')} <span className="text-[10px]">{sortIndicator(f5Sort.key === 'activities_count', f5Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap">
                        <button type="button" className={REPORTING_SORT_BUTTON} onClick={() => toggleF5Sort('updated_at')}>
                          {t('f5.headers.updated')} <span className="text-[10px]">{sortIndicator(f5Sort.key === 'updated_at', f5Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap w-[1%]">{t('f5.headers.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {f5InitialLoading ? (
                      <TableRow><TableCell colSpan={11} className={REPORTING_LOADING}>{t('f5.loading')}</TableCell></TableRow>
                    ) : !f5Loading && f5Pagination.total === 0 ? (
                      <TableRow><TableCell colSpan={11} className={REPORTING_EMPTY}>{t('f5.empty')}</TableCell></TableRow>
                    ) : f5Rows.map(r => {
                      const grantCol = grantIdTableText(r)
                      const hasReport = r.has_f5_report !== false && r.id != null
                      const rowKey = r.id != null ? `report-${r.id}` : `project-${r.project_id}`
                      return (
                      <TableRow key={rowKey} className={REPORTING_TABLE_BODY_ROW}>
                        <TableCell className="min-w-0 truncate" title={String(r.base_room_name || '')}>{r.base_room_name || '-'}</TableCell>
                        <TableCell className="text-xs min-w-0 truncate" title={grantCol === '-' ? '' : grantCol}>{grantCol}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{r.state || '-'}</TableCell>
                        <TableCell className="text-xs min-w-0 truncate" title={String(r.donor || '')}>{r.donor || '-'}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{r.payment_date ? new Date(r.payment_date).toLocaleDateString() : '-'}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{r.amount_sdg != null ? formatMoneyTwoDecimals(r.amount_sdg) : '-'}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{r.exchange_rate != null ? formatMoneyTwoDecimals(r.exchange_rate) : '-'}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{r.report_date ? new Date(r.report_date).toLocaleDateString() : '-'}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{Number(r.activities_count || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{r.updated_at ? new Date(r.updated_at).toLocaleDateString() : '-'}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          <div className="flex flex-nowrap items-center justify-end gap-1">
                            <ReportingStatusChip status={r.f5_status} />
                            {r.project_id && !r.project_id.startsWith('historical_') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-foreground"
                                onClick={() => openViewF1(r.project_id)}
                                aria-label={t('f5.view_f1')}
                                title={t('f5.view_f1')}
                              >
                                <FileText className="size-4" />
                              </Button>
                            )}
                            {hasReport && canViewF5 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-foreground"
                                onClick={()=>{ setViewF5Id(r.id); setViewF5Open(true) }}
                                aria-label={t('f5.view')}
                                title={t('f5.view')}
                              >
                                <Eye className="size-4" />
                              </Button>
                            )}
                            {!hasReport && canUploadF5 && r.project_id && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 py-0 text-[11px] leading-none shrink-0"
                                onClick={() => {
                                  try {
                                    window.localStorage.removeItem('err_minimized_modal')
                                    window.localStorage.removeItem('err_minimized_payload')
                                    window.localStorage.removeItem('err_restore')
                                    window.dispatchEvent(new CustomEvent('err_minimized_modal_change'))
                                  } catch {}
                                  setUploadF5ProjectId(r.project_id)
                                  setUploadF5Open(true)
                                }}
                              >
                                {t('f5.upload')}
                              </Button>
                            )}
                            {hasReport &&
                              (canEditReportingStatus || canUploadF5) &&
                              r.project_id &&
                              !isReportingStatusCompleted(r.f5_status) && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 w-7 p-0 shrink-0 text-green-700 border-green-200 hover:bg-green-50"
                                onClick={() => r.project_id && setConfirmMarkComplete({ projectId: r.project_id, field: 'f5_status' })}
                                disabled={markCompleteSavingId === `f5_status:${r.project_id}`}
                                aria-label={t('f5.mark_complete')}
                                title={t('f5.mark_complete')}
                              >
                                {markCompleteSavingId === `f5_status:${r.project_id}`
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <Check className="h-3.5 w-3.5" />}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )})}
                  </TableBody>
                </Table>
            </div>
            <ReportingListPagination
              pagination={f5Pagination}
              pending={f5PaginationPending}
              listRefreshing={f5Refreshing}
              hasRows={f5Rows.length > 0}
              listLoading={f5Loading}
              previousLabel={t('common:previous', { defaultValue: 'Previous' })}
              nextLabel={t('common:next', { defaultValue: 'Next' })}
              onGoToPage={(page) => beginF5Pagination({ page }, { f5p_page: String(page) })}
              onPrevious={() =>
                beginF5Pagination('prev', {
                  f5p_page: String(Math.max(1, f5Pagination.page - 1)),
                })
              }
              onNext={() =>
                beginF5Pagination('next', { f5p_page: String(f5Pagination.page + 1) })
              }
              onPageSizeChange={(v) =>
                beginF5Pagination('pageSize', { f5p_pageSize: v, f5p_page: '1' })
              }
            />
          </div>

          <UploadF5Modal
            open={uploadF5Open}
            onOpenChange={(open) => {
              setUploadF5Open(open)
              if (!open) setUploadF5ProjectId(null)
            }}
            onSaved={refreshF5}
            initialProjectId={uploadF5ProjectId}
          />
          <ViewF5Modal reportId={viewF5Id} open={viewF5Open} onOpenChange={(v)=>{ setViewF5Open(v); if (!v) setViewF5Id(null) }} onSaved={refreshF5} />
        </TabsContent>
      </Tabs>

      <Dialog
        open={confirmMarkComplete != null}
        onOpenChange={(open) => {
          if (!open && !markCompleteSavingId) setConfirmMarkComplete(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmMarkComplete?.field === 'f5_status'
                ? t('f5.mark_complete_confirm_title')
                : t('f4.mark_complete_confirm_title')}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmMarkComplete?.field === 'f5_status'
              ? t('f5.mark_complete_confirm_body')
              : t('f4.mark_complete_confirm_body')}
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={!!markCompleteSavingId}
              onClick={() => setConfirmMarkComplete(null)}
            >
              {confirmMarkComplete?.field === 'f5_status'
                ? t('f5.mark_complete_confirm_cancel')
                : t('f4.mark_complete_confirm_cancel')}
            </Button>
            <Button
              disabled={!confirmMarkComplete || !!markCompleteSavingId}
              onClick={() => {
                if (!confirmMarkComplete) return
                markCompleteReportingStatus(confirmMarkComplete.projectId, confirmMarkComplete.field)
              }}
            >
              {markCompleteSavingId
                ? (confirmMarkComplete?.field === 'f5_status'
                    ? t('f5.mark_complete_saving')
                    : t('f4.mark_complete_saving'))
                : (confirmMarkComplete?.field === 'f5_status'
                    ? t('f5.mark_complete_confirm_action')
                    : t('f4.mark_complete_confirm_action'))}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <F1ProjectViewerSheet
        projectId={f1ViewerProjectId}
        open={f1ViewerOpen}
        onOpenChange={(open) => {
          setF1ViewerOpen(open)
          if (!open) setF1ViewerProjectId(null)
        }}
      />
    </div>
  )
}

export default function F4F5ReportingPage() {
  return (
    <Suspense fallback={<div className="w-full p-6">Loading...</div>}>
      <F4F5ReportingPageContent />
    </Suspense>
  )
}


