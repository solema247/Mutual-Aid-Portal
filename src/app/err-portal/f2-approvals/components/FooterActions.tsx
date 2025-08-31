'use client'

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CheckSquare, XSquare } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'

interface FooterActionsProps {
  selectedWorkplans: string[];
  onClearSelection: () => void;
}

export default function FooterActions({
  selectedWorkplans,
  onClearSelection
}: FooterActionsProps) {
  const { t } = useTranslation(['err', 'common'])
  const [isLoading, setIsLoading] = useState(false)
  const [sendBackOpen, setSendBackOpen] = useState(false)
  const [sendBackReason, setSendBackReason] = useState('')

  const handleApprove = async (workplanIds: string[]) => {
    try {
      setIsLoading(true)

      // Get workplan data for all selected workplans
      const { data: workplans, error: workplanError } = await supabase
        .from('err_projects')
        .select('id, requested_amount, grant_call_id, grant_call_state_allocation_id, grant_serial_id')
        .in('id', workplanIds)

      if (workplanError) throw workplanError

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError

      // Insert positive deltas for all workplans
      const ledgerEntries = workplans.map(workplan => ({
        workplan_id: workplan.id,
        grant_call_id: workplan.grant_call_id,
        grant_call_state_allocation_id: workplan.grant_call_state_allocation_id,
        grant_serial_id: workplan.grant_serial_id,
        delta_amount: workplan.requested_amount,
        reason: 'Initial approval',
        created_by: user?.id
      }))

      const { error: ledgerError } = await supabase
        .from('grant_project_commitment_ledger')
        .insert(ledgerEntries)

      if (ledgerError) throw ledgerError

      // Update workplan statuses
      const { error: updateError } = await supabase
        .from('err_projects')
        .update({
          status: 'approved',
          funding_status: 'committed'
        })
        .in('id', workplanIds)

      if (updateError) throw updateError

      onClearSelection()
    } catch (error) {
      console.error('Error approving workplans:', error)
      alert(t('err:f2.approve_error'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleSendBack = async () => {
    if (!sendBackReason) return

    try {
      setIsLoading(true)

      // Update workplan statuses with note
      const { error: updateError } = await supabase
        .from('err_projects')
        .update({
          status: 'pending',
          notes: sendBackReason
        })
        .in('id', selectedWorkplans)

      if (updateError) throw updateError

      setSendBackOpen(false)
      onClearSelection()
    } catch (error) {
      console.error('Error sending back workplans:', error)
      alert(t('err:f2.send_back_error'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {selectedWorkplans.length > 0 ? (
              t('err:f2.selected_count', { count: selectedWorkplans.length })
            ) : (
              t('err:f2.no_selection')
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => setSendBackOpen(true)}
              disabled={selectedWorkplans.length === 0 || isLoading}
            >
              <XSquare className="h-4 w-4 mr-2" />
              {t('err:f2.send_back_selected')}
            </Button>
            <Button
              onClick={() => handleApprove(selectedWorkplans)}
              disabled={selectedWorkplans.length === 0 || isLoading}
              className="bg-[#007229] hover:bg-[#007229]/90 text-white"
            >
              <CheckSquare className="h-4 w-4 mr-2" />
              {isLoading ? t('err:f2.approving') : t('err:f2.approve_selected')}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={sendBackOpen} onOpenChange={setSendBackOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t('err:f2.send_back_reason')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>{t('err:f2.reason')}</Label>
              <Textarea
                value={sendBackReason}
                onChange={(e) => setSendBackReason(e.target.value)}
                placeholder={t('err:f2.send_back_reason_placeholder')}
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
              {isLoading ? t('err:f2.sending_back') : t('err:f2.send_back')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
