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

function StoriesExplainerBody() {
  const { t } = useTranslation(['err'])
  const bullets = asStringArray(t('err:stories_explainer_bullets', { returnObjects: true }))

  return (
    <div className="space-y-4 text-brand-body">
      <p className="leading-relaxed">{t('err:stories_explainer_intro')}</p>
      <BulletList items={bullets} />
    </div>
  )
}

export function useStoriesPageExplainer(enabled: boolean) {
  const { t } = useTranslation(['err'])

  const config = useMemo(
    () => ({
      tooltip: t('err:stories_explainer_tooltip'),
      title: t('err:stories_explainer_title'),
      content: <StoriesExplainerBody />,
    }),
    [t]
  )

  useRegisterPageExplainer(config, enabled)
}
