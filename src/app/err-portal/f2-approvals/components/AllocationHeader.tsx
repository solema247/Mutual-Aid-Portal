'use client'

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CheckCircle2, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import type { AllocationSummary } from '../types'

export default function AllocationHeader() {
  const { t } = useTranslation(['err', 'common'])
  const [grantCalls, setGrantCalls] = useState<{ id: string; name: string }[]>([])
  const [selectedGrantCall, setSelectedGrantCall] = useState<string>('')
  const [allocationSummary, setAllocationSummary] = useState<AllocationSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Fetch grant calls
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

  // Fetch allocation summary when grant call changes
  useEffect(() => {
    const fetchAllocationSummary = async () => {
      if (!selectedGrantCall) {
        setAllocationSummary(null)
        return
      }

      try {
        setIsLoading(true)
        
        // Get the latest allocation decision for this grant call
        const { data: allocationData, error: allocationError } = await supabase
          .from('grant_call_state_allocations')
          .select(`
            id,
            state_name,
            amount,
            decision_no,
            grant_calls!inner (
              id,
              name,
              shortname
            )
          `)
          .eq('grant_call_id', selectedGrantCall)
          .order('decision_no', { ascending: false })
          .limit(1)

        if (allocationError) throw allocationError
        if (!allocationData?.length) return

        // Get total committed amount from ledger
        const { data: ledgerData, error: ledgerError } = await supabase
          .from('grant_project_commitment_ledger')
          .select('delta_amount')
          .eq('grant_call_state_allocation_id', allocationData[0].id)

        if (ledgerError) throw ledgerError

        const totalCommitted = ledgerData.reduce((sum, entry) => sum + entry.delta_amount, 0)
        const remaining = allocationData[0].amount - totalCommitted

        setAllocationSummary({
          grant_call: {
            id: allocationData[0].grant_calls.id,
            name: allocationData[0].grant_calls.name,
            shortname: allocationData[0].grant_calls.shortname,
          },
          state: {
            name: allocationData[0].state_name,
          },
          grant_serial: '', // TODO: Add grant serial logic
          decision_no: allocationData[0].decision_no,
          allocation_amount: allocationData[0].amount,
          total_committed: totalCommitted,
          remaining: remaining,
        })
      } catch (error) {
        console.error('Error fetching allocation summary:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchAllocationSummary()
  }, [selectedGrantCall])

  return (
    <div className="space-y-6">
      <div>
        <Label className="mb-2">{t('err:f2.select_grant')}</Label>
        <Select
          value={selectedGrantCall}
          onValueChange={setSelectedGrantCall}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t('err:f2.select_grant_placeholder')} />
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

      {allocationSummary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1">
            <Label className="text-sm text-muted-foreground">
              {t('err:f2.allocation_amount')}
            </Label>
            <div className="text-2xl font-bold">
              {allocationSummary.allocation_amount.toLocaleString()}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-sm text-muted-foreground">
              {t('err:f2.total_committed')}
            </Label>
            <div className="text-2xl font-bold text-muted-foreground">
              {allocationSummary.total_committed.toLocaleString()}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-sm text-muted-foreground">
              {t('err:f2.remaining_amount')}
            </Label>
            <div className={cn(
              "text-2xl font-bold",
              allocationSummary.remaining >= 0 ? "text-green-600" : "text-red-600"
            )}>
              {allocationSummary.remaining.toLocaleString()}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {allocationSummary.remaining >= 0 ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="text-sm text-green-600 font-medium">
                  {t('err:f2.within_allocation')}
                </span>
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-red-600" />
                <span className="text-sm text-red-600 font-medium">
                  {t('err:f2.over_allocation')}
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
