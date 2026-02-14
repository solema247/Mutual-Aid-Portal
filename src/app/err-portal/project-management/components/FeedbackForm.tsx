'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'

type FeedbackFormProps = {
  projectId: string
  onSubmit: (feedback: string, action: 'approve' | 'feedback' | 'decline') => Promise<void>
  className?: string
}

export default function FeedbackForm({ projectId, onSubmit, className = '' }: FeedbackFormProps) {
  const { t } = useTranslation(['projects', 'common'])
  const { can } = useAllowedFunctions()
  const [feedback, setFeedback] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (action: 'approve' | 'feedback' | 'decline') => {
    try {
      setIsSubmitting(true)
      await onSubmit(feedback, action)
      setFeedback('')
      console.log(`Submitted feedback for project ${projectId}`)
    } catch (error) {
      console.error('Error submitting feedback:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div>
        <h4 className="font-medium text-base mb-2">{t('projects:provide_feedback')}</h4>
        <Textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder={t('projects:feedback_placeholder')}
          className="min-h-[100px] bg-white dark:bg-slate-900"
          disabled={isSubmitting}
        />
      </div>
      <div className="flex space-x-2">
        <Button
          onClick={() => handleSubmit('approve')}
          className="flex-1"
          disabled={isSubmitting || !can('f1_approve')}
          title={!can('f1_approve') ? t('common:no_permission') : undefined}
        >
          {t('projects:approve')}
        </Button>
        {feedback && can('f1_feedback') && (
          <Button
            onClick={() => handleSubmit('feedback')}
            variant="outline"
            className="flex-1"
            disabled={isSubmitting}
          >
            {t('projects:send_feedback')}
          </Button>
        )}
        <Button
          onClick={() => handleSubmit('decline')}
          variant="destructive"
          className="flex-1"
          disabled={isSubmitting || !feedback || !can('f1_decline')}
          title={!can('f1_decline') ? t('common:no_permission') : undefined}
        >
          {t('projects:decline')}
        </Button>
      </div>
    </div>
  )
} 