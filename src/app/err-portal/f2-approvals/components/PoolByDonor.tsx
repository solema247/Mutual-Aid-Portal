'use client'

import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { RefreshCw, ChevronDown, ChevronUp, Building2 } from 'lucide-react'

export default function PoolByDonor() {
  const [byDonor, setByDonor] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isCollapsed, setIsCollapsed] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const bd = await fetch('/api/pool/by-donor', { cache: 'no-store' }).then(r => r.json())
      setByDonor(Array.isArray(bd) ? bd : [])
    } catch (e) {
      console.error('Pool by-donor load error:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    await loadData()
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
            <Building2 className="h-5 w-5" />
            By Grant
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
                  <div className="font-semibold">Grant ID</div>
                </TableHead>
                <TableHead>
                  <div className="font-semibold">Project Name</div>
                </TableHead>
                <TableHead className="text-right">
                  <div className="font-semibold">Included</div>
                </TableHead>
                <TableHead className="text-right">
                  <div className="font-semibold">Historical</div>
                </TableHead>
                <TableHead className="text-right">
                  <div className="font-semibold">Assigned</div>
                </TableHead>
                <TableHead className="text-right">
                  <div className="font-semibold">Remaining</div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Total row */}
              {byDonor.length > 0 && (() => {
                const totals = byDonor.reduce((acc, r) => ({
                  included: acc.included + (r.included || 0),
                  historical: acc.historical + (r.historical || 0),
                  assigned: acc.assigned + (r.assigned || 0),
                  remaining: acc.remaining + (r.remaining || 0)
                }), { included: 0, historical: 0, assigned: 0, remaining: 0 })
                return (
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell>-</TableCell>
                    <TableCell className="text-right">{fmt(totals.included)}</TableCell>
                    <TableCell className="text-right">{fmt(totals.historical)}</TableCell>
                    <TableCell className="text-right">{fmt(totals.assigned)}</TableCell>
                    <TableCell className={`text-right ${totals.remaining >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(totals.remaining)}</TableCell>
                  </TableRow>
                )
              })()}
              {byDonor.map((r, i) => (
                <TableRow key={`${r.grant_id || r.grant_call_id}-${i}`}>
                  <TableCell>{r.grant_id || '-'}</TableCell>
                  <TableCell>{r.grant_call_name || r.project_name || '-'}</TableCell>
                  <TableCell className="text-right">{fmt(r.included)}</TableCell>
                  <TableCell className="text-right">{fmt(r.historical || 0)}</TableCell>
                  <TableCell className="text-right">{fmt(r.assigned || 0)}</TableCell>
                  <TableCell className={`text-right ${r.remaining >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(r.remaining)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      )}
    </Card>
  )
}

