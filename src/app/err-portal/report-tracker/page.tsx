'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, BarChart3, DollarSign, FolderOpen } from 'lucide-react'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'
import {
  SmartFilter,
  getReportTrackerFilterFields,
  applyFilters,
  type ActiveFilter,
} from '@/components/smart-filter'
import { STATUS_DISPLAY } from '@/components/smart-filter'
import { StatsDonutCard, CompactStatCard, type DonutSegment } from '@/components/report-tracker-stats'

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const

const STATUS_OPTIONS = STATUS_DISPLAY.map((d) => ({ value: d.value, label: d.label }))

interface ReportTrackerRow {
  id: string
  grant_id: string
  state: string
  locality: string
  err_code: string
  project_name: string
  donor: string | null
  date: string | null
  transfer_date: string | null
  amount_usd: number
  rate: number | null
  amount_sdg: number
  f4_status: string
  f5_status: string
  overdue: string | null
  f4_pct: number
  f5_pct: number
  tracker: number
}

function formatDate(d: string | null | undefined): string {
  if (d == null || d === '') return '—'
  try {
    const date = new Date(String(d))
    return Number.isNaN(date.getTime()) ? String(d) : date.toISOString().slice(0, 10)
  } catch {
    return String(d)
  }
}

function formatAmount(n: number | string | null | undefined): string {
  if (n == null || n === '') return '—'
  const num = typeof n === 'string' ? Number(n) : n
  if (Number.isNaN(num)) return '—'
  if (num === 0) return '0'
  return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

/** Waiting 0%, Under review 25%, Partial 50%, Completed 100% (same as API). */
function statusToPercent(status: string | null | undefined): number {
  const s = (status ?? '').toString().trim().toLowerCase()
  if (s === 'completed') return 100
  if (s === 'partial') return 50
  if (s === 'in review' || s === 'under review') return 25
  if (s === 'waiting') return 0
  return 0
}

/** Tracker progress bar color by percentage. */
function getTrackerBarClass(pct: number): string {
  if (pct >= 100) return 'bg-green-500'
  if (pct >= 50) return 'bg-amber-500'
  if (pct >= 25) return 'bg-blue-500'
  return 'bg-red-400'
}

export default function ReportTrackerPage() {
  const { i18n } = useTranslation()
  const { can } = useAllowedFunctions()
  const canViewPage = can('f4_f5_view_page')
  const isRtl = i18n.language === 'ar'
  const [rows, setRows] = useState<ReportTrackerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [filters, setFilters] = useState<ActiveFilter[]>([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/report-tracker')
      if (!res.ok) throw new Error('Failed to load data')
      const data = await res.json()
      setRows(
        Array.isArray(data)
          ? data.map((r: any) => ({
              id: r.id ?? '',
              grant_id: r.grant_id ?? '',
              state: r.state ?? '',
              locality: r.locality ?? '',
              err_code: r.err_code ?? '',
              project_name: r.project_name ?? '',
              donor: r.donor ?? null,
              date: r.date ?? null,
              transfer_date: r.transfer_date ?? null,
              amount_usd: Number(r.amount_usd) || 0,
              rate: r.rate != null && !Number.isNaN(Number(r.rate)) ? Number(r.rate) : null,
              amount_sdg: Number(r.amount_sdg) || 0,
              f4_status: r.f4_status ?? 'waiting',
              f5_status: r.f5_status ?? 'waiting',
              overdue: r.overdue ?? null,
              f4_pct: Number(r.f4_pct) || 0,
              f5_pct: Number(r.f5_pct) || 0,
              tracker: Number(r.tracker) || 0,
            }))
          : []
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error loading report tracker')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (canViewPage) load()
  }, [canViewPage])

  const stateOptions = Array.from(new Set(rows.map((r) => r.state).filter(Boolean))).sort()
  const donorOptions = Array.from(new Set(rows.map((r) => r.donor).filter((d): d is string => d != null && d !== ''))).sort()
  const filterFields = useMemo(
    () => getReportTrackerFilterFields({ stateOptions, donorOptions }),
    [stateOptions, donorOptions]
  )
  const getFieldValue = useCallback((row: ReportTrackerRow, fieldId: string): string | null | undefined => {
    if (fieldId === 'date_range') return row.date
    const key = fieldId as keyof ReportTrackerRow
    const v = row[key]
    return v != null ? String(v) : null
  }, [])
  const filteredRows = useMemo(
    () => applyFilters({ data: rows, filters, fields: filterFields, getFieldValue }),
    [rows, filters, filterFields, getFieldValue]
  )

  useEffect(() => {
    setPage(1)
  }, [filters])

  const totalFiltered = filteredRows.length
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize))
  const currentPage = Math.min(page, totalPages)
  const startIndex = (currentPage - 1) * pageSize
  const paginatedRows = filteredRows.slice(startIndex, startIndex + pageSize)

  const statsCards = useMemo(() => {
    const norm = (s: string) => {
      const v = (s ?? '').trim().toLowerCase()
      return v === 'under review' ? 'in review' : v
    }
    const f4Counts: Record<string, number> = {}
    const f5Counts: Record<string, number> = {}
    STATUS_DISPLAY.forEach((d) => {
      f4Counts[d.value] = 0
      f5Counts[d.value] = 0
    })
    let trackerSum = 0
    let totalUsd = 0
    filteredRows.forEach((row) => {
      const f4 = norm(row.f4_status)
      const f5 = norm(row.f5_status)
      f4Counts[f4] = (f4Counts[f4] ?? 0) + 1
      f5Counts[f5] = (f5Counts[f5] ?? 0) + 1
      trackerSum += row.tracker
      totalUsd += row.amount_usd ?? 0
    })
    const n = filteredRows.length
    const avgF4 = n > 0 ? filteredRows.reduce((a, r) => a + statusToPercent(r.f4_status), 0) / n : 0
    const avgF5 = n > 0 ? filteredRows.reduce((a, r) => a + statusToPercent(r.f5_status), 0) / n : 0
    const avgTracker = n > 0 ? trackerSum / n : 0

    const f4Segments: DonutSegment[] = STATUS_DISPLAY.map((d) => ({
      label: d.label,
      value: f4Counts[d.value] ?? 0,
      color: d.chartColor,
    }))
    const f5Segments: DonutSegment[] = STATUS_DISPLAY.map((d) => ({
      label: d.label,
      value: f5Counts[d.value] ?? 0,
      color: d.chartColor,
    }))
    const trackerSegments: DonutSegment[] = [
      { label: 'Tracker', value: avgTracker, color: '#7c3aed' },
      { label: 'Remaining', value: Math.max(0, 100 - avgTracker), color: '#e5e7eb' },
    ]
    return {
      avgF4: avgF4.toFixed(1),
      avgF5: avgF5.toFixed(1),
      avgTracker: avgTracker.toFixed(1),
      f4Segments,
      f5Segments,
      trackerSegments,
      totalCount: n,
      totalUsd,
    }
  }, [filteredRows])

  useEffect(() => {
    if (totalPages > 0 && page > totalPages) setPage(totalPages)
  }, [totalPages, page])

  const goToPage = (p: number) => {
    setPage(Math.max(1, Math.min(p, totalPages)))
  }

  const updateStatus = async (
    projectId: string,
    field: 'f4_status' | 'f5_status',
    value: string
  ) => {
    const normalized = value === 'in review' ? 'in review' : value
    setUpdatingId(projectId)
    try {
      const res = await fetch(`/api/projects/${projectId}/reporting-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: normalized }),
      })
      if (!res.ok) throw new Error('Update failed')
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== projectId) return r
          const nextF4 = field === 'f4_status' ? normalized : r.f4_status
          const nextF5 = field === 'f5_status' ? normalized : r.f5_status
          const f4_pct = statusToPercent(nextF4)
          const f5_pct = statusToPercent(nextF5)
          return { ...r, [field]: normalized, f4_pct, f5_pct, tracker: (f4_pct + f5_pct) / 2 }
        })
      )
    } catch (e) {
      console.error('Update reporting status:', e)
    } finally {
      setUpdatingId(null)
    }
  }

  const displayStatus = (s: string) =>
    STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s

  if (!canViewPage) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">You do not have permission to view this page.</p>
      </div>
    )
  }

  return (
    <div className="p-6">
      {!loading && (
        <div className="mb-6 grid gap-4 grid-cols-1 sm:grid-cols-3 lg:grid-cols-[minmax(200px,1fr)_minmax(200px,1fr)_minmax(200px,1fr)_minmax(200px,280px)]">
          <StatsDonutCard
            className="min-w-0"
            title="F4 Status"
            mainValue={statsCards.avgF4}
            mainSuffix="%"
            secondary={`${statsCards.totalCount} projects`}
            segments={statsCards.f4Segments}
            icon={<BarChart3 className="h-5 w-5" />}
          />
          <StatsDonutCard
            className="min-w-0"
            title="F5 Status"
            mainValue={statsCards.avgF5}
            mainSuffix="%"
            secondary={`${statsCards.totalCount} projects`}
            segments={statsCards.f5Segments}
            icon={<BarChart3 className="h-5 w-5" />}
          />
          <StatsDonutCard
            className="min-w-0"
            title="Tracker"
            mainValue={statsCards.avgTracker}
            mainSuffix="%"
            secondary={`${statsCards.totalCount} projects`}
            segments={statsCards.trackerSegments}
            singleSegmentMode
            icon={<BarChart3 className="h-5 w-5" />}
          />
          <div className="flex flex-col gap-4 min-w-0 sm:col-span-3 lg:col-span-1">
            <CompactStatCard
              title="Total USD Amount"
              value={`$${formatAmount(statsCards.totalUsd)}`}
              subtitle="Sum of amount USD (filtered)"
              icon={<DollarSign className="h-4 w-4" />}
            />
            <CompactStatCard
              title="Number of Projects"
              value={statsCards.totalCount}
              subtitle="Projects in current view"
              icon={<FolderOpen className="h-4 w-4" />}
            />
          </div>
        </div>
      )}
      <Card className="bg-transparent shadow-none">
        <CardHeader className="pb-4">
          {!loading && (
            <SmartFilter
              fields={filterFields}
              filters={filters}
              onFiltersChange={setFilters}
              urlParamPrefix="f_"
              title="Report Tracker"
              count={filteredRows.length}
            />
          )}
          {loading && (
            <h2 className="text-xl font-semibold">Report Tracker</h2>
          )}
        </CardHeader>
        <CardContent>
          {error && (
            <p className="text-destructive text-sm mb-4">{error}</p>
          )}
          {loading ? (
            <div className="table-container report-tracker-table report-tracker-table-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    {Array.from({ length: 15 }).map((_, i) => (
                      <TableHead key={i}>
                        <div className="h-4 w-16 rounded bg-white/20 animate-pulse" />
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from({ length: 10 }).map((_, r) => (
                    <TableRow key={r}>
                      {Array.from({ length: 15 }).map((_, c) => (
                        <TableCell key={c}>
                          <div className="h-5 w-full max-w-[70%] rounded bg-muted animate-pulse" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <>
            <div className="table-container report-tracker-table report-tracker-table-sm" dir="ltr">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left" dir="ltr">Serial Number</TableHead>
                    <TableHead className="text-left" dir="ltr">ERR Code</TableHead>
                    <TableHead className="text-left" dir="ltr">ERR Name</TableHead>
                    <TableHead className="text-left" dir="ltr">Donor</TableHead>
                    <TableHead className="text-center" dir="ltr">Date</TableHead>
                    <TableHead className="text-center" dir="ltr">Overdue</TableHead>
                    <TableHead className="text-left" dir="ltr">State</TableHead>
                    <TableHead className="text-left" dir="ltr">Locality</TableHead>
                    <TableHead className="text-left" dir="ltr">Transfer Date</TableHead>
                    <TableHead className="text-center tabular-nums" dir="ltr">USD</TableHead>
                    <TableHead className="text-center tabular-nums" dir="ltr">Rate</TableHead>
                    <TableHead className="text-center tabular-nums" dir="ltr">SDG</TableHead>
                    <TableHead className="text-left" dir="ltr">F4 Status</TableHead>
                    <TableHead className="text-left" dir="ltr">F5 Status</TableHead>
                    <TableHead className="text-center" dir="ltr">Tracker</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={15} className="text-muted-foreground text-center py-8">
                        {rows.length === 0 ? 'No projects found.' : 'No rows match the selected filters.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.grant_id}</TableCell>
                        <TableCell>{row.err_code}</TableCell>
                        <TableCell className="max-w-[200px] truncate" title={row.project_name}>
                          {row.project_name}
                        </TableCell>
                        <TableCell>{row.donor ?? '—'}</TableCell>
                        <TableCell>{formatDate(row.date)}</TableCell>
                        <TableCell
                          className={`text-center tabular-nums ${row.overdue ? 'text-red-700 font-medium' : ''}`}
                          style={
                            row.overdue
                              ? (() => {
                                  const days = parseInt(String(row.overdue), 10) || 0
                                  const t = Math.min(1, days / 60)
                                  const r = Math.round(254 - t * 127)
                                  const g = Math.round(226 - t * 226)
                                  const b = Math.round(226 - t * 197)
                                  return {
                                    background: `linear-gradient(90deg, #fef2f2, rgb(${r}, ${g}, ${b}))`,
                                  }
                                })()
                              : undefined
                          }
                        >
                          {row.overdue ?? '—'}
                        </TableCell>
                        <TableCell>{row.state}</TableCell>
                        <TableCell>{row.locality}</TableCell>
                        <TableCell>{formatDate(row.transfer_date)}</TableCell>
                        <TableCell className="text-center tabular-nums" dir="ltr">${formatAmount(row.amount_usd)}</TableCell>
                        <TableCell className="text-center tabular-nums" dir="ltr">{row.rate != null ? formatAmount(row.rate) : '—'}</TableCell>
                        <TableCell className="text-center tabular-nums" dir="ltr">{formatAmount(row.amount_sdg)}</TableCell>
                        <TableCell>
                          <Select
                            value={row.f4_status}
                            onValueChange={(v) => updateStatus(row.id, 'f4_status', v)}
                            disabled={updatingId === row.id}
                          >
                            <SelectTrigger className="w-[160px] border-0 shadow-none focus:ring-0 [&>:last-child]:hidden">
                              <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent className="report-tracker-status-select">
                              {STATUS_DISPLAY.map((d) => (
                                <SelectItem key={d.value} value={d.value}>
                                  <span
                                    className="inline-block rounded-[12px] py-1 px-3 text-sm font-medium"
                                    style={{ backgroundColor: d.pillBg, color: d.pillText }}
                                  >
                                    {d.label}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={row.f5_status}
                            onValueChange={(v) => updateStatus(row.id, 'f5_status', v)}
                            disabled={updatingId === row.id}
                          >
                            <SelectTrigger className="w-[160px] border-0 shadow-none focus:ring-0 [&>:last-child]:hidden">
                              <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent className="report-tracker-status-select">
                              {STATUS_DISPLAY.map((d) => (
                                <SelectItem key={d.value} value={d.value}>
                                  <span
                                    className="inline-block rounded-[12px] py-1 px-3 text-sm font-medium"
                                    style={{ backgroundColor: d.pillBg, color: d.pillText }}
                                  >
                                    {d.label}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-center">
                          {(() => {
                            const pct = (statusToPercent(row.f4_status) + statusToPercent(row.f5_status)) / 2
                            return (
                              <div className="flex items-center justify-center gap-2">
                                <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${getTrackerBarClass(pct)}`}
                                    style={{ width: `${Math.min(100, pct)}%` }}
                                  />
                                </div>
                                <span className="tabular-nums text-xs font-medium w-8">{Math.round(pct)}%</span>
                              </div>
                            )
                          })()}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
              {!loading && filteredRows.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-4 mt-4 py-2">
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span>
                      Showing {startIndex + 1} to {Math.min(startIndex + pageSize, totalFiltered)} of {totalFiltered}
                    </span>
                    <span className="text-muted-foreground/70">|</span>
                    <span className="text-muted-foreground">Rows per page</span>
                    <Select
                      value={String(pageSize)}
                      onValueChange={(v) => {
                        setPageSize(Number(v))
                        setPage(1)
                      }}
                    >
                      <SelectTrigger className="w-[72px] h-8 rounded-md border border-border bg-background text-foreground">
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
                      variant="outline"
                      size="sm"
                      className="h-9 rounded-md border border-border bg-background text-muted-foreground hover:bg-muted/50"
                      onClick={() => goToPage(currentPage - 1)}
                      disabled={currentPage <= 1}
                    >
                      <ChevronLeft className="h-4 w-4 mr-0.5" />
                      Previous
                    </Button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                      .reduce<number[]>((acc, p, i, arr) => {
                        if (i > 0 && p - arr[i - 1] > 1) acc.push(-1)
                        acc.push(p)
                        return acc
                      }, [])
                      .map((p, idx) =>
                        p === -1 ? (
                          <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">…</span>
                        ) : (
                          <Button
                            key={p}
                            variant={p === currentPage ? 'default' : 'outline'}
                            size="sm"
                            className={`h-9 min-w-[2.25rem] rounded-md ${
                              p === currentPage
                                ? 'bg-primary text-primary-foreground hover:bg-primary/90 border-0'
                                : 'border border-border bg-background text-foreground hover:bg-muted/50'
                            }`}
                            onClick={() => goToPage(p)}
                          >
                            {p}
                          </Button>
                        )
                      )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 rounded-md border border-border bg-background text-muted-foreground hover:bg-muted/50"
                      onClick={() => goToPage(currentPage + 1)}
                      disabled={currentPage >= totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-0.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
