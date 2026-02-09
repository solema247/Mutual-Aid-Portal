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
  const [isCollapsed, setIsCollapsed] = useState(true)

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
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button
                    onClick={() => handleSort('state_name')}
                    className="flex items-center hover:text-primary cursor-pointer"
                  >
                    <div className="font-semibold">State</div>
                    {getSortIcon('state_name')}
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button
                    onClick={() => handleSort('allocated')}
                    className="flex items-center justify-end hover:text-primary cursor-pointer w-full"
                  >
                    <div className="font-semibold">Allocated</div>
                    {getSortIcon('allocated')}
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <div className="font-semibold">% of Total Allocated</div>
                </TableHead>
                <TableHead className="text-right">
                  <button
                    onClick={() => handleSort('historical_commitments')}
                    className="flex items-center justify-end hover:text-primary cursor-pointer w-full"
                  >
                    <div className="font-semibold">Historical Commitments</div>
                    {getSortIcon('historical_commitments')}
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button
                    onClick={() => handleSort('committed')}
                    className="flex items-center justify-end hover:text-primary cursor-pointer w-full"
                  >
                    <div className="font-semibold">Committed</div>
                    {getSortIcon('committed')}
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button
                    onClick={() => handleSort('pending')}
                    className="flex items-center justify-end hover:text-primary cursor-pointer w-full"
                  >
                    <div className="font-semibold">Pending</div>
                    {getSortIcon('pending')}
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button
                    onClick={() => handleSort('remaining')}
                    className="flex items-center justify-end hover:text-primary cursor-pointer w-full"
                  >
                    <div className="font-semibold">Remaining</div>
                    {getSortIcon('remaining')}
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(() => {
                const sortedByState = getSortedByState()
                const totalAllocated = sortedByState.reduce((s, r) => s + (r.allocated || 0), 0)
                return (
                  <>
                    {sortedByState.length > 0 && (
                      <TableRow className="font-semibold">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right">{fmt(totalAllocated)}</TableCell>
                        <TableCell className="text-right">100%</TableCell>
                        <TableCell className="text-right">{fmt(sortedByState.reduce((s, r) => s + (r.historical_commitments || 0), 0))}</TableCell>
                        <TableCell className="text-right">{fmt(sortedByState.reduce((s, r) => s + (r.committed || 0), 0))}</TableCell>
                        <TableCell className="text-right">{fmt(sortedByState.reduce((s, r) => s + (r.pending || 0), 0))}</TableCell>
                        <TableCell className={`text-right ${sortedByState.reduce((s, r) => s + (r.remaining || 0), 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {fmt(sortedByState.reduce((s, r) => s + (r.remaining || 0), 0))}
                        </TableCell>
                      </TableRow>
                    )}
                    {sortedByState.map(r => {
                      const percentOfTotal = totalAllocated > 0 ? ((r.allocated || 0) / totalAllocated * 100) : 0
                      return (
                        <TableRow key={r.state_name}>
                          <TableCell>{r.state_name}</TableCell>
                          <TableCell className="text-right">{fmt(r.allocated)}</TableCell>
                          <TableCell className="text-right">{percentOfTotal.toFixed(1)}%</TableCell>
                          <TableCell className="text-right">{fmt(r.historical_commitments || 0)}</TableCell>
                          <TableCell className="text-right">{fmt(r.committed)}</TableCell>
                          <TableCell className="text-right">{fmt(r.pending)}</TableCell>
                          <TableCell className={`text-right ${r.remaining >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(r.remaining)}</TableCell>
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

