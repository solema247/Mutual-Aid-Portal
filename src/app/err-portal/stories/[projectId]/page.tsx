'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'
import { useTranslation } from 'react-i18next'

interface ReachRow {
  id?: string
  location?: string | null
  activity_name?: string | null
  activity_goal?: string | null
  individual_count?: number | null
  household_count?: number | null
}

interface F5Report {
  id: string
  report_date: string | null
  reporting_person: string | null
  positive_changes: string | null
  negative_results: string | null
  unexpected_results: string | null
  lessons_learned: string | null
  suggestions: string | null
  reach?: ReachRow[]
  language?: string
}

interface Project {
  id: string
  state?: string | null
  locality?: string | null
  project_objectives?: string | null
  intended_beneficiaries?: string | null
  estimated_beneficiaries?: number | null
  estimated_timeframe?: string | null
  emergency_rooms?: { name?: string; name_ar?: string; err_code?: string } | null
}

interface ProjectDetail {
  project: Project
  f5Reports: F5Report[]
  is_historical: boolean
}

function formatDate(d: string | null | undefined): string {
  if (d == null || d === '') return '—'
  try {
    const date = new Date(String(d))
    return Number.isNaN(date.getTime()) ? String(d) : date.toISOString().slice(0, 10)
  } catch {
    return String(d)
  }
}

function Section({
  title,
  content,
}: {
  title: string
  content: string | null | undefined
}) {
  const text = content?.trim()
  if (!text) return null
  return (
    <section>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground whitespace-pre-wrap">{text}</p>
    </section>
  )
}

export default function StoryDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = params?.projectId as string
  const fromState = searchParams.get('fromState')
  const fromTheme = searchParams.get('fromTheme')
  const { can } = useAllowedFunctions()
  const { i18n } = useTranslation()
  const canViewPage = can('learnings_view_page')

  const [data, setData] = useState<ProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const backHref =
    fromState != null
      ? `/err-portal/stories?mode=state&state=${encodeURIComponent(fromState)}`
      : fromTheme != null
        ? `/err-portal/stories?mode=theme&theme=${encodeURIComponent(fromTheme)}`
        : '/err-portal/stories'

  const backLabel =
    fromState != null ? `Back to ${fromState}` : fromTheme != null ? 'Back to theme' : 'Back to stories'

  const fetchProject = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setNotFound(false)
    const isEn = i18n.language === 'en' || i18n.language.startsWith('en-')
    const localeQ = isEn ? '?locale=en' : ''
    try {
      const res = await fetch(`/api/overview/project/${projectId}${localeQ}`)
      if (res.status === 404) {
        setNotFound(true)
        setData(null)
        return
      }
      const json = await res.json()
      if (!res.ok) {
        setData(null)
        return
      }
      if (json.is_historical) {
        setNotFound(true)
        setData(null)
        return
      }
      setData({
        project: json.project ?? {},
        f5Reports: json.f5Reports ?? [],
        is_historical: false,
      })
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [projectId, i18n.language])

  useEffect(() => {
    if (!canViewPage) {
      router.replace('/err-portal')
      return
    }
    fetchProject()
  }, [canViewPage, router, fetchProject])

  if (!canViewPage) return null
  if (notFound) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <p className="text-muted-foreground">Project not found or not available as a story.</p>
        <Button variant="link" asChild className="mt-2">
          <Link href="/err-portal/stories">Back to stories</Link>
        </Button>
      </div>
    )
  }
  if (loading || !data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    )
  }

  const detail = data
  const project = detail.project
  const room = project.emergency_rooms
  const errName = room?.name || room?.name_ar || room?.err_code || null
  const latestReport = detail.f5Reports[0] ?? null
  const title = project.locality || project.state || 'Story'

  const atGlanceItems = [
    project.estimated_beneficiaries != null && {
      label: 'Beneficiaries',
      value: project.estimated_beneficiaries.toLocaleString(),
    },
    project.estimated_timeframe && {
      label: 'Timeframe',
      value: project.estimated_timeframe,
    },
  ].filter(Boolean) as { label: string; value: string }[]

  if (latestReport?.reach?.length) {
    const totalIndividuals = latestReport.reach.reduce(
      (s, r) => s + (r.individual_count ?? 0),
      0
    )
    const totalHouseholds = latestReport.reach.reduce(
      (s, r) => s + (r.household_count ?? 0),
      0
    )
    if (totalIndividuals > 0)
      atGlanceItems.push({ label: 'Reach (individuals)', value: totalIndividuals.toLocaleString() })
    if (totalHouseholds > 0)
      atGlanceItems.push({ label: 'Households', value: totalHouseholds.toLocaleString() })
    atGlanceItems.push({
      label: 'Locations',
      value: String(new Set(latestReport.reach.map((r) => r.location).filter(Boolean)).size),
    })
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild className="w-fit -ml-2">
          <Link
            href={backHref}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
        </Button>
      </div>

      <header className="mb-8">
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="text-muted-foreground mt-1">
          {[project.state, project.locality].filter(Boolean).join(' · ')}
          {errName ? ` · ${errName}` : ''}
        </p>
        {latestReport && (
          <p className="text-sm text-muted-foreground mt-1">
            Report: {formatDate(latestReport.report_date)}
            {latestReport.reporting_person
              ? ` · ${latestReport.reporting_person}`
              : ''}
          </p>
        )}
      </header>

      {atGlanceItems.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-base">At a glance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              {atGlanceItems.map(({ label, value }) => (
                <div key={label}>
                  <span className="text-sm text-muted-foreground">{label}: </span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-8">
        <Section
          title="What we set out to do"
          content={project.project_objectives || project.intended_beneficiaries}
        />
        {latestReport && (
          <>
            <Section title="What changed" content={latestReport.positive_changes} />
            <Section title="Challenges" content={latestReport.negative_results} />
            <Section title="Unexpected results" content={latestReport.unexpected_results} />
            <Section title="Lessons learned" content={latestReport.lessons_learned} />
            <Section title="Suggestions" content={latestReport.suggestions} />
          </>
        )}
      </div>

      {latestReport?.reach && latestReport.reach.length > 0 && (
        <Card className="mt-8">
          <CardHeader className="py-2 px-4">
            <CardTitle className="text-base">Where we worked</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 pb-3 px-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-8 py-1.5 px-2 text-xs">Location</TableHead>
                  <TableHead className="h-8 py-1.5 px-2 text-xs">Activity</TableHead>
                  <TableHead className="h-8 py-1.5 px-2 text-xs">Goal</TableHead>
                  <TableHead className="h-8 py-1.5 px-2 text-right text-xs">Individuals</TableHead>
                  <TableHead className="h-8 py-1.5 px-2 text-right text-xs">Households</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {latestReport.reach.map((r, i) => (
                  <TableRow key={r.id ?? i}>
                    <TableCell className="p-2 text-xs">{r.location ?? '—'}</TableCell>
                    <TableCell className="p-2 text-xs">{r.activity_name ?? '—'}</TableCell>
                    <TableCell className="p-2 text-xs">{r.activity_goal ?? '—'}</TableCell>
                    <TableCell className="p-2 text-right text-xs">
                      {r.individual_count != null ? r.individual_count.toLocaleString() : '—'}
                    </TableCell>
                    <TableCell className="p-2 text-right text-xs">
                      {r.household_count != null ? r.household_count.toLocaleString() : '—'}
                    </TableCell>
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
