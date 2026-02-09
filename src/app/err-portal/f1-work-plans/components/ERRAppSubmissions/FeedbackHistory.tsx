'use client'

import { useTranslation } from 'react-i18next'

interface Feedback {
  id: string
  feedback_text: string
  feedback_status: 'pending_changes' | 'changes_submitted' | 'resolved'
  created_by: string
  addressed_by: string | null
  created_at: string
  addressed_at: string | null
  iteration_number: number
}

interface FeedbackHistoryProps {
  projectId: string
  feedbackHistory: Feedback[]
}

export default function FeedbackHistory({ projectId, feedbackHistory }: FeedbackHistoryProps) {
  const { t } = useTranslation(['projects'])

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">{t('projects:feedback_history')}</h3>
      {feedbackHistory.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('projects:no_feedback')}
        </p>
      ) : (
        <div className="space-y-4">
          {feedbackHistory.map((feedback) => (
            <div
              key={feedback.id}
              className="border rounded-lg p-4 space-y-2"
            >
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-medium">
                    {t('projects:iteration')} {feedback.iteration_number}
                  </span>
                  <span className="text-sm text-muted-foreground ml-2">
                    {formatDate(feedback.created_at)}
                  </span>
                </div>
                <span className={`text-sm px-2 py-1 rounded-full ${
                  feedback.feedback_status === 'resolved'
                    ? 'bg-green-100 text-green-800'
                    : feedback.feedback_status === 'changes_submitted'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-orange-100 text-orange-800'
                }`}>
                  {t(`projects:feedback_status.${feedback.feedback_status}`)}
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap">
                {feedback.feedback_text}
              </p>
              {feedback.addressed_at && (
                <div className="text-sm text-muted-foreground">
                  {t('projects:addressed_on')} {formatDate(feedback.addressed_at)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
