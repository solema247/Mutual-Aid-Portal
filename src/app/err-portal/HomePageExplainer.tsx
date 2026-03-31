'use client'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'
import { useRegisterPageExplainer } from '@/contexts/PageExplainerContext'

function HomeExplainerBody() {
  const { t } = useTranslation(['err'])
  const { can } = useAllowedFunctions()

  const canViewGrantManagement = can('grant_view')
  const canViewF1 = can('f1_view_page')
  const canViewF2 = can('f2_view_page')
  const canViewF3 = can('f3_view_page')
  const canViewF4F5 = can('f4_f5_view_page')
  const canViewProjectManagement = can('management_view_page')
  const canViewUserManagement = can('users_view_page')
  const canViewRooms = can('rooms_view_page')
  const canViewDashboard = can('dashboard_view_page')
  const canViewLearnings = can('learnings_view_page')
  const canViewSurveys = can('surveys_view_page')

  const lines: { id: string; show: boolean }[] = [
    { id: 'grant', show: canViewGrantManagement },
    { id: 'f1', show: canViewF1 },
    { id: 'f2', show: canViewF2 },
    { id: 'f3', show: canViewF3 },
    { id: 'f4f5', show: canViewF4F5 },
    { id: 'report_tracker', show: canViewF4F5 },
    { id: 'project_mgmt', show: canViewProjectManagement },
    { id: 'dashboard', show: canViewDashboard },
    { id: 'learnings', show: canViewLearnings },
    { id: 'rooms', show: canViewRooms },
    { id: 'users', show: canViewUserManagement },
    { id: 'surveys', show: canViewSurveys },
  ]

  const visible = lines.filter((l) => l.show)

  return (
    <div className="space-y-4 text-brand-body">
      <p className="leading-relaxed">{t('err:home_explainer_intro')}</p>
      <p className="leading-relaxed">{t('err:home_explainer_access')}</p>
      {visible.length > 0 && (
        <ul className="list-disc space-y-2 border-t border-brand-light-blue/25 ps-5 pt-4 marker:text-brand-purple/80">
          {visible.map((line) => (
            <li key={line.id} className="leading-relaxed">
              <strong className="font-semibold text-brand-dark-blue">
                {t(`err:home_explainer_${line.id}_title`)}
              </strong>
              <span className="text-brand-body"> — {t(`err:home_explainer_${line.id}_desc`)}</span>
            </li>
          ))}
          <li className="leading-relaxed">
            <strong className="font-semibold text-brand-dark-blue">{t('err:home_explainer_logout_title')}</strong>
            <span className="text-brand-body"> — {t('err:home_explainer_logout_desc')}</span>
          </li>
        </ul>
      )}
      {visible.length === 0 && (
        <p className="border-t border-brand-light-blue/25 pt-4 leading-relaxed text-brand-purple/90">
          <strong className="font-semibold text-brand-dark-blue">{t('err:home_explainer_logout_title')}</strong>
          <span className="text-brand-body"> — {t('err:home_explainer_logout_desc')}</span>
        </p>
      )}
    </div>
  )
}

export function useHomePageExplainer(enabled: boolean) {
  const { t } = useTranslation(['err'])

  const config = useMemo(
    () => ({
      tooltip: t('err:explainer_tooltip'),
      title: t('err:home_explainer_title'),
      content: <HomeExplainerBody />,
    }),
    [t]
  )

  useRegisterPageExplainer(config, enabled)
}
