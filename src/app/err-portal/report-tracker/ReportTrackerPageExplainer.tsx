'use client'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useRegisterPageExplainer } from '@/contexts/PageExplainerContext'

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []
}

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return null
  return (
    <ul className="mt-2 list-disc space-y-1.5 ps-5 text-sm marker:text-brand-purple/80">
      {items.map((line, i) => (
        <li key={i} className="leading-relaxed">
          {line}
        </li>
      ))}
    </ul>
  )
}

function ReportTrackerExplainerBody() {
  const { t } = useTranslation(['err'])
  const dataBullets = asStringArray(t('err:report_tracker_explainer_data_bullets', { returnObjects: true }))
  const scopeBullets = asStringArray(t('err:report_tracker_explainer_scope_bullets', { returnObjects: true }))
  const featureBullets = asStringArray(t('err:report_tracker_explainer_features_bullets', { returnObjects: true }))

  return (
    <div className="space-y-4 text-brand-body">
      <p className="leading-relaxed">{t('err:report_tracker_explainer_intro')}</p>

      <div>
        <p className="mb-1 font-semibold text-brand-dark-blue">{t('err:report_tracker_explainer_heading_data')}</p>
        <p className="text-sm leading-relaxed text-brand-body">{t('err:report_tracker_explainer_data_lead')}</p>
        <BulletList items={dataBullets} />
      </div>

      <div>
        <p className="mb-1 font-semibold text-brand-dark-blue">{t('err:report_tracker_explainer_heading_scope')}</p>
        <BulletList items={scopeBullets} />
      </div>

      <div>
        <p className="mb-1 font-semibold text-brand-dark-blue">{t('err:report_tracker_explainer_heading_features')}</p>
        <BulletList items={featureBullets} />
      </div>
    </div>
  )
}

export function useReportTrackerPageExplainer(enabled: boolean) {
  const { t } = useTranslation(['err'])

  const config = useMemo(
    () => ({
      tooltip: t('err:report_tracker_explainer_tooltip'),
      title: t('err:report_tracker_explainer_title'),
      content: <ReportTrackerExplainerBody />,
    }),
    [t]
  )

  useRegisterPageExplainer(config, enabled)
}
