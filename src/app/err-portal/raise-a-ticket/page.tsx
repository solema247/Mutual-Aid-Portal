'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  GITHUB_RAISE_TICKET_LABELS,
  RAISE_TICKET_LABEL_I18N_KEYS,
  RAISE_TICKET_PRIORITIES,
} from '@/lib/raiseTicketGithub'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'
import { TicketsByTypeChart } from '@/app/err-portal/raise-a-ticket/TicketsByTypeChart'
import { BigRockExplainer } from '@/app/err-portal/raise-a-ticket/BigRockExplainer'
import { ActiveIterationTasks } from '@/app/err-portal/raise-a-ticket/ActiveIterationTasks'
import { SprintAnalyticsSection } from '@/app/err-portal/raise-a-ticket/SprintAnalyticsSection'
import { BigRockTaskStatusChart } from '@/app/err-portal/raise-a-ticket/BigRockTaskStatusChart'
import { GITHUB_PROJECT_BIG_ROCKS } from '@/lib/raiseTicketGithub'
import '@/i18n/config'

const GITHUB_PROJECT_BOARD_URL =
  process.env.NEXT_PUBLIC_GITHUB_PROJECT_BOARD_URL ||
  'https://github.com/users/solema247/projects/6/views/7'

export default function RaiseATicketPage () {
  const { t } = useTranslation(['err', 'common'])
  const router = useRouter()
  const { can, isLoading: permissionsLoading } = useAllowedFunctions()
  const canViewPage = can('raise_ticket_page')
  const [ready, setReady] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [label, setLabel] = useState<string>('')
  const [priority, setPriority] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [issueUrl, setIssueUrl] = useState<string | null>(null)

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

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIssueUrl(null)
    if (!label) {
      setError(t('err:raise_ticket_select_issue_type', 'Please select an issue type.'))
      return
    }
    if (!priority) {
      setError(t('err:raise_ticket_select_priority', 'Please select a priority.'))
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/support/github-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          label,
          priority,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        html_url?: string
        detail?: string
        retryAfter?: number
      }
      if (!res.ok) {
        if (res.status === 403) {
          setError(
            t(
              'err:raise_ticket_forbidden',
              'You do not have permission to raise tickets. Ask an admin if you need access.'
            )
          )
          return
        }
        if (res.status === 429 && typeof data.retryAfter === 'number' && data.retryAfter > 0) {
          const sec = data.retryAfter
          setError(
            sec < 90
              ? t('err:raise_ticket_rate_limited_seconds', { count: sec })
              : t('err:raise_ticket_rate_limited_minutes', {
                  count: Math.max(1, Math.ceil(sec / 60)),
                })
          )
        } else {
          setError(data.detail ?? data.error ?? t('err:raise_ticket_submit_error', 'Something went wrong.'))
        }
        return
      }
      if (data.html_url) {
        setIssueUrl(data.html_url)
        setTitle('')
        setDescription('')
        setLabel('')
        setPriority('')
      }
    } catch {
      setError(t('err:raise_ticket_submit_error', 'Something went wrong.'))
    } finally {
      setSubmitting(false)
    }
  }

  if (permissionsLoading) {
    return <div className="p-6">{t('common:loading', 'Loading...')}</div>
  }
  if (!canViewPage) return null
  if (!ready && !error) {
    return <div className="p-6">{t('common:loading', 'Loading...')}</div>
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link
          href="/err-portal"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground -ml-2"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('common:back_to_home')}
        </Link>
        <h1 className="text-3xl font-bold">
          {t('err:raise_ticket_title', 'Raise a ticket')}
        </h1>
        <p className="text-muted-foreground">
          {t(
            'err:raise_ticket_intro',
            'Report a bug or request an improvement. This opens an issue in the Mutual Aid Portal GitHub repository for the dev team.'
          )}
        </p>
        <p className="text-sm text-muted-foreground border-l-2 border-muted pl-3">
          {t(
            'err:raise_ticket_triage_note',
            'Choose an issue type and priority to help triage.'
          )}
        </p>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        {issueUrl && (
          <p className="text-sm text-muted-foreground">
            {t('err:raise_ticket_success', 'Issue created:')}{' '}
            <a href={issueUrl} className="text-primary underline font-medium" target="_blank" rel="noopener noreferrer">
              {issueUrl}
            </a>
          </p>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{t('err:raise_ticket_form_title', 'New issue')}</CardTitle>
            <CardDescription>
              {t(
                'err:raise_ticket_form_desc',
                'Be specific enough that someone can reproduce or understand the request. Avoid sharing sensitive personal data.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ticket-label">{t('err:raise_ticket_field_issue_type', 'Issue Type')}</Label>
                <Select
                  value={label || undefined}
                  onValueChange={setLabel}
                  disabled={!ready || submitting}
                >
                  <SelectTrigger id="ticket-label" className="w-full max-w-full">
                    <SelectValue
                      placeholder={t('err:raise_ticket_issue_type_placeholder', 'Select issue type')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {GITHUB_RAISE_TICKET_LABELS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`err:${RAISE_TICKET_LABEL_I18N_KEYS[value]}`, value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t(
                    'err:raise_ticket_label_hint',
                    'Matches labels in the Mutual-Aid-Portal repo so the issue is tagged correctly.'
                  )}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ticket-priority">{t('err:raise_ticket_field_priority', 'Priority')}</Label>
                <Select
                  value={priority || undefined}
                  onValueChange={setPriority}
                  disabled={!ready || submitting}
                >
                  <SelectTrigger id="ticket-priority" className="w-full max-w-full">
                    <SelectValue
                      placeholder={t('err:raise_ticket_priority_placeholder', 'Select priority')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {RAISE_TICKET_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {t(`err:raise_ticket_priority_${p}`, p)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t(
                    'err:raise_ticket_priority_hint',
                    'Added to the issue description for context; project fields can be set during the weekly triage.'
                  )}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ticket-title">{t('err:raise_ticket_field_title', 'Title')}</Label>
                <Input
                  id="ticket-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  minLength={3}
                  maxLength={200}
                  placeholder={t('err:raise_ticket_title_placeholder', 'Short summary of the problem or idea')}
                  disabled={!ready || submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ticket-desc">{t('err:raise_ticket_field_description', 'Description')}</Label>
                <Textarea
                  id="ticket-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  minLength={10}
                  maxLength={8000}
                  rows={8}
                  placeholder={t(
                    'err:raise_ticket_desc_placeholder',
                    'What happened, what you expected, steps to reproduce, browser/device if relevant…'
                  )}
                  disabled={!ready || submitting}
                />
              </div>
              <Button type="submit" disabled={!ready || submitting}>
                {submitting
                  ? t('err:raise_ticket_submitting', 'Submitting…')
                  : t('err:raise_ticket_submit', 'Submit to GitHub')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="mx-auto mt-6 max-w-3xl">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              {t('err:raise_ticket_board_title', 'Project board')}
            </CardTitle>
            <CardDescription>
              {t(
                'err:raise_ticket_board_desc',
                'Track status and progress for portal work directly in GitHub.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <a
              href={GITHUB_PROJECT_BOARD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white shadow-sm h-9 px-4 py-2"
            >
              {t('err:raise_ticket_board_cta', 'Open GitHub project board')}
              <ExternalLink className="h-4 w-4 opacity-90" aria-hidden />
            </a>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 space-y-4">
        <div className="space-y-2">
          <h2 className="text-3xl font-bold">
            {t('err:raise_ticket_dashboard_title', 'Dashboard')}
          </h2>
          <p className="text-muted-foreground">
            {t(
              'err:raise_ticket_dashboard_intro',
              'Live reporting from the Mutual Aid Portal GitHub project board—Big Rocks, sprints, and open work.'
            )}
          </p>
          <p className="text-sm text-muted-foreground border-l-2 border-muted pl-3">
            {t(
              'err:raise_ticket_dashboard_note',
              'Figures reflect board fields set during weekly triage; use the project board link above for full detail.'
            )}
          </p>
        </div>
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
