'use client'

import { useTranslation } from 'react-i18next'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  GITHUB_PROJECT_BIG_ROCKS,
  GITHUB_PROJECT_SYSTEM_ENHANCEMENTS,
  RAISE_TICKET_BIG_ROCK_I18N_KEYS,
  bigRockChartColor,
  type GithubProjectBigRock,
} from '@/lib/raiseTicketGithub'

const BIG_ROCK_SUMMARY_KEYS: Record<(typeof GITHUB_PROJECT_BIG_ROCKS)[number], string> = {
  'System Enhancements': 'raise_ticket_explainer_system_summary',
  'Expand Access': 'raise_ticket_explainer_expand_access_summary',
  Localization: 'raise_ticket_explainer_localization_summary',
  'Safeguard System Operations': 'raise_ticket_explainer_safeguard_summary',
}

function asStringArray (value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []
}

function pastelTint (hex: string, alpha = 0.14): string {
  const normalized = hex.replace('#', '')
  const r = parseInt(normalized.slice(0, 2), 16)
  const g = parseInt(normalized.slice(2, 4), 16)
  const b = parseInt(normalized.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function TaskTypeList ({ items, accentColor }: { items: string[]; accentColor: string }) {
  if (items.length === 0) return null
  return (
    <div
      className="mt-2 space-y-1 rounded-md px-2 py-1.5 ring-1 ring-border/50"
      style={{ backgroundColor: pastelTint(accentColor, 0.08) }}
    >
      {items.map((line, i) => {
        const dash = line.indexOf(' — ')
        const label = dash >= 0 ? line.slice(0, dash) : line
        const detail = dash >= 0 ? line.slice(dash + 3) : ''

        return (
          <div key={i} className="flex gap-1.5 text-[10px] leading-snug">
            <span
              className="mt-1.5 h-1 w-1 shrink-0 rounded-full"
              style={{ backgroundColor: accentColor }}
              aria-hidden
            />
            <p>
              <span className="font-medium text-foreground">{label}</span>
              {detail ? (
                <span className="text-muted-foreground"> — {detail}</span>
              ) : null}
            </p>
          </div>
        )
      })}
    </div>
  )
}

function ExplainerSection ({
  title,
  summaryKey,
  showTaskTypes,
  accentColor,
}: {
  title: string
  summaryKey: string
  showTaskTypes?: boolean
  accentColor: string
}) {
  const { t } = useTranslation('err')
  const taskBullets = showTaskTypes
    ? asStringArray(t('raise_ticket_explainer_system_task_bullets', { returnObjects: true }))
    : []

  return (
    <section
      className="rounded-lg px-2.5 py-2 ring-1 ring-border/40"
      style={{ backgroundColor: pastelTint(accentColor, 0.1) }}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-0.5 h-8 w-1 shrink-0 rounded-full"
          style={{ backgroundColor: accentColor }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-[11px] font-semibold leading-snug text-foreground">{title}</h3>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{t(summaryKey)}</p>
          {showTaskTypes ? (
            <TaskTypeList items={taskBullets} accentColor={accentColor} />
          ) : null}
        </div>
      </div>
    </section>
  )
}

export function BigRockExplainer () {
  const { t } = useTranslation('err')

  return (
    <Card className="h-full">
      <CardHeader className="space-y-1.5 p-4 pb-2">
        <CardTitle className="text-base font-semibold leading-tight">
          {t('raise_ticket_explainer_title', 'Big Rocks')}
        </CardTitle>
        <CardDescription className="text-xs leading-snug">
          {t('raise_ticket_explainer_desc', 'Strategic objectives on the project board')}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="space-y-2">
          {GITHUB_PROJECT_BIG_ROCKS.map((bigRock, index) => (
            <ExplainerSection
              key={bigRock}
              title={t(
                RAISE_TICKET_BIG_ROCK_I18N_KEYS[bigRock as GithubProjectBigRock],
                bigRock
              )}
              summaryKey={BIG_ROCK_SUMMARY_KEYS[bigRock]}
              showTaskTypes={bigRock === GITHUB_PROJECT_SYSTEM_ENHANCEMENTS}
              accentColor={bigRockChartColor(index)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
