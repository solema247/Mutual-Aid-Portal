'use client'

import { useTranslation } from 'react-i18next'

type Feedback = {
  id: string
  feedback_text: string
  feedback_status: 'pending_changes' | 'changes_submitted' | 'resolved'
  created_by: string
  addressed_by: string | null
  created_at: string
  addressed_at: string | null
  iteration_number: number
}

type FeedbackHistoryProps = {
  projectId: string
  feedbackHistory: Feedback[]
  className?: string
}

export default function FeedbackHistory({ projectId, feedbackHistory, className = '' }: FeedbackHistoryProps) {
  const { t } = useTranslation(['projects'])

  const getStatusColor = (status: Feedback['feedback_status']) => {
    switch (status) {
      case 'pending_changes':
        return 'text-yellow-600 dark:text-yellow-400'
      case 'changes_submitted':
        return 'text-blue-600 dark:text-blue-400'
      case 'resolved':
        return 'text-green-600 dark:text-green-400'
      default:
        return 'text-slate-600 dark:text-slate-400'
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  if (feedbackHistory.length === 0) {
    return (
      <div className={`text-center text-slate-500 dark:text-slate-400 py-4 ${className}`}>
        {t('projects:no_feedback_history')}
      </div>
    )
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {feedbackHistory.map((feedback) => (
        <div
          key={feedback.id}
          className="border rounded-lg p-4 space-y-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {t('projects:iteration')} #{feedback.iteration_number}
            </span>
            <span className={`text-sm ${getStatusColor(feedback.feedback_status)}`}>
              {t(`projects:status_${feedback.feedback_status}`)}
            </span>
          </div>
          
          <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
            {feedback.feedback_text}
          </p>
          
          <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
            <div>
              {t('projects:feedback_created_by')}: {feedback.created_by}
              <span className="mx-2">•</span>
              {formatDate(feedback.created_at)}
            </div>
            {feedback.addressed_by && feedback.addressed_at && (
              <div>
                {t('projects:feedback_addressed_by')}: {feedback.addressed_by}
                <span className="mx-2">•</span>
                {formatDate(feedback.addressed_at)}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
} 