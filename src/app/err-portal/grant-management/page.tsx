'use client'

import { useTranslation } from 'react-i18next'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { ArrowLeft } from 'lucide-react'

import { CycleManager } from './components'

export default function GrantManagementPage() {
  const { t } = useTranslation(['err', 'common'])
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<{ total_available: number; total_committed: number; total_pending: number; remaining: number } | null>(null)
  const [counts, setCounts] = useState<{ vetting: number; approved: number; allocated: number; committed: number }>({ vetting: 0, approved: 0, allocated: 0, committed: 0 })

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        // Pool summary
        const pool = await fetch('/api/pool/summary').then(r => r.json())
        setSummary(pool)
        // F1 counts
        const [
          { count: vettingCount },
          { count: approvedCount },
          { count: allocatedCount },
          { count: committedCount }
        ] = await Promise.all([
          supabase.from('err_projects').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('source', 'err_app'),
          supabase.from('err_projects').select('id', { count: 'exact', head: true }).eq('status', 'approved').eq('funding_status', 'unassigned'),
          supabase.from('err_projects').select('id', { count: 'exact', head: true }).eq('funding_status', 'allocated'),
          supabase.from('err_projects').select('id', { count: 'exact', head: true }).eq('funding_status', 'committed')
        ])
        setCounts({ vetting: vettingCount || 0, approved: approvedCount || 0, allocated: allocatedCount || 0, committed: committedCount || 0 })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            onClick={() => router.push('/err-portal')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('common:back')}
          </Button>
          <h2 className="text-2xl font-semibold">{t('err:grant_management')}</h2>
        </div>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Total Included</CardTitle>
            <div className="text-xs text-muted-foreground">Funds added to the pool across cycles</div>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{summary ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(summary.total_available) : '—'}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Committed</CardTitle>
            <div className="text-xs text-muted-foreground">Approved spend confirmed against grants</div>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{summary ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(summary.total_committed) : '—'}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pending</CardTitle>
            <div className="text-xs text-muted-foreground">Assigned but not yet committed (allocated)</div>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{summary ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(summary.total_pending) : '—'}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Remaining</CardTitle>
            <div className="text-xs text-muted-foreground">Available = Included − Committed − Pending</div>
          </CardHeader>
          <CardContent className={`text-2xl font-bold ${summary && summary.remaining >= 0 ? 'text-green-700' : 'text-red-700'}`}>{summary ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(summary.remaining) : '—'}</CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="cursor-pointer" onClick={() => router.push('/err-portal/f1-work-plans?err_sub=new')}>
          <CardHeader>
            <CardTitle>Submitted</CardTitle>
            <div className="text-xs text-muted-foreground">ERR F1s submitted and still under vetting (status = pending)</div>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{counts.vetting}</CardContent>
        </Card>
        <Card className="cursor-pointer" onClick={() => router.push('/err-portal/f1-work-plans?err_sub=assignment')}>
          <CardHeader>
            <CardTitle>Approved for grant assignment</CardTitle>
            <div className="text-xs text-muted-foreground">Approved by vetting and waiting to be assigned to a grant (status = approved, funding = unassigned)</div>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{counts.approved}</CardContent>
        </Card>
        <Card className="cursor-pointer" onClick={() => router.push('/err-portal/f2-approvals?tab=uncommitted')}>
          <CardHeader>
            <CardTitle>Assigned</CardTitle>
            <div className="text-xs text-muted-foreground">Assigned to a grant call and pending commitment (funding = allocated)</div>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{counts.allocated}</CardContent>
        </Card>
        <Card className="cursor-pointer" onClick={() => router.push('/err-portal/f2-approvals?tab=committed')}>
          <CardHeader>
            <CardTitle>Committed</CardTitle>
            <div className="text-xs text-muted-foreground">Finalized spending committed against the pool (funding = committed)</div>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{counts.committed}</CardContent>
        </Card>
      </div>

      {/* Cycle Management System */}
      <CycleManager />
    </div>
  )
}