'use client'

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabaseClient'
import type { ReassignmentData } from '../types'

interface ReassignModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workplanId: string | null;
}

export default function ReassignModal({
  open,
  onOpenChange,
  workplanId
}: ReassignModalProps) {
  const { t } = useTranslation(['f2', 'common'])
  const [isLoading, setIsLoading] = useState(false)
  const [grantCalls, setGrantCalls] = useState<{ id: string; name: string }[]>([])
  const [allocations, setAllocations] = useState<{ id: string; state_name: string; amount: number }[]>([])
  const [serials, setSerials] = useState<{ id: string; serial: string }[]>([])
  const [formData, setFormData] = useState<Partial<ReassignmentData>>({})

  // Fetch grant calls on mount
  useEffect(() => {
    const fetchGrantCalls = async () => {
      try {
        const { data, error } = await supabase
          .from('grant_calls')
          .select('id, name')
          .eq('status', 'open')
          .order('created_at', { ascending: false })

        if (error) throw error
        setGrantCalls(data)
      } catch (error) {
        console.error('Error fetching grant calls:', error)
      }
    }

    fetchGrantCalls()
  }, [])

  // Fetch allocations when grant call changes
  useEffect(() => {
    const fetchAllocations = async () => {
      if (!formData.new_grant_call_id) {
        setAllocations([])
        return
      }

      try {
        const { data, error } = await supabase
          .from('grant_call_state_allocations')
          .select('id, state_name, amount')
          .eq('grant_call_id', formData.new_grant_call_id)
          .order('created_at', { ascending: false })

        if (error) throw error
        setAllocations(data)
      } catch (error) {
        console.error('Error fetching allocations:', error)
      }
    }

    fetchAllocations()
  }, [formData.new_grant_call_id])

  // Fetch serials when allocation changes
  useEffect(() => {
    const fetchSerials = async () => {
      if (!formData.new_allocation_id) {
        setSerials([])
        return
      }

      try {
        const { data, error } = await supabase
          .from('grant_serials')
          .select('id, serial')
          .eq('grant_call_state_allocation_id', formData.new_allocation_id)
          .order('created_at', { ascending: false })

        if (error) throw error
        setSerials(data)
      } catch (error) {
        console.error('Error fetching serials:', error)
      }
    }

    fetchSerials()
  }, [formData.new_allocation_id])

  const handleSubmit = async () => {
    if (!workplanId || !formData.new_grant_call_id || !formData.new_allocation_id || !formData.new_serial_id || !formData.reason) {
      return
    }

    try {
      setIsLoading(true)

      // Get current workplan data
      const { data: workplanData, error: workplanError } = await supabase
        .from('err_projects')
        .select('requested_amount, grant_call_id, grant_call_state_allocation_id, grant_serial_id')
        .eq('id', workplanId)
        .single()

      if (workplanError) throw workplanError

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError

      // Insert negative delta for old allocation
      const { error: oldLedgerError } = await supabase
        .from('grant_project_commitment_ledger')
        .insert({
          workplan_id: workplanId,
          grant_call_id: workplanData.grant_call_id,
          grant_call_state_allocation_id: workplanData.grant_call_state_allocation_id,
          grant_serial_id: workplanData.grant_serial_id,
          delta_amount: -workplanData.requested_amount,
          reason: formData.reason,
          created_by: user?.id
        })

      if (oldLedgerError) throw oldLedgerError

      // Insert positive delta for new allocation
      const { error: newLedgerError } = await supabase
        .from('grant_project_commitment_ledger')
        .insert({
          workplan_id: workplanId,
          grant_call_id: formData.new_grant_call_id,
          grant_call_state_allocation_id: formData.new_allocation_id,
          grant_serial_id: formData.new_serial_id,
          delta_amount: workplanData.requested_amount,
          reason: formData.reason,
          created_by: user?.id
        })

      if (newLedgerError) throw newLedgerError

      // Update workplan pointers
      const { error: updateError } = await supabase
        .from('err_projects')
        .update({
          grant_call_id: formData.new_grant_call_id,
          grant_call_state_allocation_id: formData.new_allocation_id,
          grant_serial_id: formData.new_serial_id
        })
        .eq('id', workplanId)

      if (updateError) throw updateError

      onOpenChange(false)
    } catch (error) {
      console.error('Error reassigning workplan:', error)
      alert(t('f2:reassign_error'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('f2:reassign_workplan')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>{t('f2:new_grant_call')}</Label>
            <Select
              value={formData.new_grant_call_id}
              onValueChange={(value) => setFormData(prev => ({ ...prev, new_grant_call_id: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('f2:select_grant_call')} />
              </SelectTrigger>
              <SelectContent>
                {grantCalls.map((grant) => (
                  <SelectItem key={grant.id} value={grant.id}>
                    {grant.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>{t('f2:new_allocation')}</Label>
            <Select
              value={formData.new_allocation_id}
              onValueChange={(value) => setFormData(prev => ({ ...prev, new_allocation_id: value }))}
              disabled={!formData.new_grant_call_id}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('f2:select_allocation')} />
              </SelectTrigger>
              <SelectContent>
                {allocations.map((allocation) => (
                  <SelectItem key={allocation.id} value={allocation.id}>
                    {allocation.state_name} ({allocation.amount.toLocaleString()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>{t('f2:new_serial')}</Label>
            <Select
              value={formData.new_serial_id}
              onValueChange={(value) => setFormData(prev => ({ ...prev, new_serial_id: value }))}
              disabled={!formData.new_allocation_id}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('f2:select_serial')} />
              </SelectTrigger>
              <SelectContent>
                {serials.map((serial) => (
                  <SelectItem key={serial.id} value={serial.id}>
                    {serial.serial}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>{t('f2:reason')}</Label>
            <Textarea
              value={formData.reason}
              onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
              placeholder={t('f2:reason_placeholder')}
            />
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('common:cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading || !formData.new_grant_call_id || !formData.new_allocation_id || !formData.new_serial_id || !formData.reason}
          >
                          {isLoading ? t('f2:reassigning') : t('f2:reassign')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
