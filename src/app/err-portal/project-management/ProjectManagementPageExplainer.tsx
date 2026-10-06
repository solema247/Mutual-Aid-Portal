'use client'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useRegisterPageExplainer } from '@/contexts/PageExplainerContext'

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []
}

function splitLabel(line: string): { label: string; rest: string } | null {
  const sep = ' — '
  const i = line.indexOf(sep)
  if (i <= 0) return null
  return { label: line.slice(0, i), rest: line.slice(i + sep.length) }
}

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return null
  return (
    <ul className="mt-2 list-disc space-y-1.5 ps-5 text-sm marker:text-brand-purple/80">
      {items.map((line, i) => {
        const parts = splitLabel(line)
        return (
          <li key={i} className="leading-relaxed">
            {parts ? (
              <>
                <span className="font-medium text-brand-dark-blue">{parts.label}</span>
                {' — '}
                {parts.rest}
              </>
            ) : (
              line
            )}
          </li>
        )
      })}
    </ul>
  )
}

function ProjectManagementExplainerBody() {
  const { t } = useTranslation(['projects'])
  const metricsBullets = asStringArray(t('projects:management_explainer_metrics_bullets', { returnObjects: true }))
  const metricsTrackerBullets = asStringArray(t('projects:management_explainer_metrics_tracker_bullets', { returnObjects: true }))
  const metricsOverdueBullets = asStringArray(t('projects:management_explainer_metrics_overdue_bullets', { returnObjects: true }))
  const uiBullets = asStringArray(t('projects:management_explainer_ui_bullets', { returnObjects: true }))

  return (
    <div className="space-y-4 text-brand-body">
      <p className="leading-relaxed">{t('projects:management_explainer_intro')}</p>

      <div>
        <p className="mb-1 font-semibold text-brand-dark-blue">{t('projects:management_explainer_heading_metrics')}</p>
        <p className="text-sm leading-relaxed text-brand-body">{t('projects:management_explainer_metrics_scope')}</p>
        <BulletList items={metricsBullets} />
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-brand-purple/80">
          {t('projects:management_explainer_metrics_sub_tracker')}
        </p>
        <BulletList items={metricsTrackerBullets} />
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-brand-purple/80">
          {t('projects:management_explainer_metrics_sub_overdue')}
        </p>
        <BulletList items={metricsOverdueBullets} />
      </div>

      <div>
        <p className="mb-1 font-semibold text-brand-dark-blue">{t('projects:management_explainer_heading_ui')}</p>
        <BulletList items={uiBullets} />
      </div>
    </div>
  )
}

export function useProjectManagementPageExplainer(enabled: boolean) {
  const { t } = useTranslation(['projects'])

  const config = useMemo(
    () => ({
      tooltip: t('projects:management_explainer_tooltip'),
      title: t('projects:management_explainer_title'),
      content: <ProjectManagementExplainerBody />,
    }),
    [t]
  )

  useRegisterPageExplainer(config, enabled)
}
