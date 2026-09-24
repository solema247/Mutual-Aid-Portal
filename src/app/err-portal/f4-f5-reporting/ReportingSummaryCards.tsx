'use client'

import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReportingListSummary } from '@/lib/f4f5/reportingListSummaryShared'
import { REPORTING_SUMMARY_GRID } from './reportingTableShell'

type CardDef = {
  label: string
  value: number
  badge?: string
  badgeClass?: string
}

type ReportingSummaryCardsProps = {
  cards: CardDef[]
  loading?: boolean
  updating?: boolean
  className?: string
}

/** Icon-only refresh indicator (toolbar / summary), matches ARM-style bordered control. */
export function ReportingToolbarRefreshIndicator({
  label = 'Updating',
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm dark:border-border/40 dark:bg-card',
        className
      )}
      role="status"
      aria-label={label}
      title={label}
    >
      <RefreshCw className="h-4 w-4 animate-spin text-slate-600 dark:text-muted-foreground" aria-hidden />
    </div>
  )
}

function SummaryCardSkeleton() {
  return (
    <div className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm dark:border-border/40 dark:bg-card animate-pulse">
      <div className="h-3 w-20 rounded bg-muted" />
      <div className="mt-3 h-8 w-14 rounded bg-muted" />
      <div className="mt-2 h-3 w-28 rounded bg-muted" />
    </div>
  )
}

export function ReportingSummaryCards({
  cards,
  loading = false,
  updating = false,
  className,
}: ReportingSummaryCardsProps) {
  if (loading) {
    return (
      <div className={cn(REPORTING_SUMMARY_GRID, className)} aria-busy="true" aria-label="Loading summary">
        {Array.from({ length: 4 }).map((_, i) => (
          <SummaryCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  return (
    <div className={cn('relative', className)}>
      {updating && (
        <ReportingToolbarRefreshIndicator className="absolute end-0 top-0" />
      )}
      <div className={REPORTING_SUMMARY_GRID}>
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm dark:border-border/40 dark:bg-card"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="text-[11px] font-medium text-muted-foreground">{card.label}</div>
              {card.badge ? (
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[10px] font-semibold',
                    card.badgeClass
                  )}
                >
                  {card.badge}
                </span>
              ) : null}
            </div>
            <div className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-foreground">
              {(Number.isFinite(Number(card.value)) ? Number(card.value) : 0).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export type { ReportingListSummary } from '@/lib/f4f5/reportingListSummaryShared'

export function f4SummaryCards(
  summary: ReportingListSummary | null,
  t: (key: string, opts?: { defaultValue?: string }) => string
): CardDef[] {
  const s = summary ?? { total: 0, completed: 0, underReview: 0, notUploaded: 0 }
  return [
    {
      label: t('summary.total_reports', { defaultValue: 'Total Reports' }),
      value: s.total,
      badge: t('summary.badge_all', { defaultValue: 'All' }),
      badgeClass: 'bg-slate-100 text-slate-600 dark:bg-muted dark:text-muted-foreground',
    },
    {
      label: t('summary.completed', { defaultValue: 'Completed' }),
      value: s.completed,
      badge: t('summary.badge_done', { defaultValue: 'Done' }),
      badgeClass: 'bg-emerald-50 text-emerald-700',
    },
    {
      label: t('summary.under_review', { defaultValue: 'Under Review' }),
      value: s.underReview,
      badge: t('summary.badge_review', { defaultValue: 'Review' }),
      badgeClass: 'bg-sky-50 text-sky-700',
    },
    {
      label: t('summary.not_uploaded', { defaultValue: 'Not Uploaded' }),
      value: s.notUploaded,
      badge: t('summary.badge_missing', { defaultValue: 'Missing' }),
      badgeClass: 'bg-amber-50 text-amber-800',
    },
  ]
}

export function f5SummaryCards(
  summary: ReportingListSummary | null,
  t: (key: string, opts?: { defaultValue?: string }) => string
): CardDef[] {
  const s = summary ?? { total: 0, completed: 0, underReview: 0, notUploaded: 0 }
  return [
    {
      label: t('summary.total_reports', { defaultValue: 'Total Reports' }),
      value: s.total,
      badge: t('summary.badge_all', { defaultValue: 'All' }),
      badgeClass: 'bg-slate-100 text-slate-600 dark:bg-muted dark:text-muted-foreground',
    },
    {
      label: t('summary.completed', { defaultValue: 'Completed' }),
      value: s.completed,
      badge: t('summary.badge_done', { defaultValue: 'Done' }),
      badgeClass: 'bg-emerald-50 text-emerald-700',
    },
    {
      label: t('summary.under_review_pending', { defaultValue: 'Under Review / Pending' }),
      value: s.underReview,
      badge: t('summary.badge_pending', { defaultValue: 'Pending' }),
      badgeClass: 'bg-sky-50 text-sky-700',
    },
    {
      label: t('summary.not_uploaded', { defaultValue: 'Not Uploaded' }),
      value: s.notUploaded,
      badge: t('summary.badge_missing', { defaultValue: 'Missing' }),
      badgeClass: 'bg-amber-50 text-amber-800',
    },
  ]
}
