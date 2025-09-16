'use client'

import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default function PoolDashboard() {
  const [summary, setSummary] = useState<{ total_available: number; total_committed: number; total_pending: number; remaining: number } | null>(null)
  const [byState, setByState] = useState<any[]>([])
  const [byDonor, setByDonor] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [proposal, setProposal] = useState<{ state?: string; grantCallId?: string; amount: number }>({ amount: 0 })

  useEffect(() => {
    const load = async () => {
      try {
        const [s, bs, bd] = await Promise.all([
          fetch('/api/pool/summary').then(r => r.json()),
          fetch('/api/pool/by-state').then(r => r.json()),
          fetch('/api/pool/by-donor').then(r => r.json())
        ])
        setSummary(s)
        setByState(Array.isArray(bs) ? bs : [])
        setByDonor(Array.isArray(bd) ? bd : [])
      } catch (e) {
        console.error('Pool dashboard load error:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Bridge: listen for proposal events from DirectUpload
  useEffect(() => {
    const handler = (e: any) => {
      const detail = e?.detail || {}
      setProposal({ state: detail.state, grantCallId: detail.grant_call_id, amount: Number(detail.amount) || 0 })
    }
    window.addEventListener('f1-proposal', handler as EventListener)
    return () => window.removeEventListener('f1-proposal', handler as EventListener)
  }, [])

  // Listen for explicit refresh requests after submit
  useEffect(() => {
    const refresh = async () => {
      try {
        setLoading(true)
        const [s, bs, bd] = await Promise.all([
          fetch('/api/pool/summary').then(r => r.json()),
          fetch('/api/pool/by-state').then(r => r.json()),
          fetch('/api/pool/by-donor').then(r => r.json())
        ])
        setSummary(s)
        setByState(Array.isArray(bs) ? bs : [])
        setByDonor(Array.isArray(bd) ? bd : [])
        // Clear proposal overlays
        setProposal({ amount: 0 })
      } catch (e) {
        console.error('Pool dashboard refresh error:', e)
      } finally {
        setLoading(false)
      }
    }
    const onRefresh = () => { refresh() }
    window.addEventListener('pool-refresh', onRefresh)
    return () => window.removeEventListener('pool-refresh', onRefresh)
  }, [])

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0)

  if (loading) return <div className="text-sm text-muted-foreground">Loading balances…</div>

  return (
    <div className="space-y-6">
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card><CardHeader><CardTitle>Total</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{fmt(summary.total_available)}</CardContent></Card>
          <Card><CardHeader><CardTitle>Committed</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{fmt(summary.total_committed)}</CardContent></Card>
          <Card><CardHeader><CardTitle>Pending</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{fmt(summary.total_pending)}</CardContent></Card>
          <Card><CardHeader><CardTitle>Remaining</CardTitle></CardHeader><CardContent className={`text-2xl font-bold ${summary.remaining >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(summary.remaining)}</CardContent></Card>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>By State</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>State</TableHead>
                <TableHead className="text-right">Allocated (total assigned)</TableHead>
                <TableHead className="text-right">Committed (approved spend)</TableHead>
                <TableHead className="text-right">Pending (not yet committed)</TableHead>
                <TableHead className="text-right">Remaining (alloc - committed - pending)</TableHead>
                <TableHead className="text-right">Proposed (this upload)</TableHead>
                <TableHead className="text-right">Remainder If Applied (after proposal)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byState.map(r => (
                <TableRow key={r.state_name}>
                  <TableCell>{r.state_name}</TableCell>
                  <TableCell className="text-right">{fmt(r.allocated)}</TableCell>
                  <TableCell className="text-right">{fmt(r.committed)}</TableCell>
                  <TableCell className="text-right">{fmt(r.pending)}</TableCell>
                  <TableCell className={`text-right ${r.remaining >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(r.remaining)}</TableCell>
                  <TableCell className="text-right">{proposal.state === r.state_name ? fmt(proposal.amount) : fmt(0)}</TableCell>
                  <TableCell className={`text-right ${((r.remaining - (proposal.state === r.state_name ? proposal.amount : 0)) >= 0) ? 'text-green-700' : 'text-red-700'}`}>
                    {fmt(r.remaining - (proposal.state === r.state_name ? proposal.amount : 0))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>By Donor/Grant</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Donor</TableHead>
                <TableHead>Grant (Grant Call)</TableHead>
                <TableHead className="text-right">Included (added to pool)</TableHead>
                <TableHead className="text-right">Committed (approved spend)</TableHead>
                <TableHead className="text-right">Pending (not yet committed)</TableHead>
                <TableHead className="text-right">Remaining (incl - committed - pending)</TableHead>
                <TableHead className="text-right">Proposed (this upload)</TableHead>
                <TableHead className="text-right">Remainder If Applied (after proposal)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byDonor.map((r, i) => (
                <TableRow key={`${r.grant_call_id}-${i}`}>
                  <TableCell>{r.donor_name || '-'}</TableCell>
                  <TableCell>{r.grant_call_name || r.grant_call_id}</TableCell>
                  <TableCell className="text-right">{fmt(r.included)}</TableCell>
                  <TableCell className="text-right">{fmt(r.committed)}</TableCell>
                  <TableCell className="text-right">{fmt(r.pending)}</TableCell>
                  <TableCell className={`text-right ${r.remaining >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(r.remaining)}</TableCell>
                  <TableCell className="text-right">{proposal.grantCallId === r.grant_call_id ? fmt(proposal.amount) : fmt(0)}</TableCell>
                  <TableCell className={`text-right ${((r.remaining - (proposal.grantCallId === r.grant_call_id ? proposal.amount : 0)) >= 0) ? 'text-green-700' : 'text-red-700'}`}>
                    {fmt(r.remaining - (proposal.grantCallId === r.grant_call_id ? proposal.amount : 0))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}


