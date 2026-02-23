'use client'

import { useTranslation } from 'react-i18next'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'

import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'
import { GrantCallsManager } from './components'
import DistributionDecisionTableView from './components/DistributionDecisionTableView'
import PoolOverviewByState from './components/PoolOverviewByState'

export default function GrantManagementPage() {
  const { t } = useTranslation(['err', 'common'])
  const router = useRouter()
  const { can } = useAllowedFunctions()
  const canViewGrantManagement = can('grant_view')
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<{ 
    total_included: number;
    total_committed: number;
    total_pending: number;
    remaining: number;
    total_grants: number;
    total_not_included: number;
  } | null>(null)

  useEffect(() => {
    if (!canViewGrantManagement) {
      router.replace('/err-portal')
      return
    }
    const load = async () => {
      try {
        setLoading(true)
        // Pool summary
        const pool = await fetch('/api/pool/summary', { cache: 'no-store' }).then(r => r.json())
        setSummary(pool)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [canViewGrantManagement, router])

  if (!canViewGrantManagement) {
    return null
  }

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

      {/* Overview cards: 1=Allocated, 2=Transferred, 3=Committed, 4=Pending, 5=Remaining (Transferred − Committed − Pending) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="flex flex-col h-full">
          <CardHeader className="flex-shrink-0 space-y-1.5 pb-2">
            <CardTitle className="text-sm leading-tight">{t('err:gm.total_funds_allocated')}</CardTitle>
            <div className="text-xs text-muted-foreground line-clamp-2">{t('err:gm.total_funds_allocated_desc')}</div>
          </CardHeader>
          <CardContent className="pt-0 mt-auto">
            <div className="text-2xl font-bold">
              {summary ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(summary.total_included) : '—'}
            </div>
          </CardContent>
        </Card>
        <Card className="flex flex-col h-full">
          <CardHeader className="flex-shrink-0 space-y-1.5 pb-2">
            <CardTitle className="text-sm leading-tight">{t('err:gm.total_funds_transferred')}</CardTitle>
            <div className="text-xs text-muted-foreground line-clamp-2">{t('err:gm.total_funds_transferred_desc')}</div>
          </CardHeader>
          <CardContent className="pt-0 mt-auto">
            <div className="text-2xl font-bold">
              {summary ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(summary.total_grants) : '—'}
            </div>
          </CardContent>
        </Card>
        <Card className="flex flex-col h-full">
          <CardHeader className="flex-shrink-0 space-y-1.5 pb-2">
            <CardTitle className="text-sm leading-tight">{t('err:gm.committed')}</CardTitle>
            <div className="text-xs text-muted-foreground line-clamp-2">{t('err:gm.committed_desc')}</div>
          </CardHeader>
          <CardContent className="pt-0 mt-auto text-2xl font-bold">{summary ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(summary.total_committed) : '—'}</CardContent>
        </Card>
        <Card className="flex flex-col h-full">
          <CardHeader className="flex-shrink-0 space-y-1.5 pb-2">
            <CardTitle className="text-sm leading-tight">{t('err:gm.pending')}</CardTitle>
            <div className="text-xs text-muted-foreground line-clamp-2">{t('err:gm.pending_desc')}</div>
          </CardHeader>
          <CardContent className="pt-0 mt-auto text-2xl font-bold">{summary ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(summary.total_pending) : '—'}</CardContent>
        </Card>
        <Card className="flex flex-col h-full">
          <CardHeader className="flex-shrink-0 space-y-1.5 pb-2">
            <CardTitle className="text-sm leading-tight">{t('err:gm.remaining')}</CardTitle>
            <div className="text-xs text-muted-foreground line-clamp-2">{t('err:gm.remaining_desc')}</div>
          </CardHeader>
          <CardContent className={`pt-0 mt-auto text-2xl font-bold ${summary && (summary.total_grants - summary.total_committed - summary.total_pending) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            {summary ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(summary.total_grants - summary.total_committed - summary.total_pending) : '—'}
          </CardContent>
        </Card>
      </div>

      {/* Grant Calls Management */}
      <GrantCallsManager />

      {/* Distribution Decisions (read-only from Airtable; original DistributionDecisionsManager kept for later use) */}
      <DistributionDecisionTableView />

      {/* Pool Overview By State */}
      <PoolOverviewByState />
    </div>
  )
}