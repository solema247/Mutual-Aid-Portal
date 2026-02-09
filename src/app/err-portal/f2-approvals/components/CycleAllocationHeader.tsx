'use client'

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'

interface CycleAllocationSummary {
  funding_cycle: {
    id: string;
    name: string;
    cycle_number: number;
    year: number;
  };
  total_budget: number;
  state_allocations: {
    id: string;
    state_name: string;
    amount: number;
    total_committed: number;
    remaining: number;
  }[];
  total_allocated: number;
  total_committed: number;
  remaining: number;
}

interface CycleAllocationHeaderProps {
  onCycleSelect: (cycleId: string | null) => void;
  onStateSelect: (allocationId: string | null) => void;
  selectedCycleId?: string | null;
}

export default function CycleAllocationHeader({ onCycleSelect, onStateSelect, selectedCycleId }: CycleAllocationHeaderProps) {
  const { t } = useTranslation(['f2', 'common'])
  const [allocationSummary, setAllocationSummary] = useState<CycleAllocationSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Fetch allocation summary when cycle changes
  useEffect(() => {
    const fetchAllocationSummary = async () => {
      if (!selectedCycleId) {
        setAllocationSummary(null)
        return
      }

      try {
        setIsLoading(true)
        
        // First get the funding cycle details
        const { data: cycleData, error: cycleError } = await supabase
          .from('funding_cycles')
          .select('id, name, cycle_number, year')
          .eq('id', selectedCycleId)
          .single()

        if (cycleError) throw cycleError

        // Get total budget from cycle grant inclusions
        const { data: grantInclusions, error: inclusionsError } = await supabase
          .from('cycle_grant_inclusions')
          .select('amount_included')
          .eq('cycle_id', selectedCycleId)

        if (inclusionsError) throw inclusionsError

        const totalBudget = grantInclusions?.reduce((sum, inclusion) => 
          sum + (inclusion.amount_included || 0), 0) || 0

        // Get all state allocations for this cycle
        const { data: stateAllocations, error: allocationsError } = await supabase
          .from('cycle_state_allocations')
          .select('*')
          .eq('cycle_id', selectedCycleId)
          .order('state_name', { ascending: true })

        if (allocationsError) throw allocationsError

        // Get total committed amount for each state from approved projects
        const stateCommitments = await Promise.all(
          stateAllocations.map(async (allocation) => {
            // Get all approved projects for this allocation
            const { data: projectsData, error: projectsError } = await supabase
              .from('err_projects')
              .select('expenses')
              .eq('cycle_state_allocation_id', allocation.id)
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
          funding_cycle: {
            id: cycleData.id,
            name: cycleData.name,
            cycle_number: cycleData.cycle_number,
            year: cycleData.year,
          },
          total_budget: totalBudget,
          state_allocations: stateCommitments,
          total_allocated: totalAllocated,
          total_committed: totalCommitted,
          remaining: totalBudget - totalCommitted,
        })
      } catch (error) {
        console.error('Error fetching allocation summary:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchAllocationSummary()
  }, [selectedCycleId])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onCycleSelect(null)}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Cycle Selection
        </Button>
      </div>

      <div>
        <Label className="mb-2">Selected Funding Cycle</Label>
        <div className="flex items-center gap-4">
          <div className="flex-1 p-3 bg-muted rounded-md">
            <div className="font-medium">{allocationSummary?.funding_cycle.name}</div>
            <div className="text-sm text-muted-foreground">
              Cycle #{allocationSummary?.funding_cycle.cycle_number} - {allocationSummary?.funding_cycle.year}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onCycleSelect(null)}
          >
            Change Cycle
          </Button>
        </div>
      </div>

      {allocationSummary && (
        <div className="space-y-6">
          {/* Cycle Summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label className="text-sm text-muted-foreground">
                Total Budget
              </Label>
              <div className="text-2xl font-bold">
                {allocationSummary.total_budget.toLocaleString()}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-sm text-muted-foreground">
                Total Allocated
              </Label>
              <div className="text-2xl font-bold text-muted-foreground">
                {allocationSummary.total_allocated.toLocaleString()}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-sm text-muted-foreground">
                Total Committed
              </Label>
              <div className="text-2xl font-bold text-slate-600">
                {allocationSummary.total_committed.toLocaleString()}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-sm text-muted-foreground">
                Remaining Budget
              </Label>
              <div className={cn(
                "text-2xl font-bold",
                allocationSummary.remaining >= 0 ? "text-green-600" : "text-red-600"
              )}>
                {allocationSummary.remaining.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Available for new commitments
              </div>
            </div>
          </div>

          {/* State Allocations */}
          <div>
            <Label className="mb-4 block">State Allocations</Label>
            <div className="rounded-lg border">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-2 text-left">State</th>
                    <th className="px-4 py-2 text-right">Allocated</th>
                    <th className="px-4 py-2 text-right">Committed</th>
                    <th className="px-4 py-2 text-right">Remaining</th>
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
