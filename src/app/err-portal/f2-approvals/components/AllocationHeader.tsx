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

interface AllocationHeaderProps {
  onGrantSelect: (grantId: string | null) => void;
  onStateSelect: (allocationId: string | null) => void;
}

export default function AllocationHeader({ onGrantSelect, onStateSelect }: AllocationHeaderProps) {
  const { t } = useTranslation(['f2', 'common'])
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
        
        // First get the grant call details
        const { data: grantCallData, error: grantCallError } = await supabase
          .from('grant_calls')
          .select('id, name, shortname, amount')
          .eq('id', selectedGrantCall)
          .single()

        if (grantCallError) throw grantCallError

        // Get all state allocations for this grant call
        const { data: allAllocations, error: allocationsError } = await supabase
          .from('grant_call_state_allocations')
          .select('*')
          .eq('grant_call_id', selectedGrantCall)
          .order('decision_no', { ascending: false })

        if (allocationsError) throw allocationsError

        // Group by state and get latest decision for each
        const latestByState = allAllocations.reduce((acc, curr) => {
          if (!acc[curr.state_name] || acc[curr.state_name].decision_no < curr.decision_no) {
            acc[curr.state_name] = curr
          }
          return acc
        }, {} as Record<string, any>)

        // Get the latest allocations array
        const latestAllocations = Object.values(latestByState)

        // Get total committed amount for each state from approved projects
        const stateCommitments = await Promise.all(
          latestAllocations.map(async (allocation) => {
            // Get all approved projects for this allocation
            const { data: projectsData, error: projectsError } = await supabase
              .from('err_projects')
              .select('expenses')
              .eq('grant_call_state_allocation_id', allocation.id)
              .eq('status', 'approved')
              .eq('funding_status', 'committed')

            if (projectsError) throw projectsError

            // Calculate total from expenses
            const totalCommitted = projectsData.reduce((sum: number, project: any) => {
              try {
                const expenses = typeof project.expenses === 'string' 
                  ? JSON.parse(project.expenses) 
                  : project.expenses;
                
                return sum + expenses.reduce((expSum: number, exp: any) => 
                  expSum + (exp.total_cost || 0), 0);
              } catch (error) {
                console.warn('Error parsing expenses:', error);
                return sum;
              }
            }, 0);

            return {
              ...allocation,
              total_committed: totalCommitted,
              remaining: allocation.amount - totalCommitted
            }
          })
        )

        // Calculate totals
        const totalAllocated = stateCommitments.reduce((sum, state) => sum + state.amount, 0)
        const totalCommitted = stateCommitments.reduce((sum, state) => sum + state.total_committed, 0)

        setAllocationSummary({
          grant_call: {
            id: grantCallData.id,
            name: grantCallData.name,
            shortname: grantCallData.shortname,
          },
          total_amount: grantCallData.amount,
          state_allocations: stateCommitments,
          total_allocated: totalAllocated,
          total_committed: totalCommitted,
          remaining: grantCallData.amount - totalAllocated,
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
        <Label className="mb-2">{t('f2:select_grant')}</Label>
        <Select
          value={selectedGrantCall}
          onValueChange={(value) => {
            setSelectedGrantCall(value)
            onGrantSelect(value)
            onStateSelect(null) // Clear state selection when grant changes
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t('f2:select_grant_placeholder')} />
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
        <div className="space-y-6">
          {/* Grant Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label className="text-sm text-muted-foreground">
                {t('f2:total_grant_amount')}
              </Label>
              <div className="text-2xl font-bold">
                {allocationSummary.total_amount.toLocaleString()}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-sm text-muted-foreground">
                {t('f2:total_allocated')}
              </Label>
              <div className="text-2xl font-bold text-muted-foreground">
                {allocationSummary.total_allocated.toLocaleString()}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-sm text-muted-foreground">
                {t('f2:grant_remaining')}
              </Label>
              <div className={cn(
                "text-2xl font-bold",
                allocationSummary.remaining >= 0 ? "text-green-600" : "text-red-600"
              )}>
                {allocationSummary.remaining.toLocaleString()}
              </div>
            </div>
          </div>

          {/* State Allocations */}
          <div>
            <Label className="mb-4 block">{t('f2:state_allocations')}</Label>
            <div className="rounded-lg border">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-2 text-left">{t('f2:state')}</th>
                    <th className="px-4 py-2 text-right">{t('f2:allocated')}</th>
                    <th className="px-4 py-2 text-right">{t('f2:committed')}</th>
                    <th className="px-4 py-2 text-right">{t('f2:remaining')}</th>
                  </tr>
                </thead>
                <tbody>
                  {allocationSummary.state_allocations.map((state) => (
                    <tr 
                      key={state.id} 
                      className={cn(
                        "border-b last:border-0 cursor-pointer hover:bg-muted/50",
                        "transition-colors duration-200"
                      )}
                      onClick={() => onStateSelect(state.id)}
                    >
                      <td className="px-4 py-2">{state.state_name}</td>
                      <td className="px-4 py-2 text-right">{state.amount.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right">{state.total_committed.toLocaleString()}</td>
                      <td className={cn(
                        "px-4 py-2 text-right",
                        state.remaining >= 0 ? "text-green-600" : "text-red-600"
                      )}>
                        {state.remaining.toLocaleString()}
                      </td>

                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
