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
  onAdjust?: () => void;
}

export default function AdjustModal({
  open,
  onOpenChange,
  workplanId,
  onAdjust
}: AdjustModalProps) {
  const { t } = useTranslation(['f2', 'common'])
  const [isLoading, setIsLoading] = useState(false)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [formData, setFormData] = useState<Partial<AdjustmentData>>({})

  const calculateTotalAmount = (expenses: Expense[]): number => {
    return expenses.reduce((sum, expense) => sum + (expense.total_cost || 0), 0)
  }

  // Fetch current workplan data when modal opens
  useEffect(() => {
    const fetchWorkplan = async () => {
      if (!workplanId) return

      try {
        const { data, error } = await supabase
          .from('err_projects')
          .select('expenses')
          .eq('id', workplanId)
          .single()

        if (error) throw error
        
        const expensesArray = typeof data.expenses === 'string' 
          ? JSON.parse(data.expenses) 
          : data.expenses

        setExpenses(expensesArray)
        setFormData({ expenses: expensesArray })
      } catch (error) {
        console.error('Error fetching workplan:', error)
      }
    }

    if (open && workplanId) {
      fetchWorkplan()
    } else {
      setFormData({})
      setExpenses([])
    }
  }, [open, workplanId])

  const handleSubmit = async () => {
    if (!workplanId || !formData.expenses || !formData.reason) {
      return
    }

    try {
      setIsLoading(true)

      // Get current workplan data
      const { data: workplanData, error: workplanError } = await supabase
        .from('err_projects')
        .select(`
          grant_call_id,
          grant_call_state_allocation_id,
          grant_serial_id,
          grant_call_state_allocations (
            state_name
          )
        `)
        .eq('id', workplanId)
        .single()

      if (workplanError) throw workplanError

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError

      let finalSerialId = workplanData.grant_serial_id

      // If grant_serial_id is 'new', create a new serial
      if (workplanData.grant_serial_id === 'new') {
        const response = await fetch('/api/fsystem/grant-serials/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_call_id: workplanData.grant_call_id,
            state_name: workplanData.grant_call_state_allocations.state_name,
            yymm: new Date().toISOString().slice(2, 4) + new Date().toISOString().slice(5, 7)
          })
        })

        if (!response.ok) throw new Error('Failed to create grant serial')
        const newSerial = await response.json()
        finalSerialId = newSerial.grant_serial

        // Update workplan with new serial
        const { error: updateError } = await supabase
          .from('err_projects')
          .update({ grant_serial_id: finalSerialId })
          .eq('id', workplanId)

        if (updateError) throw updateError
      }

      // Calculate delta amount
      const oldTotal = calculateTotalAmount(expenses)
      const newTotal = calculateTotalAmount(formData.expenses || [])
      const deltaAmount = newTotal - oldTotal

      // Update workplan expenses
      const { error: expensesError } = await supabase
        .from('err_projects')
        .update({ expenses: JSON.stringify(formData.expenses) })
        .eq('id', workplanId)

      if (expensesError) throw expensesError

      // Insert adjustment delta
      const { error: ledgerError } = await supabase
        .from('grant_project_commitment_ledger')
        .insert({
          workplan_id: workplanId,
          grant_call_id: workplanData.grant_call_id,
          grant_call_state_allocation_id: workplanData.grant_call_state_allocation_id,
          grant_serial_id: finalSerialId,
          delta_amount: deltaAmount,
          reason: formData.reason,
          created_by: user?.id
        })

      if (ledgerError) throw ledgerError

      onOpenChange(false)
      onAdjust?.() // Notify parent that adjustment was made
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
          <div className="space-y-4">
            {formData.expenses?.map((expense, index) => (
              <div key={index} className="grid gap-2">
                <Label>{expense.activity}</Label>
                <Input
                  type="text"
                  value={expense.total_cost.toLocaleString()}
                  onChange={(e) => {
                    const value = e.target.value.replace(/,/g, '').replace(/[^\d]/g, '')
                    if (value === '' || !isNaN(Number(value))) {
                      const newExpenses = [...(formData.expenses || [])]
                      newExpenses[index] = {
                        ...newExpenses[index],
                        total_cost: Number(value)
                      }
                      setFormData(prev => ({ ...prev, expenses: newExpenses }))
                    }
                  }}
                  placeholder="Enter new amount"
                />
              </div>
            ))}
            <div className="pt-2">
              <Label>Total Amount</Label>
              <div className="text-lg font-semibold">
                {calculateTotalAmount(formData.expenses || []).toLocaleString()}
              </div>
            </div>
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
            disabled={isLoading || !formData.expenses || !formData.reason || calculateTotalAmount(formData.expenses) === calculateTotalAmount(expenses)}
          >
                          {isLoading ? t('f2:adjusting') : t('f2:adjust')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
