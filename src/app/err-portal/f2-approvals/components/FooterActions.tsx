'use client'

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CheckSquare, XSquare } from 'lucide-react'

interface FooterActionsProps {
  selectedWorkplans: string[];
  onClearSelection: () => void;
}

export default function FooterActions({
  selectedWorkplans,
  onClearSelection
}: FooterActionsProps) {
  const { t } = useTranslation(['f2', 'common'])
  const [isLoading, setIsLoading] = useState(false)
  const [sendBackOpen, setSendBackOpen] = useState(false)
  const [sendBackReason, setSendBackReason] = useState('')

  const handleApprove = async (workplanIds: string[]) => {
    try {
      setIsLoading(true)

      const res = await fetch('/api/f2/workplans/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workplan_ids: workplanIds }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload.error || t('f2:approve_error'))
      }

      onClearSelection()
      alert(`Approved ${payload.approved_count ?? workplanIds.length} workplan(s) successfully.`)
    } catch (error) {
      console.error('Error approving workplans:', error)
      alert(error instanceof Error ? error.message : t('f2:approve_error'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleSendBack = async () => {
    if (!sendBackReason) return

    try {
      setIsLoading(true)

      const res = await fetch('/api/f2/workplans/send-back', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workplan_ids: selectedWorkplans,
          reason: sendBackReason,
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload.error || t('f2:send_back_error'))
      }

      setSendBackOpen(false)
      onClearSelection()
      alert(t('f2:send_back_success'))
    } catch (error) {
      console.error('Error sending back workplans:', error)
      alert(error instanceof Error ? error.message : t('f2:send_back_error'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <div className="mt-4 rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {selectedWorkplans.length > 0 ? (
              t('f2:selected_count', { count: selectedWorkplans.length })
            ) : (
              t('f2:no_selection')
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => setSendBackOpen(true)}
              disabled={selectedWorkplans.length === 0 || isLoading}
            >
              <XSquare className="h-4 w-4 mr-2" />
              {t('f2:send_back_selected')}
            </Button>
            <Button
              onClick={() => handleApprove(selectedWorkplans)}
              disabled={selectedWorkplans.length === 0 || isLoading}
              className="bg-[#007229] hover:bg-[#007229]/90 text-white"
            >
              <CheckSquare className="h-4 w-4 mr-2" />
              {isLoading ? t('f2:approving') : t('f2:approve_selected')}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={sendBackOpen} onOpenChange={setSendBackOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t('f2:send_back_reason')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>{t('f2:reason')}</Label>
              <Textarea
                value={sendBackReason}
                onChange={(e) => setSendBackReason(e.target.value)}
                placeholder={t('f2:send_back_reason_placeholder')}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setSendBackOpen(false)}
            >
              {t('common:cancel')}
            </Button>
            <Button
              onClick={handleSendBack}
              disabled={isLoading || !sendBackReason}
              className="bg-[#007229] hover:bg-[#007229]/90 text-white"
            >
              {isLoading ? t('f2:sending_back') : t('f2:send_back')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
