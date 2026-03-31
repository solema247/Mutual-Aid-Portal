'use client'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useRegisterPageExplainer } from '@/contexts/PageExplainerContext'

function F4F5ExplainerBody() {
  const { t } = useTranslation(['f4f5'])

  return (
    <div className="space-y-4 text-brand-body">
      <p className="leading-relaxed">{t('f4f5:explainer_intro')}</p>

      <div>
        <p className="mb-2 font-semibold text-brand-dark-blue">{t('f4f5:explainer_section_tabs')}</p>
        <p className="leading-relaxed">{t('f4f5:explainer_tabs')}</p>
      </div>

      <div>
        <p className="mb-2 font-semibold text-brand-dark-blue">{t('f4f5:explainer_section_f4')}</p>
        <p className="leading-relaxed">{t('f4f5:explainer_f4')}</p>
      </div>

      <div>
        <p className="mb-2 font-semibold text-brand-dark-blue">{t('f4f5:explainer_section_f5')}</p>
        <p className="leading-relaxed">{t('f4f5:explainer_f5')}</p>
      </div>
    </div>
  )
}

export function useF4F5ReportingPageExplainer(enabled: boolean) {
  const { t } = useTranslation(['f4f5'])

  const config = useMemo(
    () => ({
      tooltip: t('f4f5:explainer_tooltip'),
      title: t('f4f5:explainer_title'),
      content: <F4F5ExplainerBody />,
    }),
    [t]
  )

  useRegisterPageExplainer(config, enabled)
}
