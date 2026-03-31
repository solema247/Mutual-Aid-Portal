'use client'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useRegisterPageExplainer } from '@/contexts/PageExplainerContext'

function CardRow({ labelKey, descKey }: { labelKey: string; descKey: string }) {
  const { t } = useTranslation(['f2', 'err'])
  return (
    <li className="leading-relaxed">
      <strong className="font-semibold text-brand-dark-blue">{t(labelKey)}</strong>
      <span className="text-brand-body"> — {t(descKey)}</span>
    </li>
  )
}

function F2ExplainerBody() {
  const { t } = useTranslation(['f2'])

  return (
    <div className="space-y-4 text-brand-body">
      <p className="leading-relaxed">{t('f2:explainer_intro')}</p>

      <div>
        <p className="mb-2 font-semibold text-brand-dark-blue">{t('f2:explainer_section_tabs')}</p>
        <p className="leading-relaxed">{t('f2:explainer_tabs_overview')}</p>

        <p className="mt-3 font-semibold text-brand-dark-blue">{t('f2:explainer_heading_uncommitted')}</p>
        <p className="leading-relaxed">{t('f2:explainer_uncommitted_intro')}</p>
        <ul className="mt-2 list-disc space-y-1.5 ps-5 marker:text-brand-purple/80 text-sm">
          <li>{t('f2:explainer_uncommitted_b1')}</li>
          <li>{t('f2:explainer_uncommitted_b2')}</li>
          <li>{t('f2:explainer_uncommitted_b3')}</li>
          <li>{t('f2:explainer_uncommitted_b4')}</li>
          <li>{t('f2:explainer_uncommitted_b5')}</li>
        </ul>

        <p className="mt-3 font-semibold text-brand-dark-blue">{t('f2:explainer_heading_committed')}</p>
        <p className="leading-relaxed">{t('f2:explainer_committed_intro')}</p>
        <ul className="mt-2 list-disc space-y-1.5 ps-5 marker:text-brand-purple/80 text-sm">
          <li>{t('f2:explainer_committed_b1')}</li>
          <li>{t('f2:explainer_committed_b2')}</li>
          <li>{t('f2:explainer_committed_b3')}</li>
          <li>{t('f2:explainer_committed_b4')}</li>
        </ul>
      </div>

      <div>
        <p className="mb-2 font-semibold text-brand-dark-blue">{t('f2:explainer_section_summary')}</p>
        <ul className="list-disc space-y-2 ps-5 marker:text-brand-purple/80">
          <CardRow labelKey="err:gm.total_funds_allocated" descKey="f2:explainer_card_allocated" />
          <CardRow labelKey="err:gm.total_funds_transferred" descKey="f2:explainer_card_transferred" />
          <CardRow labelKey="err:gm.committed" descKey="f2:explainer_card_committed" />
          <CardRow labelKey="err:gm.pending" descKey="f2:explainer_card_pending" />
          <CardRow labelKey="err:gm.remaining" descKey="f2:explainer_card_remaining" />
        </ul>
        <p className="mt-2 text-sm leading-relaxed text-brand-purple/90">{t('f2:explainer_pool_same')}</p>
      </div>

      <div>
        <p className="mb-2 font-semibold text-brand-dark-blue">{t('f2:explainer_section_overview_tables')}</p>
        <p className="leading-relaxed">{t('f2:explainer_by_state')}</p>
        <p className="mt-2 leading-relaxed">{t('f2:explainer_by_grant')}</p>
        <p className="mt-2 text-sm leading-relaxed text-brand-purple/90">{t('f2:explainer_state_filter')}</p>
      </div>

      <div className="border-t border-brand-light-blue/25 pt-4">
        <p className="mb-2 font-semibold text-brand-dark-blue">{t('f2:explainer_section_sources')}</p>
        <p className="text-sm leading-relaxed">{t('f2:explainer_sources')}</p>
      </div>
    </div>
  )
}

export function useF2ApprovalsPageExplainer(enabled: boolean) {
  const { t } = useTranslation(['f2'])

  const config = useMemo(
    () => ({
      tooltip: t('f2:explainer_tooltip'),
      title: t('f2:explainer_title'),
      content: <F2ExplainerBody />,
    }),
    [t]
  )

  useRegisterPageExplainer(config, enabled)
}
