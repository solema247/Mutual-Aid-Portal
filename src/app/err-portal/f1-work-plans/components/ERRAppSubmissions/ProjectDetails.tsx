'use client'

import { useTranslation } from 'react-i18next'
import { F1Project } from '../../types'

interface ProjectDetailsProps {
  project: F1Project
}

export default function ProjectDetails({ project }: ProjectDetailsProps) {
  const { t } = useTranslation(['projects'])

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* Project Overview */}
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-4">{t('projects:overview')}</h3>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-base">{t('projects:objectives')}</h4>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                {project.project_objectives}
              </p>
            </div>
            <div>
              <h4 className="font-medium text-base">{t('projects:location')}</h4>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                {project.state}, {project.locality}
              </p>
            </div>
            <div>
              <h4 className="font-medium text-base">{t('projects:timeframe')}</h4>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                {project.estimated_timeframe}
              </p>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-4">{t('projects:beneficiaries')}</h3>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-base">{t('projects:intended_beneficiaries')}</h4>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                {project.intended_beneficiaries}
              </p>
            </div>
            <div>
              <h4 className="font-medium text-base">{t('projects:estimated_number')}</h4>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                {project.estimated_beneficiaries}
              </p>
            </div>
          </div>
        </div>

        {project.additional_support && (
          <div>
            <h3 className="text-lg font-semibold mb-4">{t('projects:additional_support')}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {project.additional_support}
            </p>
          </div>
        )}
      </div>

      {/* Activities and Expenses */}
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-4">{t('projects:planned_activities')}</h3>
          <div className="space-y-6">
            {project.planned_activities?.map((activity, index) => (
              <div key={index} className="border rounded-lg p-4 space-y-3">
                <div>
                  <h4 className="font-medium text-base">
                    {activity.selectedActivity}
                  </h4>
                  <div className="grid grid-cols-3 gap-2 mt-2 text-sm">
                    <div>
                      <span className="text-slate-500">{t('projects:duration')}:</span>
                      <span className="ml-1">{activity.duration}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">{t('projects:quantity')}:</span>
                      <span className="ml-1">{activity.quantity}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">{t('projects:location')}:</span>
                      <span className="ml-1">{activity.location}</span>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <h5 className="font-medium text-sm mb-2">{t('projects:expenses')}</h5>
                  <div className="space-y-2">
                    {activity.expenses.map((expense, expIndex) => (
                      <div key={expIndex} className="text-sm">
                        <div className="flex justify-between items-center">
                          <span>{expense.expense}</span>
                          <span className="font-medium">{expense.total}</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          <span>{t('projects:unit_price')}: {expense.unitPrice}</span>
                          <span className="mx-2">•</span>
                          <span>{t('projects:frequency')}: {expense.frequency}</span>
                        </div>
                        {expense.description && (
                          <p className="text-xs text-slate-600 mt-1">{expense.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
