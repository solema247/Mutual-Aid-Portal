'use client'

import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useTranslation } from 'react-i18next'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { CollapsibleRow } from '@/components/ui/collapsible'

export default function PoolDashboard({ showProposals = true, showByDonor = true }: { showProposals?: boolean; showByDonor?: boolean }) {
  const { t } = useTranslation(['f1_plans'])
  const [summary, setSummary] = useState<{ total_included: number; total_committed: number; total_pending: number; remaining: number; total_grants: number; total_not_included: number } | null>(null)
  const [byState, setByState] = useState<any[]>([])
  const [byDonor, setByDonor] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [proposal, setProposal] = useState<{ state?: string; grantCallId?: string; amount: number }>({ amount: 0 })

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

  if (loading && !summary) return <div className="text-sm text-muted-foreground">{t('pool.loading')}</div>

  return (
    <div className="space-y-6">
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card><CardHeader><CardTitle>{t('pool.total')}</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{fmt(summary.total_included)}</CardContent></Card>
          <Card><CardHeader><CardTitle>{t('pool.committed')}</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{fmt(summary.total_committed)}</CardContent></Card>
          <Card><CardHeader><CardTitle>{t('pool.pending')}</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{fmt(summary.total_pending)}</CardContent></Card>
          <Card><CardHeader><CardTitle>{t('pool.remaining')}</CardTitle></CardHeader><CardContent className={`text-2xl font-bold ${summary.remaining >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(summary.remaining)}</CardContent></Card>
        </div>
      )}

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
                <div className="font-semibold">{t('pool.by_state.state')}</div>
                <div className="text-xs text-muted-foreground">{t('pool.by_state.state_desc')}</div>
              </TableHead>
              <TableHead className="text-right">
                <div className="font-semibold">{t('pool.by_state.allocated')}</div>
                <div className="text-xs text-muted-foreground">{t('pool.by_state.allocated_desc')}</div>
              </TableHead>
              <TableHead className="text-right">
                <div className="font-semibold">{t('pool.by_state.committed')}</div>
                <div className="text-xs text-muted-foreground">{t('pool.by_state.committed_desc')}</div>
              </TableHead>
              <TableHead className="text-right">
                <div className="font-semibold">{t('pool.by_state.pending')}</div>
                <div className="text-xs text-muted-foreground">{t('pool.by_state.pending_desc')}</div>
              </TableHead>
              <TableHead className="text-right">
                <div className="font-semibold">{t('pool.by_state.remaining')}</div>
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
            {byState.map(r => (
              <TableRow key={r.state_name}>
                <TableCell>{r.state_name}</TableCell>
                <TableCell className="text-right">{fmt(r.allocated)}</TableCell>
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
          </TableBody>
        </Table>
      </CollapsibleRow>

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


