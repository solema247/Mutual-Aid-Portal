'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Archive, Download, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ArchiveRow {
  id: string
  grant_id: string | null
  grant_serial_id: string | null
  state: string | null
  completed_at: string | null
  err_code: string | null
  err_name: string | null
  donor_id: string | null
  donor_name: string | null
  donor_short_name: string | null
  grant_call_id: string | null
  grant_call_name: string | null
  grant_call_shortname: string | null
  files: {
    f1: boolean
    f2: boolean
    f3_mou: boolean
    f3_signed: boolean
    payment_confirmation: boolean
    f4_count: number
    f5_count: number
  }
}

type PeriodMode = 'month' | 'range' | 'all'

function previousMonth(): string {
  const d = new Date()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() - 1)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function FileBadge({ label, present }: { label: string; present: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium border',
        present
          ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800'
          : 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800'
      )}
      title={present ? `${label} document available` : `${label} document missing`}
    >
      {label}
    </span>
  )
}

export default function DataArchivePage() {
  const router = useRouter()
  const { can, isLoading: permissionsLoading } = useAllowedFunctions()
  const canViewPage = can('data_archive_view_page')
  const canDownload = can('data_archive_download')

  useEffect(() => {
    if (!permissionsLoading && !canViewPage) {
      router.replace('/err-portal')
    }
  }, [permissionsLoading, canViewPage, router])

  const [periodMode, setPeriodMode] = useState<PeriodMode>('month')
  const [month, setMonth] = useState<string>(previousMonth())
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')
  const [includeUndated, setIncludeUndated] = useState(false)
  const [donorFilter, setDonorFilter] = useState<string>('all')

  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<ArchiveRow[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadRows = useCallback(async () => {
    if (periodMode === 'month' && !month) return
    if (periodMode === 'range' && (!fromDate || !toDate)) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (periodMode === 'month') params.set('month', month)
      if (periodMode === 'range') {
        params.set('from', fromDate)
        params.set('to', toDate)
      }
      if (periodMode !== 'all' && includeUndated) params.set('include_undated', 'true')
      const res = await fetch(`/api/data-archive/completed?${params.toString()}`)
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Failed to load completed projects')
      }
      const j = await res.json()
      setRows(j.rows || [])
      setSelected(new Set())
    } catch (e: any) {
      console.error(e)
      setError(e.message || 'Failed to load completed projects')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [periodMode, month, fromDate, toDate, includeUndated])

  useEffect(() => {
    if (!permissionsLoading && canViewPage) loadRows()
  }, [permissionsLoading, canViewPage, loadRows])

  const donorOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of rows) {
      if (r.donor_id) map.set(r.donor_id, r.donor_short_name || r.donor_name || r.donor_id)
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

  const filteredRows = useMemo(() => {
    if (donorFilter === 'all') return rows
    return rows.filter((r) => r.donor_id === donorFilter)
  }, [rows, donorFilter])

  const allSelected = filteredRows.length > 0 && filteredRows.every((r) => selected.has(r.id))

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filteredRows.map((r) => r.id)))
    }
  }

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const runExport = async (projectIds: string[]) => {
    if (!projectIds.length) return
    setExporting(true)
    setError(null)
    try {
      const res = await fetch('/api/data-archive/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_ids: projectIds })
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Export failed')
      }
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') || ''
      const match = disposition.match(/filename="([^"]+)"/)
      const filename = match?.[1] || `data-archive-${new Date().toISOString().slice(0, 10)}.zip`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      console.error(e)
      setError(e.message || 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'

  if (permissionsLoading || !canViewPage) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Archive className="h-7 w-7" />
          Data Archive
        </h1>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Export period</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Period</Label>
              <Select value={periodMode} onValueChange={(v) => setPeriodMode(v as PeriodMode)}>
                <SelectTrigger className="h-9 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Month</SelectItem>
                  <SelectItem value="range">Custom range</SelectItem>
                  <SelectItem value="all">All completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {periodMode === 'month' && (
              <div className="space-y-1.5">
                <Label className="text-sm">Month</Label>
                <Input type="month" className="h-9 w-44" value={month} onChange={(e) => setMonth(e.target.value)} />
              </div>
            )}
            {periodMode === 'range' && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-sm">From</Label>
                  <Input type="date" className="h-9 w-40" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">To</Label>
                  <Input type="date" className="h-9 w-40" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label className="text-sm">Backdonor grant</Label>
              <Select value={donorFilter} onValueChange={setDonorFilter}>
                <SelectTrigger className="h-9 w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All donors</SelectItem>
                  {donorOptions.map(([id, label]) => (
                    <SelectItem key={id} value={id}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {periodMode !== 'all' && (
              <div className="flex items-center gap-2 pb-2">
                <Checkbox
                  id="include-undated"
                  checked={includeUndated}
                  onCheckedChange={(v) => setIncludeUndated(v === true)}
                />
                <Label htmlFor="include-undated" className="text-sm cursor-pointer">
                  Include projects without a completion date
                </Label>
              </div>
            )}
            <div className="pb-0.5">
              <Button variant="outline" size="sm" onClick={loadRows} disabled={loading}>
                <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
                Refresh
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Only microgrants marked as completed are available for export. Files are organized as
            Month (YYYY-MM) &gt; Backdonor Grant &gt; Serial Number, with a manifest recording original
            file locations and completion metadata in each folder.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Completed microgrants
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {filteredRows.length} project{filteredRows.length === 1 ? '' : 's'}
                {selected.size > 0 ? ` · ${selected.size} selected` : ''}
              </span>
            </CardTitle>
            {canDownload && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={exporting || selected.size === 0}
                  onClick={() => runExport(Array.from(selected))}
                >
                  <Download className={cn('h-4 w-4 mr-2', exporting && 'animate-pulse')} />
                  Export selected
                </Button>
                <Button
                  size="sm"
                  disabled={exporting || filteredRows.length === 0}
                  onClick={() => runExport(filteredRows.map((r) => r.id))}
                >
                  <Download className={cn('h-4 w-4 mr-2', exporting && 'animate-pulse')} />
                  {exporting ? 'Preparing zip…' : 'Export all'}
                </Button>
              </div>
            )}
          </div>
          {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">Loading…</div>
          ) : (
            <div className="overflow-x-auto w-full">
              <Table className="min-w-[900px] text-xs [&_th]:py-1.5 [&_td]:py-1.5 [&_th]:px-2 [&_td]:px-2">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
                    </TableHead>
                    <TableHead className="whitespace-nowrap">Serial Number</TableHead>
                    <TableHead className="whitespace-nowrap">Backdonor Grant</TableHead>
                    <TableHead className="whitespace-nowrap">ERR</TableHead>
                    <TableHead className="whitespace-nowrap">State</TableHead>
                    <TableHead className="whitespace-nowrap">Completed</TableHead>
                    <TableHead className="whitespace-nowrap">Files</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                        No completed microgrants found for this period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRows.map((r) => (
                      <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => toggleRow(r.id)}>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selected.has(r.id)}
                            onCheckedChange={() => toggleRow(r.id)}
                            aria-label={`Select ${r.grant_id || r.id}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium whitespace-nowrap">
                          {r.grant_id || r.grant_serial_id || '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {r.donor_short_name || r.donor_name || '—'}
                          {r.grant_call_shortname || r.grant_call_name ? (
                            <span className="text-muted-foreground"> · {r.grant_call_shortname || r.grant_call_name}</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{r.err_code || r.err_name || '—'}</TableCell>
                        <TableCell className="whitespace-nowrap">{r.state || '—'}</TableCell>
                        <TableCell className="whitespace-nowrap" title={r.completed_at || 'No completion date recorded'}>
                          {formatDate(r.completed_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <FileBadge label="F1" present={r.files.f1} />
                            <FileBadge label="F2" present={r.files.f2} />
                            <FileBadge label="F3" present={r.files.f3_mou || r.files.f3_signed} />
                            <FileBadge label="Pay" present={r.files.payment_confirmation} />
                            <FileBadge label={`F4${r.files.f4_count > 1 ? ` (${r.files.f4_count})` : ''}`} present={r.files.f4_count > 0} />
                            <FileBadge label={`F5${r.files.f5_count > 1 ? ` (${r.files.f5_count})` : ''}`} present={r.files.f5_count > 0} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
