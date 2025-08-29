'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface FeedbackFormProps {
  projectId: string
  onSubmit: (feedback: string, action: 'approve' | 'feedback' | 'decline') => void
}

export default function FeedbackForm({ projectId, onSubmit }: FeedbackFormProps) {
  const { t } = useTranslation(['projects'])
  const [feedback, setFeedback] = useState('')

  const handleSubmit = (action: 'approve' | 'feedback' | 'decline') => {
    if (!feedback.trim() && action !== 'approve') {
      alert(t('projects:feedback_required'))
      return
    }
    onSubmit(feedback, action)
    setFeedback('')
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">{t('projects:provide_feedback')}</h3>
      <Textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder={t('projects:feedback_placeholder')}
        className="min-h-[100px]"
      />
      <div className="flex gap-2 justify-end">
        <Button
          variant="outline"
          onClick={() => handleSubmit('decline')}
          className="text-red-600 hover:text-red-700"
        >
          {t('projects:decline')}
        </Button>
        <Button
          variant="outline"
          onClick={() => handleSubmit('feedback')}
        >
          {t('projects:request_changes')}
        </Button>
        <Button
          onClick={() => handleSubmit('approve')}
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          {t('projects:approve')}
        </Button>
      </div>
    </div>
  )
}
