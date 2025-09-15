'use client'

import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil, Link } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { supabase } from '@/lib/supabaseClient'

interface CycleWorkplan {
  id: string;
  workplan_number: number;
  err_id: string;
  locality: string;
  "Sector (Primary)": string;
  expenses: Array<{ activity: string; total_cost: number; }> | string;
  status: 'pending' | 'approved';
  funding_status: 'allocated' | 'committed';
  funding_cycle_id: string;
  cycle_state_allocation_id: string;
  grant_serial_id: string;
  source?: string | null;
  donor_name?: string;
  grant_call_name?: string;
}

interface CycleWorkplansTableProps {
  cycleId: string | null;
  allocationId: string;
  selectedWorkplans: string[];
  onSelectWorkplans: (ids: string[]) => void;
  onAssignToGrantCall: (id: string) => void;
  onAdjust: (id: string) => void;
}

export default function CycleWorkplansTable({
  cycleId,
  allocationId,
  selectedWorkplans,
  onSelectWorkplans,
  onAssignToGrantCall,
  onAdjust
}: CycleWorkplansTableProps) {
  const { t } = useTranslation(['f2', 'common'])
  const [workplans, setWorkplans] = useState<CycleWorkplan[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const refreshWorkplans = () => {
    setRefreshTrigger(prev => prev + 1)
  }

  // Add event listener for refresh events
  useEffect(() => {
    const element = document.querySelector('div[data-testid="workplans-table"]')
    if (element) {
      const handleRefresh = () => refreshWorkplans()
      element.addEventListener('refresh', handleRefresh)
      return () => element.removeEventListener('refresh', handleRefresh)
    }
  }, [])

  useEffect(() => {
    const fetchWorkplans = async () => {
      try {
        const { data, error } = await supabase
          .from('err_projects')
          .select(`
            id,
            workplan_number,
            err_id,
            locality,
            "Sector (Primary)",
            expenses,
            status,
            funding_status,
            funding_cycle_id,
            cycle_state_allocation_id,
            grant_serial_id,
            source,
            donor_id,
            grant_call_id
          `)
          // Base scope: by cycle and allocation
          .eq('funding_cycle_id', cycleId)
          .eq('cycle_state_allocation_id', allocationId)
          .order('workplan_number', { ascending: true })

        if (error) throw error
        
        console.log('Raw workplans fetched:', data?.length || 0)
        console.log('Query params - cycleId:', cycleId, 'allocationId:', allocationId)
        
        // Log the first workplan to check data structure
        if (data?.length > 0) {
          console.log('First workplan data:', data[0])
        }

        // Debug: Log all workplans to see their status
        console.log('All fetched workplans:', data?.map(w => ({
          id: w.id,
          status: w.status,
          funding_status: w.funding_status,
          workplan_number: w.workplan_number
        })))

        // Additional filter to include approved allocated/committed, and pending direct upload
        const filteredWorkplans = data?.filter(w => {
          const isApprovedAllocatedOrCommitted = (
            w.status === 'approved' && ['allocated', 'committed'].includes(w.funding_status)
          )
          const isPendingDirectUpload = (
            w.source === 'mutual_aid_portal' && w.status === 'pending' && w.funding_status === 'allocated'
          )
          if (!(isApprovedAllocatedOrCommitted || isPendingDirectUpload)) {
            console.log(`Excluding workplan ${w.id}: status=${w.status}, funding_status=${w.funding_status}, source=${w.source}`)
          }
          return isApprovedAllocatedOrCommitted || isPendingDirectUpload
        }) || []

        console.log(`Filtered workplans: ${filteredWorkplans.length} out of ${data?.length || 0}`)

        // Get donor and grant call information for workplans that have these IDs
        const transformedWorkplans = await Promise.all(
          filteredWorkplans.map(async (w) => {
            let donorName = 'N/A'
            let grantCallName = 'N/A'

            // Try to get donor name if donor_id exists
            if (w.donor_id) {
              try {
                const { data: donorData } = await supabase
                  .from('donors')
                  .select('name')
                  .eq('id', w.donor_id)
                  .single()
                donorName = donorData?.name || 'N/A'
              } catch (error) {
                console.warn('Error fetching donor:', error)
              }
            }

            // Try to get grant call name if grant_call_id exists
            if (w.grant_call_id) {
              try {
                const { data: grantCallData } = await supabase
                  .from('grant_calls')
                  .select('name')
                  .eq('id', w.grant_call_id)
                  .single()
                grantCallName = grantCallData?.name || 'N/A'
              } catch (error) {
                console.warn('Error fetching grant call:', error)
              }
            }

            return {
              ...w,
              donor_name: donorName,
              grant_call_name: grantCallName
            }
          })
        )

        // Validate workplan data before setting
        const validWorkplans = transformedWorkplans.filter(w => {
          const isValid = w && typeof w === 'object' && 'id' in w
          if (!isValid) {
            console.warn('Invalid workplan data:', w)
          }
          return isValid
        }) || []

        setWorkplans(validWorkplans)
      } catch (error) {
        console.error('Error fetching workplans:', error)
        setWorkplans([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchWorkplans()
  }, [cycleId, allocationId, refreshTrigger])

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      // Only select non-committed workplans
      onSelectWorkplans(workplans
        .filter((w: CycleWorkplan) => w.funding_status !== 'committed')
        .map((w: CycleWorkplan) => w.id))
    } else {
      onSelectWorkplans([])
    }
  }

  const handleSelectWorkplan = (id: string, checked: boolean) => {
    if (checked) {
      onSelectWorkplans([...selectedWorkplans, id])
    } else {
      onSelectWorkplans(selectedWorkplans.filter(wId => wId !== id))
    }
  }

  const calculateTotalAmount = (expenses: CycleWorkplan['expenses']): number => {
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

  if (isLoading) {
    return <div className="text-center py-4">Loading...</div>
  }

  return (
    <div className="w-full" data-testid="workplans-table">
      <div className="flex items-center justify-end mb-4 gap-2">
        <span className="text-sm text-muted-foreground">
          {t('common:note')}: {t('f2:refresh_note')}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={refreshWorkplans}
          disabled={isLoading}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
          >
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
          {t('common:refresh')}
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]">
              {workplans.some(w => w.funding_status !== 'committed') && (
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300"
                  checked={selectedWorkplans.length === workplans.filter(w => w.funding_status !== 'committed').length}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                />
              )}
            </TableHead>
            <TableHead>{t('f2:workplan_number')}</TableHead>
            <TableHead>{t('f2:err_id')}</TableHead>
            <TableHead>{t('f2:locality')}</TableHead>
            <TableHead>{t('f2:sector_primary')}</TableHead>
            <TableHead>Donor</TableHead>
            <TableHead>Grant Call</TableHead>
            <TableHead className="text-right">{t('f2:requested_amount')}</TableHead>
            <TableHead>{t('f2:status')}</TableHead>
            <TableHead className="w-[100px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {workplans.map((workplan: CycleWorkplan) => (
            <TableRow 
              key={workplan.id}
              className={cn(
                workplan.funding_status === 'committed' && "bg-muted/50"
              )}
            >
              <TableCell>
                {workplan.funding_status !== 'committed' && (
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300"
                    checked={selectedWorkplans.includes(workplan.id)}
                    onChange={(e) => handleSelectWorkplan(workplan.id, e.target.checked)}
                  />
                )}
              </TableCell>
              <TableCell>{workplan.workplan_number}</TableCell>
              <TableCell>{workplan.err_id}</TableCell>
              <TableCell>{workplan.locality}</TableCell>
              <TableCell>{workplan["Sector (Primary)"]}</TableCell>
              <TableCell>{workplan.donor_name || 'N/A'}</TableCell>
              <TableCell>{workplan.grant_call_name || 'N/A'}</TableCell>
              <TableCell className="text-right">
                {calculateTotalAmount(workplan.expenses).toLocaleString()}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "px-2 py-1 rounded-full text-xs font-medium",
                    workplan.status === 'approved' 
                      ? "bg-green-100 text-green-700" 
                      : "bg-amber-100 text-amber-700"
                  )}>
                    {t(`f2:status_${workplan.status}`)}
                  </span>
                  {workplan.funding_status === 'committed' && (
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                      {t('f2:committed')}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {workplan.funding_status !== 'committed' && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onAssignToGrantCall(workplan.id)}
                        title="Assign to Grant Call"
                        className={cn(
                          !workplan.grant_call_id && "bg-orange-100 hover:bg-orange-200"
                        )}
                      >
                        <Link className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onAdjust(workplan.id)}
                        title={t('f2:adjust')}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
