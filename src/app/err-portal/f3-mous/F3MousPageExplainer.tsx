'use client'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useRegisterPageExplainer } from '@/contexts/PageExplainerContext'

function F3MousExplainerBody() {
  const { t } = useTranslation(['f3'])

  return (
    <div className="space-y-4 text-brand-body">
      <p className="leading-relaxed">{t('f3:explainer_intro')}</p>

      <div>
        <p className="mb-2 font-semibold text-brand-dark-blue">{t('f3:explainer_section_alert')}</p>
        <p className="leading-relaxed text-sm">{t('f3:explainer_alert')}</p>
      </div>

      <div>
        <p className="mb-2 font-semibold text-brand-dark-blue">{t('f3:explainer_section_table')}</p>
        <p className="leading-relaxed">{t('f3:explainer_filters')}</p>
        <p className="mt-2 leading-relaxed">{t('f3:explainer_columns')}</p>
        <p className="mt-2 text-sm font-medium text-brand-dark-blue">{t('f3:explainer_actions_lead')}</p>
        <ul className="mt-2 list-disc space-y-1.5 ps-5 marker:text-brand-purple/80 text-sm">
          <li>{t('f3:explainer_action_list')}</li>
          <li>{t('f3:explainer_action_assign')}</li>
          <li>{t('f3:explainer_action_reassign')}</li>
          <li>{t('f3:explainer_action_preview')}</li>
          <li>{t('f3:explainer_action_payment')}</li>
          <li>{t('f3:explainer_action_signed')}</li>
        </ul>
      </div>

      <div>
        <p className="mb-2 font-semibold text-brand-dark-blue">{t('f3:explainer_section_pool')}</p>
        <p className="leading-relaxed text-sm">{t('f3:explainer_pool')}</p>
      </div>
    </div>
  )
}

export function useF3MousPageExplainer(enabled: boolean) {
  const { t } = useTranslation(['f3'])

  const config = useMemo(
    () => ({
      tooltip: t('f3:explainer_tooltip'),
      title: t('f3:explainer_title'),
      content: <F3MousExplainerBody />,
    }),
    [t]
  )

  useRegisterPageExplainer(config, enabled)
}
