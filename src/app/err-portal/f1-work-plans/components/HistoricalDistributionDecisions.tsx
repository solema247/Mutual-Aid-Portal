'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'

type StateAgg = {
  state: string
  total_amount: number
  decision_count: number
  percent_total: number
}

export default function HistoricalDistributionDecisions() {
  const [rows, setRows] = useState<StateAgg[]>([])
  const [loading, setLoading] = useState(false)

  const fetchAgg = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/distribution-decisions/allocations/by-state')
      if (!res.ok) throw new Error('Failed to load allocations by state')
      const data = await res.json()
      setRows(data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAgg()
  }, [])

  const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) return '—'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
  }

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => b.total_amount - a.total_amount)
  }, [rows])

  const totals = useMemo(() => {
    const totalAmount = rows.reduce((s, r) => s + (r.total_amount || 0), 0)
    const totalDecisions = rows.reduce((s, r) => s + (r.decision_count || 0), 0)
    return { totalAmount, totalDecisions }
  }, [rows])

  return (
    <Card className="border-0">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Historical distribution decisions by state</CardTitle>
          <Button variant="outline" size="icon" onClick={fetchAgg} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-muted-foreground">Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>State</TableHead>
                  <TableHead className="text-right">Total Allocated</TableHead>
                  <TableHead className="text-right">Decisions</TableHead>
                  <TableHead className="text-right">% of Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.length > 0 && (
                  <TableRow className="font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">{formatCurrency(totals.totalAmount)}</TableCell>
                    <TableCell className="text-right">{totals.totalDecisions}</TableCell>
                    <TableCell className="text-right">100%</TableCell>
                  </TableRow>
                )}
                {sorted.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                      No data
                    </TableCell>
                  </TableRow>
                ) : (
                  sorted.map((row) => (
                    <TableRow key={row.state}>
                      <TableCell className="font-medium">{row.state}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.total_amount)}</TableCell>
                      <TableCell className="text-right">{row.decision_count}</TableCell>
                      <TableCell className="text-right">
                        {Number.isFinite(row.percent_total) ? `${row.percent_total.toFixed(1)}%` : '—'}
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
  )
}

