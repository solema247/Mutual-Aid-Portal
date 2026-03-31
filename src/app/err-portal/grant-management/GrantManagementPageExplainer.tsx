'use client'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useRegisterPageExplainer } from '@/contexts/PageExplainerContext'

function ExplainerRow({ labelKey, descKey }: { labelKey: string; descKey: string }) {
  const { t } = useTranslation(['err'])
  return (
    <li className="leading-relaxed">
      <strong className="font-semibold text-brand-dark-blue">{t(labelKey)}</strong>
      <span className="text-brand-body"> — {t(descKey)}</span>
    </li>
  )
}

function GrantManagementExplainerBody() {
  const { t } = useTranslation(['err'])

  return (
    <div className="space-y-4 text-brand-body">
      <p className="leading-relaxed">{t('err:grant_management_explainer_intro')}</p>

      <div>
        <p className="mb-2 font-semibold text-brand-dark-blue">{t('err:grant_management_explainer_section_cards')}</p>
        <ul className="list-disc space-y-2 ps-5 marker:text-brand-purple/80">
          <ExplainerRow labelKey="err:gm.total_funds_allocated" descKey="err:gm_explainer_card_allocated" />
          <ExplainerRow labelKey="err:gm.total_funds_transferred" descKey="err:gm_explainer_card_transferred" />
          <ExplainerRow labelKey="err:gm.committed" descKey="err:gm_explainer_card_committed" />
          <ExplainerRow labelKey="err:gm.pending" descKey="err:gm_explainer_card_pending" />
          <ExplainerRow labelKey="err:gm.remaining" descKey="err:gm_explainer_card_remaining" />
        </ul>
      </div>

      <div>
        <p className="mb-2 font-semibold text-brand-dark-blue">{t('err:grant_management_explainer_section_grants_table')}</p>
        <p className="leading-relaxed">{t('err:grant_management_explainer_grants_table')}</p>
      </div>

      <div>
        <p className="mb-2 font-semibold text-brand-dark-blue">{t('err:grant_management_explainer_section_allocations')}</p>
        <p className="leading-relaxed">{t('err:grant_management_explainer_allocations')}</p>
      </div>

      <div>
        <p className="mb-2 font-semibold text-brand-dark-blue">{t('err:grant_management_explainer_section_pool')}</p>
        <p className="leading-relaxed">{t('err:grant_management_explainer_pool')}</p>
        <ul className="mt-2 list-disc space-y-1.5 ps-5 marker:text-brand-purple/80 text-sm">
          <li>{t('err:gm_explainer_pool_col_state')}</li>
          <li>{t('err:gm_explainer_pool_col_allocated')}</li>
          <li>{t('err:gm_explainer_pool_col_pct')}</li>
          <li>{t('err:gm_explainer_pool_col_historical')}</li>
          <li>{t('err:gm_explainer_pool_col_committed')}</li>
          <li>{t('err:gm_explainer_pool_col_pending')}</li>
          <li>{t('err:gm_explainer_pool_col_remaining')}</li>
        </ul>
      </div>

      <div className="border-t border-brand-light-blue/25 pt-4">
        <p className="mb-2 font-semibold text-brand-dark-blue">{t('err:grant_management_explainer_section_sources')}</p>
        <p className="mb-3 text-sm leading-relaxed text-brand-body">{t('err:grant_management_explainer_sources_lead')}</p>
        <ul className="list-disc space-y-2.5 ps-5 marker:text-brand-purple/80">
          {([1, 2, 3, 4] as const).map((n) => (
            <li key={n} className="leading-relaxed">
              <strong className="font-semibold text-brand-dark-blue">
                {t(`err:grant_management_explainer_sources_${n}_label`)}
              </strong>
              <span className="text-brand-body"> — {t(`err:grant_management_explainer_sources_${n}_text`)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function useGrantManagementPageExplainer(enabled: boolean) {
  const { t } = useTranslation(['err'])

  const config = useMemo(
    () => ({
      tooltip: t('err:grant_management_explainer_tooltip'),
      title: t('err:grant_management_explainer_title'),
      content: <GrantManagementExplainerBody />,
    }),
    [t]
  )

  useRegisterPageExplainer(config, enabled)
}
