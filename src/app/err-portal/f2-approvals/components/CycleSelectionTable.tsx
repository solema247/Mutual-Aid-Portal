'use client'

import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabaseClient'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Info } from 'lucide-react'

interface FundingCycle {
  id: string
  cycle_number: number
  year: number
  name: string
  status: 'open' | 'closed'
  start_date: string | null
  end_date: string | null
  total_budget: number
  total_allocated: number
  total_committed: number
  remaining_budget: number
}

interface CycleSelectionTableProps {
  onCycleSelect: (cycleId: string) => void
  selectedCycleId?: string | null
}

export default function CycleSelectionTable({
  onCycleSelect,
  selectedCycleId
}: CycleSelectionTableProps) {
  const { t } = useTranslation(['f2', 'common'])
  const [fundingCycles, setFundingCycles] = useState<FundingCycle[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all')

  useEffect(() => {
    fetchFundingCycles()
  }, [statusFilter])

  const fetchFundingCycles = async () => {
    try {
      setIsLoading(true)

      // Fetch funding cycles with budget calculations
      let query = supabase
        .from('funding_cycles')
        .select(`
          id,
          cycle_number,
          year,
          name,
          status,
          start_date,
          end_date
        `)
        .order('year', { ascending: false })
        .order('cycle_number', { ascending: false })

      // Add status filter if not 'all'
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      const { data: cyclesData, error } = await query

      if (error) throw error

      // Calculate budget information for each cycle
      const cyclesWithBudget = await Promise.all(
        (cyclesData || []).map(async (cycle) => {
          // Get total budget from cycle grant inclusions
          const { data: grantInclusions, error: inclusionsError } = await supabase
            .from('cycle_grant_inclusions')
            .select('amount_included')
            .eq('cycle_id', cycle.id)

          if (inclusionsError) {
            console.error('Error fetching grant inclusions:', inclusionsError)
          }

          const totalBudget = grantInclusions?.reduce((sum, inclusion) => 
            sum + (inclusion.amount_included || 0), 0) || 0

          // Get total allocated from cycle state allocations
          const { data: stateAllocations, error: allocationsError } = await supabase
            .from('cycle_state_allocations')
            .select('amount')
            .eq('cycle_id', cycle.id)

          if (allocationsError) {
            console.error('Error fetching state allocations:', allocationsError)
          }

          const totalAllocated = stateAllocations?.reduce((sum, allocation) => 
            sum + (allocation.amount || 0), 0) || 0

          // Get total committed from approved projects
          const { data: committedProjects, error: committedError } = await supabase
            .from('err_projects')
            .select('expenses')
            .eq('funding_cycle_id', cycle.id)
            .eq('status', 'approved')
            .eq('funding_status', 'committed')

          if (committedError) {
            console.error('Error fetching committed projects:', committedError)
          }

          const totalCommitted = (committedProjects || []).reduce((sum, project) => {
            try {
              const expenses = typeof project.expenses === 'string' 
                ? JSON.parse(project.expenses) 
                : project.expenses
              
              return sum + expenses.reduce((expSum: number, exp: any) => 
                expSum + (exp.total_cost || 0), 0)
            } catch (error) {
              console.warn('Error parsing expenses:', error)
              return sum
            }
          }, 0)

          const remainingBudget = totalBudget - totalCommitted

          return {
            ...cycle,
            total_budget: totalBudget,
            total_allocated: totalAllocated,
            total_committed: totalCommitted,
            remaining_budget: remainingBudget
          }
        })
      )

      setFundingCycles(cyclesWithBudget)
    } catch (error) {
      console.error('Error fetching funding cycles:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount)
  }

  const getStatusBadge = (status: string) => {
    return (
      <Badge 
        variant={status === 'open' ? 'default' : 'secondary'}
        className={cn(
          status === 'open' 
            ? 'bg-green-100 text-green-700 hover:bg-green-100' 
            : 'bg-gray-100 text-gray-700 hover:bg-gray-100'
        )}
      >
        {status === 'open' ? 'Open' : 'Closed'}
      </Badge>
    )
  }

  if (isLoading) {
    return <div className="text-center py-8">{t('common:loading')}</div>
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Select Funding Cycle</span>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Filter by status:</span>
              <Select value={statusFilter} onValueChange={(value: 'all' | 'open' | 'closed') => setStatusFilter(value)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {fundingCycles.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No funding cycles found
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cycle Name</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total Budget</TableHead>
                  <TableHead className="text-right">Total Allocated</TableHead>
                  <TableHead className="text-right">Total Committed</TableHead>
                  <TableHead className="text-right" title="Available for new commitments (Total Budget - Total Committed)">
                    <div className="flex items-center justify-end gap-1">
                      Remaining Budget
                      <Info className="h-4 w-4 text-blue-700" />
                    </div>
                  </TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fundingCycles.map((cycle) => (
                  <TableRow 
                    key={cycle.id}
                    className={cn(
                      selectedCycleId === cycle.id && "bg-muted/50",
                      "cursor-pointer hover:bg-muted/30"
                    )}
                    onClick={() => onCycleSelect(cycle.id)}
                  >
                    <TableCell>
                      <div>
                        <div className="font-medium">{cycle.name}</div>
                        <div className="text-sm text-muted-foreground">
                          Cycle #{cycle.cycle_number}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {cycle.year}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(cycle.status)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(cycle.total_budget)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(cycle.total_allocated)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(cycle.total_committed)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="font-medium">
                        {formatCurrency(cycle.remaining_budget)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant={selectedCycleId === cycle.id ? "default" : "outline"}
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          onCycleSelect(cycle.id)
                        }}
                      >
                        {selectedCycleId === cycle.id 
                          ? 'Selected' 
                          : 'Select'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  )
}
