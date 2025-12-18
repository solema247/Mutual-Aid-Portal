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
            By Donor/Grant
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
                  <div className="font-semibold">Donor</div>
                </TableHead>
                <TableHead>
                  <div className="font-semibold">Grant</div>
                </TableHead>
                <TableHead className="text-right">
                  <div className="font-semibold">Included</div>
                </TableHead>
                <TableHead className="text-right">
                  <div className="font-semibold">Committed</div>
                </TableHead>
                <TableHead className="text-right">
                  <div className="font-semibold">Pending</div>
                </TableHead>
                <TableHead className="text-right">
                  <div className="font-semibold">Remaining</div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byDonor.map((r, i) => (
                <TableRow key={`${r.grant_id || r.grant_call_id}-${i}`}>
                  <TableCell>{r.donor_name || '-'}</TableCell>
                  <TableCell>{r.grant_call_name || r.grant_id || r.grant_call_id || '-'}</TableCell>
                  <TableCell className="text-right">{fmt(r.included)}</TableCell>
                  <TableCell className="text-right">{fmt(r.committed)}</TableCell>
                  <TableCell className="text-right">{fmt(r.pending)}</TableCell>
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

