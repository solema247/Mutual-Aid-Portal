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
  const { t } = useTranslation(['f2', 'common'])
  const [isLoading, setIsLoading] = useState(false)
  const [sendBackOpen, setSendBackOpen] = useState(false)
  const [sendBackReason, setSendBackReason] = useState('')

  const calculateTotalAmount = (expenses: string | Array<{ activity: string; total_cost: number; }>): number => {
    if (!expenses) return 0
    
    try {
      // If expenses is a string (JSON), parse it
      const expensesArray = typeof expenses === 'string' ? JSON.parse(expenses) : expenses
      
      // Sum up all total_cost values
      return expensesArray.reduce((sum: number, expense: { total_cost: number }) => sum + (expense.total_cost || 0), 0)
    } catch (error) {
      console.warn('Error calculating total amount:', error)
      return 0
    }
  }

  const handleApprove = async (workplanIds: string[]) => {
    try {
      setIsLoading(true)

      // Get workplan data and check existing commitments
      const { data: workplans, error: workplanError } = await supabase
        .from('err_projects')
        .select(`
          id, 
          expenses, 
          grant_call_id, 
          grant_call_state_allocation_id, 
          grant_serial_id,
          status,
          funding_status,
          state
        `)
        .in('id', workplanIds)

      if (workplanError) throw workplanError

      // Pending for commitment: any workplan with funding_status 'allocated'
      const pendingWorkplans = workplans.filter(w => w.funding_status === 'allocated')
      console.log('Initial workplans:', workplans)
      console.log('Pending workplans:', pendingWorkplans)

      if (pendingWorkplans.length === 0) {
        alert(t('f2:no_pending_workplans'))
        return
      }

      // Check for grant call assignments - all workplans must have grant_call_id
      const unassignedWorkplans = pendingWorkplans.filter(w => !w.grant_call_id)
      if (unassignedWorkplans.length > 0) {
        alert(`Cannot approve workplans without grant call assignment. ${unassignedWorkplans.length} workplan(s) need to be assigned to a grant call first.`)
        return
      }

      // Check for existing ledger entries
      const { data: existingEntries, error: existingError } = await supabase
        .from('grant_project_commitment_ledger')
        .select('workplan_id')
        .in('workplan_id', pendingWorkplans.map(w => w.id))

      if (existingError) throw existingError

      // Filter out workplans that already have ledger entries
      const workplansToApprove = pendingWorkplans
      console.log('Existing entries:', existingEntries)
      console.log('Workplans to approve:', workplansToApprove)

      if (workplansToApprove.length === 0) {
        alert(t('f2:all_workplans_have_entries'))
        return
      }

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError

      // Create ledger entries for remaining workplans
      const ledgerEntries = await Promise.all(workplansToApprove.map(async (workplan) => {
        let grantSerialId = workplan.grant_serial_id

        // If grant_serial_id is "new" or invalid, look up the correct grant serial
        if (grantSerialId === 'new' || !grantSerialId) {
          const { data: grantSerialData, error: grantSerialError } = await supabase
            .from('grant_serials')
            .select('grant_serial')
            .eq('grant_call_id', workplan.grant_call_id)
            .eq('state_name', workplan.state)
            .single()

          if (grantSerialError) {
            console.error('Error fetching grant serial:', grantSerialError)
            throw new Error(`Failed to find grant serial for workplan ${workplan.id}`)
          }

          grantSerialId = grantSerialData.grant_serial

          // Update the workplan with the correct grant_serial_id
          const { error: updateSerialError } = await supabase
            .from('err_projects')
            .update({ grant_serial_id: grantSerialId })
            .eq('id', workplan.id)

          if (updateSerialError) {
            console.error('Error updating workplan grant_serial_id:', updateSerialError)
            // Don't throw here, continue with the approval process
          }
        } else {
          // Extract base grant serial only if last segment is a 3-digit workplan suffix
          // Base serial ends with 4-digit segment (e.g., -0001)
          if (grantSerialId && grantSerialId.includes('-')) {
            const parts = grantSerialId.split('-')
            const last = parts[parts.length - 1]
            if (/^\d{3}$/.test(last)) {
              grantSerialId = parts.slice(0, -1).join('-')
            }
          }
        }

        return {
          workplan_id: workplan.id,
          grant_call_id: workplan.grant_call_id,
          grant_call_state_allocation_id: workplan.grant_call_state_allocation_id,
          grant_serial_id: grantSerialId,
          delta_amount: calculateTotalAmount(workplan.expenses),
          reason: 'Initial approval',
          created_by: user?.id
        }
      }))

      const { error: ledgerError } = await supabase
        .from('grant_project_commitment_ledger')
        .insert(ledgerEntries)

      if (ledgerError) throw ledgerError

      // Update workplan statuses only for workplans we're approving
      const { error: updateError } = await supabase
        .from('err_projects')
        .update({
          status: 'approved',
          funding_status: 'committed'
        })
        .in('id', workplansToApprove.map(w => w.id))

      if (updateError) throw updateError

      onClearSelection()
      alert(`Approved ${workplansToApprove.length} workplan(s) successfully.`)
    } catch (error) {
      console.error('Error approving workplans:', error)
      alert(t('f2:approve_error'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleSendBack = async () => {
    if (!sendBackReason) return

    try {
      setIsLoading(true)

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError

      // Update workplan statuses to pending
      const { error: updateError } = await supabase
        .from('err_projects')
        .update({
          status: 'pending'
        })
        .in('id', selectedWorkplans)

      if (updateError) throw updateError

      // Create feedback entries for each workplan to store the send-back reason
      const feedbackEntries = selectedWorkplans.map(workplanId => ({
        project_id: workplanId,
        feedback_text: sendBackReason,
        feedback_status: 'pending_changes',
        created_by: user?.id,
        iteration_number: 1 // This will be incremented if there are existing feedback entries
      }))

      // Get existing feedback count for each project to set correct iteration number
      const { data: existingFeedback, error: feedbackError } = await supabase
        .from('project_feedback')
        .select('project_id, iteration_number')
        .in('project_id', selectedWorkplans)

      if (feedbackError) {
        console.error('Error fetching existing feedback:', feedbackError)
        // Continue without iteration numbers
      } else {
        // Update iteration numbers based on existing feedback
        feedbackEntries.forEach(entry => {
          const existing = existingFeedback?.filter(f => f.project_id === entry.project_id) || []
          entry.iteration_number = existing.length + 1
        })
      }

      // Insert feedback entries
      const { error: insertFeedbackError } = await supabase
        .from('project_feedback')
        .insert(feedbackEntries)

      if (insertFeedbackError) {
        console.error('Error creating feedback entries:', insertFeedbackError)
        // Don't throw here, the main operation (status update) succeeded
      }

      setSendBackOpen(false)
      onClearSelection()
      alert(t('f2:send_back_success'))
    } catch (error) {
      console.error('Error sending back workplans:', error)
      alert(t('f2:send_back_error'))
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
