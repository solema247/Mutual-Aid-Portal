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

interface Donor {
  id: string
  name: string
  short_name: string | null
}

interface GrantCall {
  id: string
  name: string
  shortname: string | null
  status: 'open' | 'closed'
  amount: number | null
  donor_id: string
  donor: Donor | null
  total_allocated: number
  total_committed: number
  total_pending: number
  grant_remaining: number
}

interface GrantSelectionTableProps {
  onGrantSelect: (grantId: string) => void
  selectedGrantId?: string | null
}

export default function GrantSelectionTable({
  onGrantSelect,
  selectedGrantId
}: GrantSelectionTableProps) {
  const { t } = useTranslation(['f2', 'common'])
  const [donors, setDonors] = useState<Donor[]>([])
  const [grantCalls, setGrantCalls] = useState<GrantCall[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedDonor, setSelectedDonor] = useState<string>('all')

  useEffect(() => {
    fetchDonors()
  }, [])

  useEffect(() => {
    fetchGrantCalls()
  }, [selectedDonor])

  const fetchDonors = async () => {
    try {
      const { data, error } = await supabase
        .from('donors')
        .select('id, name, short_name')
        .eq('status', 'active')
        .order('name')

      if (error) throw error
      setDonors(data || [])
    } catch (error) {
      console.error('Error fetching donors:', error)
    }
  }

  const fetchGrantCalls = async () => {
    try {
      setIsLoading(true)

      // First, fetch all grant calls
      let query = supabase
        .from('grant_calls')
        .select(`
          id,
          name,
          shortname,
          status,
          amount,
          donor_id,
          created_at
        `)
        .order('created_at', { ascending: false })

      // Add donor filter if not 'all'
      if (selectedDonor !== 'all') {
        query = query.eq('donor_id', selectedDonor)
      }

      const { data: grantCallsData, error } = await query

      if (error) throw error

      console.log('Raw grant calls data:', grantCallsData)

      // Get unique donor IDs from grant calls
      const donorIds = [...new Set(grantCallsData?.map(gc => gc.donor_id).filter(Boolean) || [])]
      console.log('Donor IDs found:', donorIds)

      // Fetch donor data for all donor IDs
      let donorsData: any[] = []
      if (donorIds.length > 0) {
        const { data: donors, error: donorsError } = await supabase
          .from('donors')
          .select('id, name, short_name')
          .in('id', donorIds)

        if (donorsError) {
          console.error('Error fetching donors:', donorsError)
        } else {
          donorsData = donors || []
          console.log('Donors data fetched:', donorsData)
        }
      }

      // Create a map of donor data for quick lookup
      const donorsMap = new Map(donorsData.map(donor => [donor.id, donor]))
      console.log('Donors map:', donorsMap)

      // Merge grant calls with donor data
      const grantCallsWithDonors = (grantCallsData || []).map(grantCall => ({
        ...grantCall,
        donor: donorsMap.get(grantCall.donor_id) || null
      }))

      console.log('Grant calls with donors:', grantCallsWithDonors)

      // Debug: Check if we have donor data
      const grantCallsWithDonorData = grantCallsWithDonors.filter(gc => gc.donor)
      const grantCallsWithoutDonorData = grantCallsWithDonors.filter(gc => !gc.donor)
      
      console.log('Grant calls with donor data:', grantCallsWithDonorData.length)
      console.log('Grant calls without donor data:', grantCallsWithoutDonorData.length)
      
      if (grantCallsWithoutDonorData.length > 0) {
        console.log('Grant calls missing donor data:', grantCallsWithoutDonorData.map(gc => ({
          id: gc.id,
          name: gc.name,
          donor_id: gc.donor_id
        })))
      }

      // Calculate allocation and commitment data for each grant call
      const grantCallsWithCalculations = await Promise.all(
        grantCallsWithDonors.map(async (grantCall) => {
          // Get total allocated amount from state allocations - only from latest decision
          // First get the latest decision number for this grant call
          const { data: maxDecisionData, error: maxDecisionError } = await supabase
            .from('grant_call_state_allocations')
            .select('decision_no')
            .eq('grant_call_id', grantCall.id)
            .order('decision_no', { ascending: false })
            .limit(1)

          let totalAllocated = 0
          if (!maxDecisionError && maxDecisionData?.[0]?.decision_no) {
            const latestDecisionNo = maxDecisionData[0].decision_no
            
            // Get allocations only from the latest decision
            const { data: allocationsData, error: allocationsError } = await supabase
              .from('grant_call_state_allocations')
              .select('amount')
              .eq('grant_call_id', grantCall.id)
              .eq('decision_no', latestDecisionNo)

            if (allocationsError) {
              console.error('Error fetching allocations:', allocationsError)
            }

            totalAllocated = allocationsData?.reduce((sum, allocation) => 
              sum + (allocation.amount || 0), 0) || 0
          }

          // Get total committed amount from approved and committed projects
          // Also include unassigned pending projects that have been assigned to a grant call
          const { data: committedProjectsData, error: committedError } = await supabase
            .from('err_projects')
            .select('expenses, funding_status, status')
            .eq('grant_call_id', grantCall.id)
            .or('funding_status.eq.committed,funding_status.eq.allocated,and(funding_status.eq.unassigned,status.eq.pending)')

          if (committedError) {
            console.error('Error fetching committed projects:', committedError)
          }

          let totalCommitted = 0
          let totalPending = 0
          
          for (const project of committedProjectsData || []) {
            try {
              const expenses = typeof project.expenses === 'string' 
                ? JSON.parse(project.expenses) 
                : project.expenses
              
              const amount = expenses.reduce((expSum: number, exp: any) => 
                expSum + (exp.total_cost || 0), 0)
              
              if (project.funding_status === 'committed') {
                totalCommitted += amount
              } else if (project.funding_status === 'allocated' || project.funding_status === 'unassigned') {
                // Include both allocated and unassigned (pending assignment) projects as pending
                totalPending += amount
              }
            } catch (error) {
              console.warn('Error parsing expenses:', error)
            }
          }

          const grantRemaining = (grantCall.amount || 0) - totalCommitted - totalPending

          return {
            ...grantCall,
            total_allocated: totalAllocated,
            total_committed: totalCommitted,
            total_pending: totalPending,
            grant_remaining: grantRemaining
          }
        })
      )

      setGrantCalls(grantCallsWithCalculations)
    } catch (error) {
      console.error('Error fetching grant calls:', error)
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
        {t(`f2:grant_status_${status}`)}
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
          <span>{t('f2:select_grant')}</span>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t('f2:filter_by_donor')}:</span>
              <Select value={selectedDonor} onValueChange={setSelectedDonor}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('f2:all_donors')}</SelectItem>
                  {donors.map((donor) => (
                    <SelectItem key={donor.id} value={donor.id}>
                      {donor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {grantCalls.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {t('f2:no_grant_calls_found')}
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('f2:grant_name')}</TableHead>
                  <TableHead>{t('f2:donor')}</TableHead>
                  <TableHead>{t('f2:status')}</TableHead>
                  <TableHead className="text-right">{t('f2:total_grant_amount')}</TableHead>
                  <TableHead className="text-right">{t('f2:total_allocated')}</TableHead>
                  <TableHead className="text-right">{t('f2:total_committed')}</TableHead>
                  <TableHead className="text-right">{t('f2:total_pending')}</TableHead>
                  <TableHead className="text-right" title="Available for new commitments (Total Grant - Total Committed - Total Pending)">
                     <div className="flex items-center justify-end gap-1">
                       {t('f2:grant_remaining')}
                       <Info className="h-4 w-4 text-blue-700" />
                     </div>
                   </TableHead>
                  <TableHead className="w-[100px]">{t('f2:actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grantCalls.map((grantCall) => (
                  <TableRow 
                    key={grantCall.id}
                    className={cn(
                      selectedGrantId === grantCall.id && "bg-muted/50",
                      "cursor-pointer hover:bg-muted/30"
                    )}
                    onClick={() => onGrantSelect(grantCall.id)}
                  >
                    <TableCell>
                      <div>
                        <div className="font-medium">{grantCall.name}</div>
                        {grantCall.shortname && (
                          <div className="text-sm text-muted-foreground">
                            {grantCall.shortname}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {grantCall.donor?.name || `Donor ID: ${grantCall.donor_id}`}
                        </div>
                        {grantCall.donor?.short_name && (
                          <div className="text-sm text-muted-foreground">
                            {grantCall.donor.short_name}
                          </div>
                        )}
                        {!grantCall.donor && (
                          <div className="text-sm text-muted-foreground">
                            Donor not found in database
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(grantCall.status)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(grantCall.amount || 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(grantCall.total_allocated)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(grantCall.total_committed)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(grantCall.total_pending)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="font-medium">
                        {formatCurrency(grantCall.grant_remaining)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant={selectedGrantId === grantCall.id ? "default" : "outline"}
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          onGrantSelect(grantCall.id)
                        }}
                      >
                        {selectedGrantId === grantCall.id 
                          ? t('f2:selected') 
                          : t('f2:select')}
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
