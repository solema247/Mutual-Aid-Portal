'use client'

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabaseClient'
import type { AdjustmentData } from '../types'

interface AdjustModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workplanId: string | null;
}

export default function AdjustModal({
  open,
  onOpenChange,
  workplanId
}: AdjustModalProps) {
  const { t } = useTranslation(['f2', 'common'])
  const [isLoading, setIsLoading] = useState(false)
  const [currentAmount, setCurrentAmount] = useState<number>(0)
  const [formData, setFormData] = useState<Partial<AdjustmentData>>({})

  // Fetch current workplan data when modal opens
  useEffect(() => {
    const fetchWorkplan = async () => {
      if (!workplanId) return

      try {
        const { data, error } = await supabase
          .from('err_projects')
          .select('requested_amount')
          .eq('id', workplanId)
          .single()

        if (error) throw error
        setCurrentAmount(data.requested_amount)
      } catch (error) {
        console.error('Error fetching workplan:', error)
      }
    }

    if (open && workplanId) {
      fetchWorkplan()
    } else {
      setFormData({})
      setCurrentAmount(0)
    }
  }, [open, workplanId])

  const handleSubmit = async () => {
    if (!workplanId || !formData.delta_amount || !formData.reason) {
      return
    }

    try {
      setIsLoading(true)

      // Get current workplan data
      const { data: workplanData, error: workplanError } = await supabase
        .from('err_projects')
        .select('grant_call_id, grant_call_state_allocation_id, grant_serial_id')
        .eq('id', workplanId)
        .single()

      if (workplanError) throw workplanError

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError

      // Insert adjustment delta
      const { error: ledgerError } = await supabase
        .from('grant_project_commitment_ledger')
        .insert({
          workplan_id: workplanId,
          grant_call_id: workplanData.grant_call_id,
          grant_call_state_allocation_id: workplanData.grant_call_state_allocation_id,
          grant_serial_id: workplanData.grant_serial_id,
          delta_amount: formData.delta_amount,
          reason: formData.reason,
          created_by: user?.id
        })

      if (ledgerError) throw ledgerError

      onOpenChange(false)
    } catch (error) {
      console.error('Error adjusting workplan:', error)
      alert(t('f2:adjust_error'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('f2:adjust_workplan')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>{t('f2:current_amount')}</Label>
            <Input
              value={currentAmount.toLocaleString()}
              disabled
              className="bg-muted"
            />
          </div>

          <div className="grid gap-2">
            <Label>{t('f2:adjustment_amount')}</Label>
            <Input
              type="text"
              value={formData.delta_amount?.toLocaleString() || ''}
              onChange={(e) => {
                const value = e.target.value.replace(/,/g, '').replace(/[^\d.-]/g, '')
                if (value === '' || !isNaN(Number(value))) {
                  setFormData(prev => ({ ...prev, delta_amount: Number(value) }))
                }
              }}
              placeholder="+/- amount"
            />
          </div>

          <div className="grid gap-2">
            <Label>{t('f2:new_amount')}</Label>
            <Input
              value={(currentAmount + (formData.delta_amount || 0)).toLocaleString()}
              disabled
              className="bg-muted"
            />
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
            disabled={isLoading || !formData.delta_amount || !formData.reason}
          >
                          {isLoading ? t('f2:adjusting') : t('f2:adjust')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
