'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { ChevronDown, ChevronUp, ChevronRight, ClipboardList, ChevronLeft, ArrowDown, ArrowUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'

const PER_PAGE = 15

type AllocationRow = {
  allocation_id: string | null
  decision_key: string
  state: string | null
  allocation_amount: number | null
  percent_decision_amount: number | null
  restriction: string | null
  decision_date: string | null
}

type DecisionGroup = {
  decisionKey: string
  sumAllocationAmount: number
  restriction: string | null
  decisionDate: string | null
  allocations: AllocationRow[]
}

function formatUsd(value: number | null): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatPercent(value: number | null): string {
  if (value == null) return '—'
  return `${Number(value).toFixed(1)}%`
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr)
    if (Number.isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
}

/** Parse date string to timestamp for sorting (null => NaN). */
function dateToSortKey(dateStr: string | null): number {
  if (!dateStr) return Number.NaN
  const t = new Date(dateStr).getTime()
  return Number.isNaN(t) ? Number.NaN : t
}

export default function DistributionDecisionTableView() {
  const [allocations, setAllocations] = useState<AllocationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [dateSortOrder, setDateSortOrder] = useState<'desc' | 'asc'>('desc')
  const [isCollapsed, setIsCollapsed] = useState(true)

  const decisions = useMemo((): DecisionGroup[] => {
    const byKey = new Map<string, AllocationRow[]>()
    for (const row of allocations) {
      const key = row.decision_key || '—'
      if (!byKey.has(key)) byKey.set(key, [])
      byKey.get(key)!.push(row)
    }
    const result: DecisionGroup[] = []
    for (const [decisionKey, rows] of byKey.entries()) {
      const sumAllocationAmount = rows.reduce(
        (sum, r) => sum + (r.allocation_amount ?? 0),
        0
      )
      const restriction = rows.map((r) => r.restriction).find(Boolean) ?? null
      const decisionDate = rows.map((r) => r.decision_date).find(Boolean) ?? null
      result.push({
        decisionKey,
        sumAllocationAmount,
        restriction,
        decisionDate,
        allocations: rows,
      })
    }
    result.sort((a, b) => {
      const ta = dateToSortKey(a.decisionDate)
      const tb = dateToSortKey(b.decisionDate)
      const na = Number.isNaN(ta)
      const nb = Number.isNaN(tb)
      if (na && nb) return a.decisionKey.localeCompare(b.decisionKey)
      if (na) return dateSortOrder === 'desc' ? 1 : -1
      if (nb) return dateSortOrder === 'desc' ? -1 : 1
      if (dateSortOrder === 'desc') return tb - ta
      return ta - tb
    })
    return result
  }, [allocations, dateSortOrder])

  const totalPages = Math.max(1, Math.ceil(decisions.length / PER_PAGE))
  const from = (page - 1) * PER_PAGE
  const paginatedDecisions = decisions.slice(from, from + PER_PAGE)

  useEffect(() => {
    if (page > totalPages && totalPages > 0) setPage(1)
  }, [page, totalPages])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const res = await fetch('/api/allocations', { cache: 'no-store' })
        if (!res.ok) throw new Error(res.statusText)
        const data = await res.json()
        if (!cancelled) setAllocations(data)
      } catch (e) {
        console.error('Failed to fetch allocations', e)
        if (!cancelled) setAllocations([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  function toggleExpand(key: string) {
    setExpandedKey((prev) => (prev === key ? null : key))
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Allocations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <ClipboardList className="h-5 w-5" />
          Allocations
          {isCollapsed && decisions.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground ml-2">
              ({decisions.length} {decisions.length === 1 ? 'decision' : 'decisions'})
            </span>
          )}
          {isCollapsed ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
        </CardTitle>
      </CardHeader>
      {!isCollapsed && (
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Decision</TableHead>
                <TableHead
                  className="cursor-pointer select-none hover:bg-muted/50 transition-colors"
                  onClick={() => setDateSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'))}
                >
                  <span className="inline-flex items-center gap-1">
                    Date
                    {dateSortOrder === 'desc' ? (
                      <ArrowDown className="h-4 w-4" />
                    ) : (
                      <ArrowUp className="h-4 w-4" />
                    )}
                  </span>
                </TableHead>
                <TableHead>Sum allocation amount</TableHead>
                <TableHead>Restriction</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {decisions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No allocations found
                  </TableCell>
                </TableRow>
              ) : (
                paginatedDecisions.map((dec) => (
                  <React.Fragment key={dec.decisionKey}>
                    <TableRow
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => toggleExpand(dec.decisionKey)}
                    >
                      <TableCell className="w-10">
                        {expandedKey === dec.decisionKey ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{dec.decisionKey}</span>
                      </TableCell>
                      <TableCell>{formatDate(dec.decisionDate)}</TableCell>
                      <TableCell>{formatUsd(dec.sumAllocationAmount)}</TableCell>
                      <TableCell>{dec.restriction ?? '—'}</TableCell>
                    </TableRow>
                    {expandedKey === dec.decisionKey && (
                      <TableRow>
                        <TableCell colSpan={5} className="bg-muted/30 p-0">
                          <div className="px-4 py-3">
                            <p className="text-xs font-medium text-muted-foreground mb-2">
                              State allocations
                            </p>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>State</TableHead>
                                  <TableHead>Allocation amount</TableHead>
                                  <TableHead>% of decision</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {dec.allocations.map((a, i) => {
                                  const percent =
                                    a.percent_decision_amount != null
                                      ? a.percent_decision_amount
                                      : dec.sumAllocationAmount > 0 && (a.allocation_amount ?? 0) > 0
                                        ? ((a.allocation_amount ?? 0) / dec.sumAllocationAmount) * 100
                                        : null
                                  return (
                                    <TableRow key={a.allocation_id ?? i}>
                                      <TableCell>{a.state ?? '—'}</TableCell>
                                      <TableCell>{formatUsd(a.allocation_amount)}</TableCell>
                                      <TableCell>{formatPercent(percent)}</TableCell>
                                    </TableRow>
                                  )
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {decisions.length > PER_PAGE && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-muted-foreground">
              Showing {from + 1}–{Math.min(from + PER_PAGE, decisions.length)} of {decisions.length}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
      )}
    </Card>
  )
}
