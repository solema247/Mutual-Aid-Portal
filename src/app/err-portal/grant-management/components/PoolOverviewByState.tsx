'use client'

import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronUp, BarChart } from 'lucide-react'

export default function PoolOverviewByState() {
  const [byState, setByState] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [totalAllocations, setTotalAllocations] = useState(0)
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [isCollapsed, setIsCollapsed] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const bs = await fetch('/api/pool/by-state', { cache: 'no-store' }).then(r => r.json())
      setByState(Array.isArray(bs) ? bs : [])
      
      // Fetch total allocation count from allocations_by_date
      try {
        const countRes = await fetch('/api/distribution-decisions/allocations/count', { cache: 'no-store' })
        if (countRes.ok) {
          const countData = await countRes.json()
          setTotalAllocations(countData.count || 0)
        } else {
          // Fallback: count states with allocations > 0
          const statesWithAllocations = Array.isArray(bs) ? bs.filter((s: any) => (s.allocated || 0) > 0).length : 0
          setTotalAllocations(statesWithAllocations)
        }
      } catch {
        // Fallback: count states with allocations > 0
        const statesWithAllocations = Array.isArray(bs) ? bs.filter((s: any) => (s.allocated || 0) > 0).length : 0
        setTotalAllocations(statesWithAllocations)
      }
    } catch (e) {
      console.error('Pool by-state load error:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    await loadData()
  }

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="h-3 w-3 ml-1" />
    ) : (
      <ArrowDown className="h-3 w-3 ml-1" />
    )
  }

  const getSortedByState = () => {
    if (!sortColumn) {
      // Default: alphabetical by state name
      return [...byState].sort((a, b) => a.state_name.localeCompare(b.state_name))
    }

    const sorted = [...byState].sort((a, b) => {
      const aVal = a[sortColumn] || 0
      const bVal = b[sortColumn] || 0

      if (sortColumn === 'state_name') {
        return sortDirection === 'asc' 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal)
      }

      // Numeric columns: highest to lowest by default
      if (sortDirection === 'asc') {
        return aVal - bVal
      } else {
        return bVal - aVal
      }
    })

    return sorted
  }

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle 
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            <BarChart className="h-5 w-5" />
            Pool Overview By State
            {isCollapsed && totalAllocations > 0 && (
              <span className="text-sm font-normal text-muted-foreground ml-2">
                ({totalAllocations} {totalAllocations === 1 ? 'allocation' : 'allocations'})
              </span>
            )}
            {isCollapsed ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </CardTitle>
          {!isCollapsed && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          )}
        </div>
      </CardHeader>
      {!isCollapsed && (
        <CardContent className="p-0 overflow-x-auto">
          <Table className="min-w-[920px] text-xs [&_th]:py-1.5 [&_th]:px-2 [&_td]:py-1 [&_td]:px-2">
            <TableHeader>
              <TableRow>
                <TableHead rowSpan={2} className="px-2 align-bottom border-b">
                  <button
                    onClick={() => handleSort('state_name')}
                    className="flex items-center hover:text-primary cursor-pointer"
                  >
                    <div className="font-semibold text-xs">State</div>
                    {getSortIcon('state_name')}
                  </button>
                </TableHead>
                <TableHead 
                  colSpan={5} 
                  className="text-center px-2 border-b font-semibold text-xs bg-slate-50"
                >
                  <div>Allocation Pool Overview</div>
                  <div className="text-[10px] font-normal text-muted-foreground">Distribution allocations and current usage</div>
                </TableHead>
                <TableHead 
                  colSpan={3} 
                  className="text-center px-2 border-b font-semibold text-xs bg-sky-100"
                >
                  <div>Pipeline</div>
                  <div className="text-[10px] font-normal text-muted-foreground">Projects in approval and assignment workflow</div>
                </TableHead>
              </TableRow>
              <TableRow>
                <TableHead className="text-right px-2">
                  <button
                    onClick={() => handleSort('decision_count')}
                    className="flex items-center justify-end hover:text-primary cursor-pointer w-full"
                    title="Distinct distribution decisions with an allocation in this state"
                  >
                    <div className="font-semibold text-xs">Decisions</div>
                    {getSortIcon('decision_count')}
                  </button>
                </TableHead>
                <TableHead className="text-right px-2">
                  <button
                    onClick={() => handleSort('allocated')}
                    className="flex items-center justify-end hover:text-primary cursor-pointer w-full"
                  >
                    <div className="font-semibold text-xs">Allocated</div>
                    {getSortIcon('allocated')}
                  </button>
                </TableHead>
                <TableHead className="text-right px-2">
                  <div className="font-semibold text-xs">% of Total</div>
                </TableHead>
                <TableHead className="text-right px-2">
                  <button
                    onClick={() => handleSort('assigned')}
                    className="flex items-center justify-end hover:text-primary cursor-pointer w-full"
                    title="Historical activity plus portal projects already on a grant"
                  >
                    <div className="font-semibold text-xs">Assigned</div>
                    {getSortIcon('assigned')}
                  </button>
                </TableHead>
                <TableHead className="text-right px-2">
                  <button
                    onClick={() => handleSort('available')}
                    className="flex items-center justify-end hover:text-primary cursor-pointer w-full"
                    title="Allocated minus Assigned"
                  >
                    <div className="font-semibold text-xs">Available</div>
                    {getSortIcon('available')}
                  </button>
                </TableHead>
                <TableHead className="text-right px-2">
                  <button
                    onClick={() => handleSort('committed')}
                    className="flex items-center justify-end hover:text-primary cursor-pointer w-full"
                    title="F2-approved projects not yet assigned to a grant"
                  >
                    <div className="font-semibold text-xs">Committed</div>
                    {getSortIcon('committed')}
                  </button>
                </TableHead>
                <TableHead className="text-right px-2">
                  <button
                    onClick={() => handleSort('pending')}
                    className="flex items-center justify-end hover:text-primary cursor-pointer w-full"
                    title="Projects not yet F2-approved"
                  >
                    <div className="font-semibold text-xs">Pending</div>
                    {getSortIcon('pending')}
                  </button>
                </TableHead>
                <TableHead className="text-right px-2">
                  <button
                    onClick={() => handleSort('balance')}
                    className="flex items-center justify-end hover:text-primary cursor-pointer w-full"
                    title="Available minus Committed minus Pending"
                  >
                    <div className="font-semibold text-xs">Balance</div>
                    {getSortIcon('balance')}
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(() => {
                const sortedByState = getSortedByState()
                const sum = (key: string) => sortedByState.reduce((s, r) => s + (Number(r[key]) || 0), 0)
                const totalAllocated = sum('allocated')
                const totalAvailable = sum('available')
                const totalBalance = sum('balance')
                return (
                  <>
                    {sortedByState.length > 0 && (
                      <TableRow className="font-semibold">
                        <TableCell className="px-2">Total</TableCell>
                        <TableCell
                          className="text-right whitespace-nowrap"
                          title="Distinct decisions across all states (not a sum of the rows)"
                        >
                          {sortedByState[0]?.overall_decision_count ?? 0}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">{fmt(totalAllocated)}</TableCell>
                        <TableCell className="text-right">100%</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{fmt(sum('assigned'))}</TableCell>
                        <TableCell className={`text-right whitespace-nowrap ${totalAvailable >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {fmt(totalAvailable)}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">{fmt(sum('committed'))}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{fmt(sum('pending'))}</TableCell>
                        <TableCell className={`text-right whitespace-nowrap ${totalBalance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {fmt(totalBalance)}
                        </TableCell>
                      </TableRow>
                    )}
                    {sortedByState.map(r => {
                      const percentOfTotal = totalAllocated > 0 ? ((r.allocated || 0) / totalAllocated * 100) : 0
                      return (
                        <TableRow key={r.state_name}>
                          <TableCell className="px-2">{r.state_name}</TableCell>
                          <TableCell className="text-right whitespace-nowrap">{r.decision_count || 0}</TableCell>
                          <TableCell className="text-right whitespace-nowrap">{fmt(r.allocated)}</TableCell>
                          <TableCell className="text-right">{percentOfTotal.toFixed(1)}%</TableCell>
                          <TableCell className="text-right whitespace-nowrap">{fmt(r.assigned || 0)}</TableCell>
                          <TableCell className={`text-right whitespace-nowrap ${(r.available || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {fmt(r.available || 0)}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">{fmt(r.committed)}</TableCell>
                          <TableCell className="text-right whitespace-nowrap">{fmt(r.pending)}</TableCell>
                          <TableCell className={`text-right whitespace-nowrap ${(r.balance ?? r.remaining) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {fmt(r.balance ?? r.remaining)}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </>
                )
              })()}
            </TableBody>
          </Table>
        </CardContent>
      )}
    </Card>
  )
}

