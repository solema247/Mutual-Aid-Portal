'use client'

import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useTranslation } from 'react-i18next'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { RefreshCw, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { CollapsibleRow } from '@/components/ui/collapsible'

export default function PoolDashboard({ showProposals = true, showByDonor = true, showSummaryCards = true, showByState = true }: { showProposals?: boolean; showByDonor?: boolean; showSummaryCards?: boolean; showByState?: boolean }) {
  const { t } = useTranslation(['f1_plans'])
  const [summary, setSummary] = useState<{ total_included: number; total_committed: number; total_pending: number; remaining: number; total_grants: number; total_not_included: number } | null>(null)
  const [byState, setByState] = useState<any[]>([])
  const [byDonor, setByDonor] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [proposal, setProposal] = useState<{ state?: string; grantCallId?: string; amount: number }>({ amount: 0 })
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    const load = async () => {
      try {
        const [s, bs, bd] = await Promise.all([
          fetch('/api/pool/summary', { cache: 'no-store' }).then(r => r.json()),
          fetch('/api/pool/by-state', { cache: 'no-store' }).then(r => r.json()),
          fetch('/api/pool/by-donor', { cache: 'no-store' }).then(r => r.json())
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

  // Bridge: listen for proposal events from DirectUpload when enabled
  useEffect(() => {
    if (!showProposals) return
    const handler = (e: any) => {
      const detail = e?.detail || {}
      setProposal({ state: detail.state, grantCallId: detail.grant_call_id, amount: Number(detail.amount) || 0 })
    }
    window.addEventListener('f1-proposal', handler as EventListener)
    return () => window.removeEventListener('f1-proposal', handler as EventListener)
  }, [showProposals])

  // Listen for explicit refresh requests after submit
  useEffect(() => {
    const refresh = async () => {
      try {
        setLoading(true)
        const [s, bs, bd] = await Promise.all([
          fetch('/api/pool/summary', { cache: 'no-store' }).then(r => r.json()),
          fetch('/api/pool/by-state', { cache: 'no-store' }).then(r => r.json()),
          fetch('/api/pool/by-donor', { cache: 'no-store' }).then(r => r.json())
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

  const handleRefresh = async () => {
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

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      // Default to ascending for state_name, descending for numerical columns
      setSortDirection(column === 'state_name' ? 'asc' : 'desc')
    }
  }

  const getSortedByState = () => {
    if (!sortColumn) return byState

    const sorted = [...byState].sort((a, b) => {
      let aVal: any
      let bVal: any

      if (sortColumn === 'state_name') {
        aVal = a.state_name || ''
        bVal = b.state_name || ''
        return sortDirection === 'asc' 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal)
      } else {
        // Numerical columns: allocated, historical_commitments, committed, pending, remaining
        aVal = a[sortColumn] || 0
        bVal = b[sortColumn] || 0
        return sortDirection === 'desc' 
          ? bVal - aVal  // Highest to lowest
          : aVal - bVal
      }
    })

    return sorted
  }

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-4 w-4 ml-1 inline" />
    }
    return sortDirection === 'desc' 
      ? <ArrowDown className="h-4 w-4 ml-1 inline" />
      : <ArrowUp className="h-4 w-4 ml-1 inline" />
  }

  if (loading && !summary) return <div className="text-sm text-muted-foreground">{t('pool.loading')}</div>

  return (
    <div className="space-y-6">
      {showSummaryCards && summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card><CardHeader><CardTitle>{t('pool.total')}</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{fmt(summary.total_included)}</CardContent></Card>
          <Card><CardHeader><CardTitle>{t('pool.committed')}</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{fmt(summary.total_committed)}</CardContent></Card>
          <Card><CardHeader><CardTitle>{t('pool.pending')}</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{fmt(summary.total_pending)}</CardContent></Card>
          <Card><CardHeader><CardTitle>{t('pool.remaining')}</CardTitle></CardHeader><CardContent className={`text-2xl font-bold ${summary.remaining >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(summary.remaining)}</CardContent></Card>
        </div>
      )}

      {showByState && (
        <CollapsibleRow title={t('pool.by_state.title')} defaultOpen={true}>
        <div className="flex flex-row items-center justify-between mb-4">
          <div className="text-sm text-muted-foreground">
            {t('pool.by_state.title')}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <button
                  onClick={() => handleSort('state_name')}
                  className="flex items-center hover:text-primary cursor-pointer"
                >
                  <div className="font-semibold">{t('pool.by_state.state')}</div>
                  {getSortIcon('state_name')}
                </button>
                <div className="text-xs text-muted-foreground">{t('pool.by_state.state_desc')}</div>
              </TableHead>
              <TableHead className="text-right">
                <button
                  onClick={() => handleSort('allocated')}
                  className="flex items-center justify-end hover:text-primary cursor-pointer w-full"
                >
                  <div className="font-semibold">{t('pool.by_state.allocated')}</div>
                  {getSortIcon('allocated')}
                </button>
                <div className="text-xs text-muted-foreground">{t('pool.by_state.allocated_desc')}</div>
              </TableHead>
              <TableHead className="text-right">
                <button
                  onClick={() => handleSort('historical_commitments')}
                  className="flex items-center justify-end hover:text-primary cursor-pointer w-full"
                >
                  <div className="font-semibold">Historical Commitments</div>
                  {getSortIcon('historical_commitments')}
                </button>
                <div className="text-xs text-muted-foreground">Historical USD from activities</div>
              </TableHead>
              <TableHead className="text-right">
                <button
                  onClick={() => handleSort('committed')}
                  className="flex items-center justify-end hover:text-primary cursor-pointer w-full"
                >
                  <div className="font-semibold">{t('pool.by_state.committed')}</div>
                  {getSortIcon('committed')}
                </button>
                <div className="text-xs text-muted-foreground">{t('pool.by_state.committed_desc')}</div>
              </TableHead>
              <TableHead className="text-right">
                <button
                  onClick={() => handleSort('pending')}
                  className="flex items-center justify-end hover:text-primary cursor-pointer w-full"
                >
                  <div className="font-semibold">{t('pool.by_state.pending')}</div>
                  {getSortIcon('pending')}
                </button>
                <div className="text-xs text-muted-foreground">{t('pool.by_state.pending_desc')}</div>
              </TableHead>
              <TableHead className="text-right">
                <button
                  onClick={() => handleSort('remaining')}
                  className="flex items-center justify-end hover:text-primary cursor-pointer w-full"
                >
                  <div className="font-semibold">{t('pool.by_state.remaining')}</div>
                  {getSortIcon('remaining')}
                </button>
                <div className="text-xs text-muted-foreground">{t('pool.by_state.remaining_desc')}</div>
              </TableHead>
              {showProposals && (
                <>
                  <TableHead className="text-right">
                    <div className="font-semibold">{t('pool.by_state.proposed')}</div>
                    <div className="text-xs text-muted-foreground">{t('pool.by_state.proposed_desc')}</div>
                  </TableHead>
                  <TableHead className="text-right">
                    <div className="font-semibold">{t('pool.by_state.remainder')}</div>
                    <div className="text-xs text-muted-foreground">{t('pool.by_state.remainder_desc')}</div>
                  </TableHead>
                </>
              )}
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
                      <TableCell className="text-right">{fmt(sortedByState.reduce((s, r) => s + (r.historical_commitments || 0), 0))}</TableCell>
                      <TableCell className="text-right">{fmt(sortedByState.reduce((s, r) => s + (r.committed || 0), 0))}</TableCell>
                      <TableCell className="text-right">{fmt(sortedByState.reduce((s, r) => s + (r.pending || 0), 0))}</TableCell>
                      <TableCell className={`text-right ${sortedByState.reduce((s, r) => s + (r.remaining || 0), 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {fmt(sortedByState.reduce((s, r) => s + (r.remaining || 0), 0))}
                      </TableCell>
                      {showProposals && (
                        <>
                          <TableCell className="text-right">{fmt(proposal.amount || 0)}</TableCell>
                          <TableCell className={`text-right ${(sortedByState.reduce((s, r) => s + (r.remaining || 0), 0) - (proposal.amount || 0)) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {fmt(sortedByState.reduce((s, r) => s + (r.remaining || 0), 0) - (proposal.amount || 0))}
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  )}
                  {sortedByState.map(r => (
                    <TableRow key={r.state_name}>
                      <TableCell>{r.state_name}</TableCell>
                      <TableCell className="text-right">{fmt(r.allocated)}</TableCell>
                      <TableCell className="text-right">{fmt(r.historical_commitments || 0)}</TableCell>
                      <TableCell className="text-right">{fmt(r.committed)}</TableCell>
                      <TableCell className="text-right">{fmt(r.pending)}</TableCell>
                      <TableCell className={`text-right ${r.remaining >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(r.remaining)}</TableCell>
                      {showProposals && (
                        <>
                          <TableCell className="text-right">{proposal.state === r.state_name ? fmt(proposal.amount) : fmt(0)}</TableCell>
                          <TableCell className={`text-right ${((r.remaining - (proposal.state === r.state_name ? proposal.amount : 0)) >= 0) ? 'text-green-700' : 'text-red-700'}`}>
                            {fmt(r.remaining - (proposal.state === r.state_name ? proposal.amount : 0))}
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  ))}
                </>
              )
            })()}
          </TableBody>
        </Table>
      </CollapsibleRow>
      )}

      {showByDonor && (
        <Card>
          <CardHeader><CardTitle>{t('pool.by_donor.title')}</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <div className="font-semibold">{t('pool.by_donor.donor')}</div>
                    <div className="text-xs text-muted-foreground">{t('pool.by_donor.donor_desc')}</div>
                  </TableHead>
                  <TableHead>
                    <div className="font-semibold">{t('pool.by_donor.grant')}</div>
                    <div className="text-xs text-muted-foreground">{t('pool.by_donor.grant_desc')}</div>
                  </TableHead>
                  <TableHead className="text-right">
                    <div className="font-semibold">{t('pool.by_donor.included')}</div>
                    <div className="text-xs text-muted-foreground">{t('pool.by_donor.included_desc')}</div>
                  </TableHead>
                  <TableHead className="text-right">
                    <div className="font-semibold">{t('pool.by_donor.committed')}</div>
                    <div className="text-xs text-muted-foreground">{t('pool.by_donor.committed_desc')}</div>
                  </TableHead>
                  <TableHead className="text-right">
                    <div className="font-semibold">{t('pool.by_donor.pending')}</div>
                    <div className="text-xs text-muted-foreground">{t('pool.by_donor.pending_desc')}</div>
                  </TableHead>
                  <TableHead className="text-right">
                    <div className="font-semibold">{t('pool.by_donor.remaining')}</div>
                    <div className="text-xs text-muted-foreground">{t('pool.by_donor.remaining_desc')}</div>
                  </TableHead>
                  {showProposals && (
                    <>
                      <TableHead className="text-right">
                        <div className="font-semibold">{t('pool.by_donor.proposed')}</div>
                        <div className="text-xs text-muted-foreground">{t('pool.by_donor.proposed_desc')}</div>
                      </TableHead>
                      <TableHead className="text-right">
                        <div className="font-semibold">{t('pool.by_donor.remainder')}</div>
                        <div className="text-xs text-muted-foreground">{t('pool.by_donor.remainder_desc')}</div>
                      </TableHead>
                    </>
                  )}
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
                    {showProposals && (
                      <>
                        <TableCell className="text-right">{proposal.grantCallId === r.grant_call_id ? fmt(proposal.amount) : fmt(0)}</TableCell>
                        <TableCell className={`text-right ${((r.remaining - (proposal.grantCallId === r.grant_call_id ? proposal.amount : 0)) >= 0) ? 'text-green-700' : 'text-red-700'}`}>
                          {fmt(r.remaining - (proposal.grantCallId === r.grant_call_id ? proposal.amount : 0))}
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

    </div>
  )
}


