'use client'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useRegisterPageExplainer } from '@/contexts/PageExplainerContext'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'

function CardRow({ labelKey, descKey }: { labelKey: string; descKey: string }) {
  const { t } = useTranslation(['f1_plans', 'err'])
  return (
    <li className="leading-relaxed">
      <strong className="font-semibold text-brand-dark-blue">{t(labelKey)}</strong>
      <span className="text-brand-body"> — {t(descKey)}</span>
    </li>
  )
}

function F1ExplainerBody({
  canViewContent,
  canUpload,
}: {
  canViewContent: boolean
  canUpload: boolean
}) {
  const { t } = useTranslation(['f1_plans'])

  return (
    <div className="space-y-4 text-brand-body">
      <p className="leading-relaxed">{t('f1_plans:explainer_intro')}</p>

      {!canViewContent && (
        <p className="rounded-md border border-brand-light-blue/30 bg-brand-bg/80 px-3 py-2 text-sm text-brand-purple/95">
          {t('f1_plans:explainer_no_view')}
        </p>
      )}

      {canViewContent && !canUpload && (
        <p className="rounded-md border border-brand-light-blue/30 bg-brand-bg/80 px-3 py-2 text-sm text-brand-purple/95">
          {t('f1_plans:explainer_view_only_upload')}
        </p>
      )}

      <div>
        <p className="mb-2 font-semibold text-brand-dark-blue">{t('f1_plans:explainer_section_summary')}</p>
        <ul className="list-disc space-y-2 ps-5 marker:text-brand-purple/80">
          <CardRow labelKey="err:gm.total_funds_allocated" descKey="f1_plans:explainer_card_allocated" />
          <CardRow labelKey="err:gm.total_funds_transferred" descKey="f1_plans:explainer_card_transferred" />
          <CardRow labelKey="err:gm.committed" descKey="f1_plans:explainer_card_committed" />
          <CardRow labelKey="err:gm.pending" descKey="f1_plans:explainer_card_pending" />
          <CardRow labelKey="err:gm.remaining" descKey="f1_plans:explainer_card_remaining" />
        </ul>
        <p className="mt-2 text-sm leading-relaxed text-brand-purple/90">{t('f1_plans:explainer_pool_same_as_grant')}</p>
      </div>

      {canUpload && (
        <div>
          <p className="mb-2 font-semibold text-brand-dark-blue">{t('f1_plans:explainer_section_upload')}</p>
          <p className="leading-relaxed">{t('f1_plans:explainer_direct_upload')}</p>
          <p className="mt-2 leading-relaxed">{t('f1_plans:explainer_manual_entry')}</p>
        </div>
      )}

      {canViewContent && (
        <div>
          <p className="mb-2 font-semibold text-brand-dark-blue">{t('f1_plans:explainer_section_err_app')}</p>
          <p className="leading-relaxed">{t('f1_plans:explainer_err_app_intro')}</p>
          <p className="mt-2 leading-relaxed">{t('f1_plans:explainer_err_app_detail')}</p>
        </div>
      )}

      <div>
        <p className="mb-2 font-semibold text-brand-dark-blue">{t('f1_plans:explainer_section_by_state')}</p>
        <p className="leading-relaxed">{t('f1_plans:explainer_by_state_intro')}</p>
        <ul className="mt-2 list-disc space-y-1.5 ps-5 marker:text-brand-purple/80 text-sm">
          <li>{t('f1_plans:explainer_by_state_col_state')}</li>
          <li>{t('f1_plans:explainer_by_state_col_allocated')}</li>
          <li>{t('f1_plans:explainer_by_state_col_historical')}</li>
          <li>{t('f1_plans:explainer_by_state_col_committed')}</li>
          <li>{t('f1_plans:explainer_by_state_col_pending')}</li>
          <li>{t('f1_plans:explainer_by_state_col_remaining')}</li>
          <li>{t('f1_plans:explainer_by_state_proposed')}</li>
        </ul>
        <p className="mt-2 text-sm leading-relaxed text-brand-purple/90">{t('f1_plans:explainer_state_filter')}</p>
      </div>

      <div className="border-t border-brand-light-blue/25 pt-4">
        <p className="mb-2 font-semibold text-brand-dark-blue">{t('f1_plans:explainer_section_sources')}</p>
        <p className="text-sm leading-relaxed">{t('f1_plans:explainer_sources')}</p>
      </div>
    </div>
  )
}

export function useF1WorkPlansPageExplainer(enabled: boolean) {
  const { t } = useTranslation(['f1_plans'])
  const { can } = useAllowedFunctions()
  const canUpload = can('f1_upload')
  const canViewContent = can('f1_view') || canUpload

  const config = useMemo(
    () => ({
      tooltip: t('f1_plans:explainer_tooltip'),
      title: t('f1_plans:explainer_title'),
      content: <F1ExplainerBody canViewContent={canViewContent} canUpload={canUpload} />,
    }),
    [t, canViewContent, canUpload]
  )

  useRegisterPageExplainer(config, enabled)
}
