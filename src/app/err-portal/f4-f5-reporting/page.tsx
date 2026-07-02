'use client'

import { useCallback, useEffect, useMemo, useState, Suspense } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  SmartFilter,
  applyFilters,
  getF4ReportingFilterFields,
  type ActiveFilter,
} from '@/components/smart-filter'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import UploadF4Modal from './components/UploadF4Modal'
import { useTranslation } from 'react-i18next'
import ViewF4Modal from './components/ViewF4Modal'
import UploadF5Modal from './components/UploadF5Modal'
import ViewF5Modal from './components/ViewF5Modal'
import { useF4F5ReportingPageExplainer } from './F4F5ReportingPageExplainer'
import { useSearchParams, useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const

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
  grant_name?: string | null
  report_status?: string | null
  has_f4_report?: boolean
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
}

type SortDirection = 'asc' | 'desc'
type F4SortKey =
  | 'base_room_name'
  | 'grant'
  | 'state'
  | 'donor'
  | 'payment_date'
  | 'amount_sdg'
  | 'exchange_rate'
  | 'report_date'
  | 'total_grant'
  | 'total_expenses'
  | 'remainder'
type F5SortKey =
  | 'base_room_name'
  | 'grant'
  | 'state'
  | 'donor'
  | 'payment_date'
  | 'amount_sdg'
  | 'exchange_rate'
  | 'report_date'
  | 'activities_count'
  | 'updated_at'

function grantIdTableText(r: { grant_serial_id?: string | null; grant_id?: string | null }) {
  const v = r.grant_serial_id ?? r.grant_id
  if (v == null || String(v).trim() === '') return '-'
  return String(v).trim()
}

function grantSearchText(r: {
  grant_serial_id?: string | null
  grant_id?: string | null
}) {
  return [r.grant_serial_id, r.grant_id]
    .filter((v) => v != null && String(v).trim() !== '')
    .map((v) => String(v).toLowerCase().trim())
}

function formatMoneyTwoDecimals(n: number | null | undefined) {
  return Number(n ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function compareNullableValues (a: unknown, b: unknown): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

function sortWithDirection<T> (items: T[], dir: SortDirection, pick: (row: T) => unknown): T[] {
  const factor = dir === 'asc' ? 1 : -1
  return [...items].sort((a, b) => compareNullableValues(pick(a), pick(b)) * factor)
}

function F4F5ReportingPageContent() {
  const { t } = useTranslation(['f4f5'])
  const searchParams = useSearchParams()
  const router = useRouter()
  const { can, isLoading: permissionsLoading } = useAllowedFunctions()
  const canViewPage = can('f4_f5_view_page')
  const canUploadF4 = can('f4_upload')
  const canUploadF5 = can('f5_upload')
  const canViewF4 = can('f4_view_report')
  const canViewF5 = can('f5_view_report')
  const canReviewF4 = can('f4_review')
  const [tab, setTab] = useState<'f4'|'f5'>('f4')
  const [rows, setRows] = useState<F4Row[]>([])
  const [loading, setLoading] = useState(false)
  const [f4Filters, setF4Filters] = useState<ActiveFilter[]>([])
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadProjectId, setUploadProjectId] = useState<string | null>(null)
  const [viewId, setViewId] = useState<number | null>(null)
  const [viewOpen, setViewOpen] = useState(false)
  const [rejectSummaryId, setRejectSummaryId] = useState<number | null>(null)
  const [rejectComment, setRejectComment] = useState('')
  const [reviewSaving, setReviewSaving] = useState(false)

  // F5 state
  const [f5Rows, setF5Rows] = useState<F5Row[]>([])
  const [f5Loading, setF5Loading] = useState(false)
  const [f5Filters, setF5Filters] = useState<ActiveFilter[]>([])
  const [uploadF5Open, setUploadF5Open] = useState(false)
  const [uploadF5ProjectId, setUploadF5ProjectId] = useState<string | null>(null)
  const [viewF5Id, setViewF5Id] = useState<string | null>(null)
  const [viewF5Open, setViewF5Open] = useState(false)
  const [f4Sort, setF4Sort] = useState<{ key: F4SortKey; dir: SortDirection }>({ key: 'report_date', dir: 'desc' })
  const [f5Sort, setF5Sort] = useState<{ key: F5SortKey; dir: SortDirection }>({ key: 'report_date', dir: 'desc' })

  const [f4Page, setF4Page] = useState(1)
  const [f4PageSize, setF4PageSize] = useState(20)
  const [f5Page, setF5Page] = useState(1)
  const [f5PageSize, setF5PageSize] = useState(20)

  const load = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/f4/list')
      if (!res.ok) throw new Error('failed list')
      const data = await res.json()
      setRows(data)
    } catch {
      /* list load failed */
    } finally {
      setLoading(false)
    }
  }

  const loadF5 = async () => {
    try {
      setF5Loading(true)
      const res = await fetch('/api/f5/list')
      if (!res.ok) throw new Error('failed f5 list')
      const data = await res.json()
      setF5Rows(data)
    } catch {
      /* F5 list load failed */
    } finally {
      setF5Loading(false)
    }
  }

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
      setRejectComment('')
      load()
    } catch {
      /* review submit failed */
    } finally {
      setReviewSaving(false)
    }
  }

  useEffect(() => {
    if (!canViewPage) {
      router.replace('/err-portal')
    }
  }, [canViewPage, router])

  useEffect(() => { load() }, [])
  useEffect(() => { if (tab === 'f5') loadF5() }, [tab])

  const f4BaseRoomOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.base_room_name).filter(Boolean) as string[])).sort(),
    [rows]
  )
  const f4StateOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.state).filter(Boolean) as string[])).sort(),
    [rows]
  )
  const f4DonorOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.donor).filter(Boolean) as string[])).sort(),
    [rows]
  )

  const f5BaseRoomOptions = useMemo(
    () => Array.from(new Set(f5Rows.map((r) => r.base_room_name).filter(Boolean) as string[])).sort(),
    [f5Rows]
  )
  const f5StateOptions = useMemo(
    () => Array.from(new Set(f5Rows.map((r) => r.state).filter(Boolean) as string[])).sort(),
    [f5Rows]
  )
  const f5DonorOptions = useMemo(
    () => Array.from(new Set(f5Rows.map((r) => r.donor).filter(Boolean) as string[])).sort(),
    [f5Rows]
  )

  const f4ReportStatusOptions = useMemo(
    () => [
      { value: 'not_uploaded', label: t('f4.report_status.not_uploaded') },
      { value: 'pending_review', label: t('f4.report_status.pending_review') },
      { value: 'accepted', label: t('f4.report_status.accepted') },
      { value: 'rejected', label: t('f4.report_status.rejected') },
      { value: 'historical', label: t('f4.report_status.historical') },
    ],
    [t]
  )

  const f4FilterFields = useMemo(
    () =>
      getF4ReportingFilterFields({
        baseRoomOptions: f4BaseRoomOptions,
        stateOptions: f4StateOptions,
        donorOptions: f4DonorOptions,
        reportStatusOptions: f4ReportStatusOptions,
        labels: {
          grantId: t('f4.filters.grant_id'),
          grantIdPlaceholder: t('f4.filters.grant_id_placeholder'),
          baseRoom: t('f4.filters.base_room'),
          state: t('f4.filters.state'),
          donor: t('f4.filters.donor'),
          reportStatus: t('f4.filters.report_status'),
          all: t('f4.filters.all'),
        },
      }),
    [f4BaseRoomOptions, f4StateOptions, f4DonorOptions, f4ReportStatusOptions, t]
  )

  const f5ReportStatusOptions = useMemo(
    () => [
      { value: 'not_uploaded', label: t('f5.report_status.not_uploaded') },
      { value: 'uploaded', label: t('f5.report_status.uploaded') },
    ],
    [t]
  )

  const f5FilterFields = useMemo(
    () =>
      getF4ReportingFilterFields({
        baseRoomOptions: f5BaseRoomOptions,
        stateOptions: f5StateOptions,
        donorOptions: f5DonorOptions,
        reportStatusOptions: f5ReportStatusOptions,
        labels: {
          grantId: t('f5.filters.grant_id'),
          grantIdPlaceholder: t('f5.filters.grant_id_placeholder'),
          baseRoom: t('f5.filters.base_room'),
          state: t('f5.filters.state'),
          donor: t('f5.filters.donor'),
          reportStatus: t('f5.filters.report_status'),
          all: t('f5.filters.all'),
        },
      }),
    [f5BaseRoomOptions, f5StateOptions, f5DonorOptions, f5ReportStatusOptions, t]
  )

  const getF4FieldValue = useCallback((row: F4Row, fieldId: string): string | null | undefined => {
    if (fieldId === 'grant_id') {
      const v = row.grant_serial_id ?? row.grant_id
      return v != null && String(v).trim() !== '' ? String(v).trim() : ''
    }
    if (fieldId === 'base_room') return row.base_room_name ?? ''
    if (fieldId === 'state') return row.state ?? ''
    if (fieldId === 'donor') return row.donor ?? ''
    if (fieldId === 'report_status') return row.report_status ?? ''
    return null
  }, [])

  const getF5FieldValue = useCallback((row: F5Row, fieldId: string): string | null | undefined => {
    if (fieldId === 'grant_id') {
      const v = row.grant_serial_id ?? row.grant_id
      return v != null && String(v).trim() !== '' ? String(v).trim() : ''
    }
    if (fieldId === 'base_room') return row.base_room_name ?? ''
    if (fieldId === 'state') return row.state ?? ''
    if (fieldId === 'donor') return row.donor ?? ''
    if (fieldId === 'report_status') return row.report_status ?? ''
    return null
  }, [])

  const f4Filtered = useMemo(() => {
    const filtersSansGrant = f4Filters.filter((f) => f.fieldId !== 'grant_id')
    let result = applyFilters({
      data: rows,
      filters: filtersSansGrant,
      fields: f4FilterFields,
      getFieldValue: getF4FieldValue,
    })
    const grantFilter = f4Filters.find((f) => f.fieldId === 'grant_id')
    if (grantFilter?.value && String(grantFilter.value).trim()) {
      const term = String(grantFilter.value).trim().toLowerCase()
      result = result.filter((r: F4Row) =>
        grantSearchText(r).some((s) => s.startsWith(term) || s.includes(term))
      )
    }
    return result
  }, [rows, f4Filters, f4FilterFields, getF4FieldValue])

  const f5Filtered = useMemo(() => {
    const filtersSansGrant = f5Filters.filter((f) => f.fieldId !== 'grant_id')
    let result = applyFilters({
      data: f5Rows,
      filters: filtersSansGrant,
      fields: f5FilterFields,
      getFieldValue: getF5FieldValue,
    })
    const grantFilter = f5Filters.find((f) => f.fieldId === 'grant_id')
    if (grantFilter?.value && String(grantFilter.value).trim()) {
      const term = String(grantFilter.value).trim().toLowerCase()
      result = result.filter((r: F5Row) =>
        grantSearchText(r).some((s) => s.startsWith(term) || s.includes(term))
      )
    }
    return result
  }, [f5Rows, f5Filters, f5FilterFields, getF5FieldValue])

  const f4Sorted = useMemo(() => {
    return sortWithDirection(f4Filtered, f4Sort.dir, (r) => {
      if (f4Sort.key === 'base_room_name') return r.base_room_name ?? r.err_id ?? null
      if (f4Sort.key === 'grant') return grantIdTableText(r)
      if (f4Sort.key === 'state') return r.state ?? null
      if (f4Sort.key === 'donor') return r.donor ?? null
      if (f4Sort.key === 'payment_date') return r.payment_date ? new Date(r.payment_date).getTime() : null
      if (f4Sort.key === 'amount_sdg') return r.amount_sdg ?? null
      if (f4Sort.key === 'exchange_rate') return r.exchange_rate ?? null
      if (f4Sort.key === 'report_date') return r.report_date ? new Date(r.report_date).getTime() : null
      if (f4Sort.key === 'total_grant') return r.total_grant ?? null
      if (f4Sort.key === 'total_expenses') return r.total_expenses ?? null
      return r.remainder ?? null
    })
  }, [f4Filtered, f4Sort])

  const f5Sorted = useMemo(() => {
    return sortWithDirection(f5Filtered, f5Sort.dir, (r) => {
      if (f5Sort.key === 'base_room_name') return r.base_room_name ?? r.err_id ?? null
      if (f5Sort.key === 'grant') return grantIdTableText(r)
      if (f5Sort.key === 'state') return r.state ?? null
      if (f5Sort.key === 'donor') return r.donor ?? null
      if (f5Sort.key === 'payment_date') return r.payment_date ? new Date(r.payment_date).getTime() : null
      if (f5Sort.key === 'amount_sdg') return r.amount_sdg ?? null
      if (f5Sort.key === 'exchange_rate') return r.exchange_rate ?? null
      if (f5Sort.key === 'report_date') return r.report_date ? new Date(r.report_date).getTime() : null
      if (f5Sort.key === 'activities_count') return Number(r.activities_count || 0)
      return r.updated_at ? new Date(r.updated_at).getTime() : null
    })
  }, [f5Filtered, f5Sort])

  const f4TotalPages = Math.max(1, Math.ceil(f4Sorted.length / f4PageSize))
  const f5TotalPages = Math.max(1, Math.ceil(f5Sorted.length / f5PageSize))

  useEffect(() => {
    setF4Page(1)
  }, [f4Filters])

  useEffect(() => {
    setF5Page(1)
  }, [f5Filters])

  useEffect(() => {
    if (f4Page > f4TotalPages) setF4Page(f4TotalPages)
  }, [f4Page, f4TotalPages])

  useEffect(() => {
    if (f5Page > f5TotalPages) setF5Page(f5TotalPages)
  }, [f5Page, f5TotalPages])

  const f4PageRows = useMemo(() => {
    const start = (f4Page - 1) * f4PageSize
    return f4Sorted.slice(start, start + f4PageSize)
  }, [f4Sorted, f4Page, f4PageSize])

  const f5PageRows = useMemo(() => {
    const start = (f5Page - 1) * f5PageSize
    return f5Sorted.slice(start, start + f5PageSize)
  }, [f5Sorted, f5Page, f5PageSize])

  const toggleF4Sort = (key: F4SortKey) => {
    setF4Sort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    )
  }

  const toggleF5Sort = (key: F5SortKey) => {
    setF5Sort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    )
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

  useF4F5ReportingPageExplainer(!permissionsLoading && canViewPage && !loading)

  if (!canViewPage) return null

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="f4">{t('tabs.f4')}</TabsTrigger>
          <TabsTrigger value="f5">{t('tabs.f5')}</TabsTrigger>
        </TabsList>

        <TabsContent value="f4" className="mt-4 space-y-4">
          <div className="flex items-center justify-end">
            {canUploadF4 && (
            <Button onClick={() => {
              try {
                window.localStorage.removeItem('err_minimized_modal')
                window.localStorage.removeItem('err_minimized_payload')
                window.localStorage.removeItem('err_restore')
                window.dispatchEvent(new CustomEvent('err_minimized_modal_change'))
              } catch {}
              setUploadProjectId(null)
              setUploadOpen(true)
            }}>{t('f4.upload')}</Button>
            )}
          </div>

          <Card>
            <CardHeader className="pb-4">
              {!loading && (
                <SmartFilter
                  fields={f4FilterFields}
                  filters={f4Filters}
                  onFiltersChange={setF4Filters}
                  urlParamPrefix="f4f_"
                  title={t('f4.title')}
                  count={f4Filtered.length}
                />
              )}
              {loading && (
                <div className="text-lg font-semibold">{t('f4.title')}</div>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto w-full">
                <Table className="min-w-[1100px] text-xs [&_th]:py-1.5 [&_td]:py-1 [&_th]:px-2 [&_td]:px-2 [&_td]:text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs whitespace-nowrap">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleF4Sort('base_room_name')}>
                          {t('f4.headers.base_room')} <span className="text-[10px]">{sortIndicator(f4Sort.key === 'base_room_name', f4Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleF4Sort('grant')}>
                          {t('f4.headers.grant_id')} <span className="text-[10px]">{sortIndicator(f4Sort.key === 'grant', f4Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleF4Sort('state')}>
                          {t('f4.headers.state')} <span className="text-[10px]">{sortIndicator(f4Sort.key === 'state', f4Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleF4Sort('donor')}>
                          {t('f4.headers.donor')} <span className="text-[10px]">{sortIndicator(f4Sort.key === 'donor', f4Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleF4Sort('payment_date')}>
                          {t('f4.headers.payment_date')} <span className="text-[10px]">{sortIndicator(f4Sort.key === 'payment_date', f4Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs text-right whitespace-nowrap">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleF4Sort('amount_sdg')}>
                          {t('f4.headers.amount_sdg')} <span className="text-[10px]">{sortIndicator(f4Sort.key === 'amount_sdg', f4Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs text-right whitespace-nowrap">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleF4Sort('exchange_rate')}>
                          {t('f4.headers.exchange_rate')} <span className="text-[10px]">{sortIndicator(f4Sort.key === 'exchange_rate', f4Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleF4Sort('report_date')}>
                          {t('f4.headers.report_date')} <span className="text-[10px]">{sortIndicator(f4Sort.key === 'report_date', f4Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs text-right whitespace-nowrap">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleF4Sort('total_grant')}>
                          {t('f4.headers.total_grant')} <span className="text-[10px]">{sortIndicator(f4Sort.key === 'total_grant', f4Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs text-right whitespace-nowrap">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleF4Sort('total_expenses')}>
                          {t('f4.headers.total_expenses')} <span className="text-[10px]">{sortIndicator(f4Sort.key === 'total_expenses', f4Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs text-right whitespace-nowrap">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleF4Sort('remainder')}>
                          {t('f4.headers.remainder')} <span className="text-[10px]">{sortIndicator(f4Sort.key === 'remainder', f4Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap w-[1%]">{t('f4.headers.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow><TableCell colSpan={12} className="text-center py-4 text-xs">{t('f4.loading')}</TableCell></TableRow>
                    ) : f4Filtered.length === 0 ? (
                      <TableRow><TableCell colSpan={12} className="text-center py-4 text-muted-foreground text-xs">{t('f4.empty')}</TableCell></TableRow>
                    ) : f4PageRows.map(r => {
                      const grantCol = grantIdTableText(r)
                      const hasReport = r.has_f4_report !== false && r.id != null
                      const rowKey = r.id != null ? `summary-${r.id}` : `project-${r.project_id}`
                      return (
                      <TableRow key={rowKey}>
                        <TableCell className="text-xs max-w-[10rem] truncate" title={String(r.base_room_name || '')}>{r.base_room_name || '-'}</TableCell>
                        <TableCell className="text-xs max-w-[12rem] truncate" title={grantCol === '-' ? '' : grantCol}>{grantCol}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{r.state || '-'}</TableCell>
                        <TableCell className="text-xs max-w-[8rem] truncate" title={String(r.donor || '')}>{r.donor || '-'}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{r.payment_date ? new Date(r.payment_date).toLocaleDateString() : '-'}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{r.amount_sdg != null ? formatMoneyTwoDecimals(r.amount_sdg) : '-'}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{r.exchange_rate != null ? formatMoneyTwoDecimals(r.exchange_rate) : '-'}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{r.report_date ? new Date(r.report_date).toLocaleDateString() : '-'}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{formatMoneyTwoDecimals(r.total_grant)}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{formatMoneyTwoDecimals(r.total_expenses)}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{formatMoneyTwoDecimals(r.remainder)}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          <div className="flex flex-nowrap items-center justify-end gap-1">
                            {hasReport && (r.review_status === 'accepted' || r.review_status === 'rejected') && (
                              <span className="text-[10px] leading-none text-muted-foreground capitalize shrink-0 mr-0.5">{r.review_status}</span>
                            )}
                            {hasReport && canViewF4 && (
                              <Button variant="outline" size="sm" className="h-7 px-2 py-0 text-[11px] leading-none shrink-0" onClick={()=>{ setViewId(r.id); setViewOpen(true) }}>{t('f4.view')}</Button>
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
                            {hasReport && canReviewF4 && !r.activities_raw_import_id && (
                              <>
                                {r.review_status !== 'accepted' && (
                                  <Button variant="outline" size="sm" className="h-7 px-2 py-0 text-[11px] leading-none shrink-0 text-green-700 border-green-200 hover:bg-green-50" onClick={() => r.id != null && submitReview(r.id, 'accepted')} disabled={reviewSaving}>Accept</Button>
                                )}
                                {r.review_status !== 'rejected' && (
                                  <Button variant="outline" size="sm" className="h-7 px-2 py-0 text-[11px] leading-none shrink-0 text-destructive border-destructive/30 hover:bg-destructive/5" onClick={() => r.id != null && setRejectSummaryId(r.id)} disabled={reviewSaving}>Reject</Button>
                                )}
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )})}
                  </TableBody>
                </Table>
              </div>
              {!loading && f4Filtered.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    Showing {(f4Page - 1) * f4PageSize + 1}–{Math.min(f4Page * f4PageSize, f4Filtered.length)} of {f4Filtered.length}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">Rows per page</span>
                    <Select
                      value={String(f4PageSize)}
                      onValueChange={(v) => {
                        setF4PageSize(Number(v))
                        setF4Page(1)
                      }}
                    >
                      <SelectTrigger className="h-7 w-[72px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAGE_SIZE_OPTIONS.map((n) => (
                          <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setF4Page((p) => Math.max(1, p - 1))}
                      disabled={f4Page <= 1}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Prev
                    </Button>
                    <span className="text-xs text-muted-foreground px-2 tabular-nums">
                      Page {f4Page} of {f4TotalPages}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setF4Page((p) => Math.min(f4TotalPages, p + 1))}
                      disabled={f4Page >= f4TotalPages}
                    >
                      Next
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

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
              <DialogHeader><DialogTitle>Reject F4 report</DialogTitle></DialogHeader>
              <p className="text-sm text-muted-foreground">Add a comment (optional). The report will be returned to ERR/LoHub for correction.</p>
              <Input placeholder="Comment…" value={rejectComment} onChange={(e) => setRejectComment(e.target.value)} className="mt-2" />
              <DialogFooter>
                <Button variant="outline" onClick={() => { setRejectSummaryId(null); setRejectComment('') }}>Cancel</Button>
                <Button variant="destructive" disabled={reviewSaving} onClick={() => rejectSummaryId != null && submitReview(rejectSummaryId, 'rejected', rejectComment)}>
                  {reviewSaving ? 'Saving…' : 'Reject'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="f5" className="mt-4 space-y-4">
          <div className="flex items-center justify-end">
            {canUploadF5 && (
            <Button onClick={() => {
              try {
                window.localStorage.removeItem('err_minimized_modal')
                window.localStorage.removeItem('err_minimized_payload')
                window.localStorage.removeItem('err_restore')
                window.dispatchEvent(new CustomEvent('err_minimized_modal_change'))
              } catch {}
              setUploadF5ProjectId(null)
              setUploadF5Open(true)
            }}>{t('f5.upload')}</Button>
            )}
          </div>

          <Card>
            <CardHeader className="pb-4">
              {!f5Loading && (
                <SmartFilter
                  fields={f5FilterFields}
                  filters={f5Filters}
                  onFiltersChange={setF5Filters}
                  urlParamPrefix="f5f_"
                  title={t('f5.title')}
                  count={f5Filtered.length}
                />
              )}
              {f5Loading && (
                <div className="text-lg font-semibold">{t('f5.title')}</div>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto w-full">
                <Table className="min-w-[1100px] text-xs [&_th]:py-1.5 [&_td]:py-1 [&_th]:px-2 [&_td]:px-2 [&_td]:text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs whitespace-nowrap">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleF5Sort('base_room_name')}>
                          {t('f5.headers.base_room')} <span className="text-[10px]">{sortIndicator(f5Sort.key === 'base_room_name', f5Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleF5Sort('grant')}>
                          {t('f5.headers.grant_id')} <span className="text-[10px]">{sortIndicator(f5Sort.key === 'grant', f5Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleF5Sort('state')}>
                          {t('f5.headers.state')} <span className="text-[10px]">{sortIndicator(f5Sort.key === 'state', f5Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleF5Sort('donor')}>
                          {t('f5.headers.donor')} <span className="text-[10px]">{sortIndicator(f5Sort.key === 'donor', f5Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleF5Sort('payment_date')}>
                          {t('f5.headers.payment_date')} <span className="text-[10px]">{sortIndicator(f5Sort.key === 'payment_date', f5Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs text-right whitespace-nowrap">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleF5Sort('amount_sdg')}>
                          {t('f5.headers.amount_sdg')} <span className="text-[10px]">{sortIndicator(f5Sort.key === 'amount_sdg', f5Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs text-right whitespace-nowrap">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleF5Sort('exchange_rate')}>
                          {t('f5.headers.exchange_rate')} <span className="text-[10px]">{sortIndicator(f5Sort.key === 'exchange_rate', f5Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleF5Sort('report_date')}>
                          {t('f5.headers.report_date')} <span className="text-[10px]">{sortIndicator(f5Sort.key === 'report_date', f5Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs text-right whitespace-nowrap">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleF5Sort('activities_count')}>
                          {t('f5.headers.activities')} <span className="text-[10px]">{sortIndicator(f5Sort.key === 'activities_count', f5Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleF5Sort('updated_at')}>
                          {t('f5.headers.updated')} <span className="text-[10px]">{sortIndicator(f5Sort.key === 'updated_at', f5Sort.dir)}</span>
                        </button>
                      </TableHead>
                      <TableHead className="text-xs whitespace-nowrap w-[1%]">{t('f5.headers.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {f5Loading ? (
                      <TableRow><TableCell colSpan={11} className="text-center py-4 text-xs">{t('f5.loading')}</TableCell></TableRow>
                    ) : f5Filtered.length === 0 ? (
                      <TableRow><TableCell colSpan={11} className="text-center py-4 text-muted-foreground text-xs">{t('f5.empty')}</TableCell></TableRow>
                    ) : f5PageRows.map(r => {
                      const grantCol = grantIdTableText(r)
                      const hasReport = r.has_f5_report !== false && r.id != null
                      const rowKey = r.id != null ? `report-${r.id}` : `project-${r.project_id}`
                      return (
                      <TableRow key={rowKey}>
                        <TableCell className="text-xs max-w-[10rem] truncate" title={String(r.base_room_name || '')}>{r.base_room_name || '-'}</TableCell>
                        <TableCell className="text-xs max-w-[12rem] truncate" title={grantCol === '-' ? '' : grantCol}>{grantCol}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{r.state || '-'}</TableCell>
                        <TableCell className="text-xs max-w-[8rem] truncate" title={String(r.donor || '')}>{r.donor || '-'}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{r.payment_date ? new Date(r.payment_date).toLocaleDateString() : '-'}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{r.amount_sdg != null ? formatMoneyTwoDecimals(r.amount_sdg) : '-'}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{r.exchange_rate != null ? formatMoneyTwoDecimals(r.exchange_rate) : '-'}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{r.report_date ? new Date(r.report_date).toLocaleDateString() : '-'}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{Number(r.activities_count || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{r.updated_at ? new Date(r.updated_at).toLocaleDateString() : '-'}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          <div className="flex flex-nowrap items-center justify-end gap-1">
                            {hasReport && canViewF5 && (
                              <Button variant="outline" size="sm" className="h-7 px-2 py-0 text-[11px] leading-none shrink-0" onClick={()=>{ setViewF5Id(r.id); setViewF5Open(true) }}>{t('f5.view')}</Button>
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
                          </div>
                        </TableCell>
                      </TableRow>
                    )})}
                  </TableBody>
                </Table>
              </div>
              {!f5Loading && f5Filtered.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    Showing {(f5Page - 1) * f5PageSize + 1}–{Math.min(f5Page * f5PageSize, f5Filtered.length)} of {f5Filtered.length}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">Rows per page</span>
                    <Select
                      value={String(f5PageSize)}
                      onValueChange={(v) => {
                        setF5PageSize(Number(v))
                        setF5Page(1)
                      }}
                    >
                      <SelectTrigger className="h-7 w-[72px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAGE_SIZE_OPTIONS.map((n) => (
                          <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setF5Page((p) => Math.max(1, p - 1))}
                      disabled={f5Page <= 1}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Prev
                    </Button>
                    <span className="text-xs text-muted-foreground px-2 tabular-nums">
                      Page {f5Page} of {f5TotalPages}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setF5Page((p) => Math.min(f5TotalPages, p + 1))}
                      disabled={f5Page >= f5TotalPages}
                    >
                      Next
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <UploadF5Modal
            open={uploadF5Open}
            onOpenChange={(open) => {
              setUploadF5Open(open)
              if (!open) setUploadF5ProjectId(null)
            }}
            onSaved={loadF5}
            initialProjectId={uploadF5ProjectId}
          />
          <ViewF5Modal reportId={viewF5Id} open={viewF5Open} onOpenChange={(v)=>{ setViewF5Open(v); if (!v) setViewF5Id(null) }} onSaved={loadF5} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default function F4F5ReportingPage() {
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto p-6">Loading...</div>}>
      <F4F5ReportingPageContent />
    </Suspense>
  )
}


