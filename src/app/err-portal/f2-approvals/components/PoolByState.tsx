'use client'

import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronUp, BarChart } from 'lucide-react'
import { poolByStateRows } from '@/lib/poolByState'

export default function PoolByState() {
  const [byState, setByState] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
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
      setByState(poolByStateRows(bs))
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
            By State
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
                  <button
                    onClick={() => handleSort('assigned')}
                    className="flex items-center justify-end hover:text-primary cursor-pointer w-full"
                  >
                    <div className="font-semibold">Assigned</div>
                    {getSortIcon('assigned')}
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button
                    onClick={() => handleSort('available')}
                    className="flex items-center justify-end hover:text-primary cursor-pointer w-full"
                  >
                    <div className="font-semibold">Available</div>
                    {getSortIcon('available')}
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
                    onClick={() => handleSort('balance')}
                    className="flex items-center justify-end hover:text-primary cursor-pointer w-full"
                  >
                    <div className="font-semibold">Balance</div>
                    {getSortIcon('balance')}
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(() => {
                const sortedByState = getSortedByState()
                return (
                  <>
                    {sortedByState.length > 0 && (
                      <TableRow className="font-semibold">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right">{fmt(sortedByState.reduce((s, r) => s + (r.allocated || 0), 0))}</TableCell>
                        <TableCell className="text-right">{fmt(sortedByState.reduce((s, r) => s + (r.assigned || 0), 0))}</TableCell>
                        <TableCell className={`text-right ${sortedByState.reduce((s, r) => s + (r.available || 0), 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {fmt(sortedByState.reduce((s, r) => s + (r.available || 0), 0))}
                        </TableCell>
                        <TableCell className="text-right">{fmt(sortedByState.reduce((s, r) => s + (r.committed || 0), 0))}</TableCell>
                        <TableCell className="text-right">{fmt(sortedByState.reduce((s, r) => s + (r.pending || 0), 0))}</TableCell>
                        <TableCell className={`text-right ${sortedByState.reduce((s, r) => s + (r.balance || r.remaining || 0), 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {fmt(sortedByState.reduce((s, r) => s + (r.balance || r.remaining || 0), 0))}
                        </TableCell>
                      </TableRow>
                    )}
                    {sortedByState.map(r => (
                      <TableRow key={r.state_name}>
                        <TableCell>{r.state_name}</TableCell>
                        <TableCell className="text-right">{fmt(r.allocated)}</TableCell>
                        <TableCell className="text-right">{fmt(r.assigned || 0)}</TableCell>
                        <TableCell className={`text-right ${(r.available || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(r.available || 0)}</TableCell>
                        <TableCell className="text-right">{fmt(r.committed)}</TableCell>
                        <TableCell className="text-right">{fmt(r.pending)}</TableCell>
                        <TableCell className={`text-right ${(r.balance ?? r.remaining) >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(r.balance ?? r.remaining)}</TableCell>
                      </TableRow>
                    ))}
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

