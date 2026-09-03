'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'
import { GithubProjectBoardCard } from '@/app/err-portal/raise-a-ticket/GithubProjectBoardCard'
import { TicketsByTypeChart } from '@/app/err-portal/raise-a-ticket/TicketsByTypeChart'
import { BigRockExplainer } from '@/app/err-portal/raise-a-ticket/BigRockExplainer'
import { ActiveIterationTasks } from '@/app/err-portal/raise-a-ticket/ActiveIterationTasks'
import { SprintAnalyticsSection } from '@/app/err-portal/raise-a-ticket/SprintAnalyticsSection'
import { BigRockTaskStatusChart } from '@/app/err-portal/raise-a-ticket/BigRockTaskStatusChart'
import { GITHUB_PROJECT_BIG_ROCKS } from '@/lib/raiseTicketGithub'
import '@/i18n/config'

export default function TicketDashboardPage () {
  const { t } = useTranslation(['err', 'common'])
  const router = useRouter()
  const { can, isLoading: permissionsLoading } = useAllowedFunctions()
  const canViewPage = can('raise_ticket_page')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!permissionsLoading && !canViewPage) {
      router.replace('/err-portal')
    }
  }, [canViewPage, permissionsLoading, router])

  useEffect(() => {
    if (permissionsLoading || !canViewPage) return
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/users/me')
        if (!res.ok) {
          if (res.status === 401) {
            window.location.href = '/login'
            return
          }
          setError(t('err:raise_ticket_load_error', 'Could not verify your session.'))
          return
        }
        const data = await res.json()
        if (data.status !== 'active') {
          window.location.href = '/login'
          return
        }
        setReady(true)
      } catch {
        setError(t('err:raise_ticket_load_error', 'Could not verify your session.'))
      }
    }
    void checkAuth()
  }, [t, permissionsLoading, canViewPage])

  if (permissionsLoading) {
    return <div className="p-6">{t('common:loading', 'Loading...')}</div>
  }
  if (!canViewPage) return null
  if (!ready && !error) {
    return <div className="p-6">{t('common:loading', 'Loading...')}</div>
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="space-y-4">
        <Link
          href="/err-portal"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground -ml-2"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('common:back_to_home')}
        </Link>
        <h1 className="text-3xl font-bold">
          {t('err:raise_ticket_dashboard_nav', 'Ticket dashboard')}
        </h1>
        <p className="text-muted-foreground">
          {t(
            'err:raise_ticket_dashboard_intro',
            'Live reporting from the Mutual Aid Portal GitHub project board—Big Rocks, sprints, and open work.'
          )}
        </p>
        <p className="text-sm text-muted-foreground border-l-2 border-muted pl-3">
          {t(
            'err:raise_ticket_dashboard_note',
            'Figures reflect board fields set during weekly triage; use the project board link below for full detail.'
          )}
        </p>
        <p className="text-sm">
          <Link
            href="/err-portal/raise-a-ticket"
            className="text-primary underline font-medium"
          >
            {t('err:raise_ticket_link_raise', 'Raise a ticket')}
          </Link>
        </p>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="max-w-3xl">
          <GithubProjectBoardCard />
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="sm:col-span-2 xl:col-span-2">
            <TicketsByTypeChart enabled={ready} />
          </div>
          <div className="sm:col-span-2 xl:col-span-2">
            <BigRockExplainer />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {GITHUB_PROJECT_BIG_ROCKS.map((bigRock) => (
            <BigRockTaskStatusChart key={bigRock} bigRock={bigRock} enabled={ready} />
          ))}
        </div>
        <ActiveIterationTasks enabled={ready} />
        <SprintAnalyticsSection enabled={ready} />
      </div>
    </div>
  )
}
