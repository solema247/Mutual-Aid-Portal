'use client'

import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Calendar, DollarSign, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

import type { FundingCycle } from '@/types/cycles'
import CycleCreationForm from './CycleCreationForm'
import CycleDetailsTable from './CycleDetailsTable'
import { supabase } from '@/lib/supabaseClient'

const formSchema = z.object({
  cycle_number: z.number().min(1, "Cycle number must be at least 1"),
  year: z.number().min(2020, "Year must be at least 2020"),
  name: z.string().min(1, "Name is required"),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
})

type FormData = z.infer<typeof formSchema>

export default function CycleManager() {
  const { t } = useTranslation(['err', 'common'])
  const [cycles, setCycles] = useState<FundingCycle[]>([])
  const [filteredCycles, setFilteredCycles] = useState<FundingCycle[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [allocRefreshToken, setAllocRefreshToken] = useState(0)
  const [donors, setDonors] = useState<Array<{ id: string; name: string; short_name: string | null }>>([])
  const [selectedDonorFilter, setSelectedDonorFilter] = useState<string>('all')
  const [cyclesWithGrants, setCyclesWithGrants] = useState<Record<string, { grant_call_id: string; donor_id: string }>>({})

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      cycle_number: 1,
      year: new Date().getFullYear(),
      name: '',
      start_date: '',
      end_date: '',
    },
  })

  useEffect(() => {
    fetchCycles()
    fetchDonors()
  }, [])

  useEffect(() => {
    fetchCyclesWithGrants()
  }, [cycles])

  useEffect(() => {
    filterCyclesByDonor()
  }, [selectedDonorFilter, cycles, cyclesWithGrants])

  const fetchDonors = async () => {
    try {
      const { data, error } = await supabase
        .from('donors')
        .select('id, name, short_name')
        .eq('status', 'active')
        .order('name', { ascending: true })

      if (error) throw error
      setDonors(data || [])
    } catch (error) {
      console.error('Error fetching donors:', error)
    }
  }

  const fetchCyclesWithGrants = async () => {
    try {
      const grantData: Record<string, { grant_call_id: string; donor_id: string }> = {}
      
      for (const cycle of cycles) {
        const response = await fetch(`/api/cycles/${cycle.id}/grants`)
        if (response.ok) {
          const grantsData = await response.json()
          if (grantsData && grantsData.length > 0) {
            // The grantsData already includes grant_calls with donor information
            const grantCall = grantsData[0]?.grant_calls
            if (grantCall?.id && grantCall?.donor?.id) {
              grantData[cycle.id] = {
                grant_call_id: grantCall.id,
                donor_id: grantCall.donor.id
              }
            }
          }
        }
      }
      setCyclesWithGrants(grantData)
    } catch (error) {
      console.error('Error fetching cycles with grants:', error)
    }
  }

  const filterCyclesByDonor = () => {
    if (selectedDonorFilter === 'all') {
      setFilteredCycles(cycles)
    } else {
      const filtered = cycles.filter(cycle => {
        const cycleGrant = cyclesWithGrants[cycle.id]
        return cycleGrant?.donor_id === selectedDonorFilter
      })
      setFilteredCycles(filtered)
    }
  }

  const fetchCycles = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/cycles')
      if (!response.ok) throw new Error('Failed to fetch cycles')
      const data = await response.json()
      setCycles(data)
      setFilteredCycles(data) // Initialize filtered cycles with all cycles
    } catch (error) {
      console.error('Error fetching cycles:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleGrantsChanged = () => {
    setAllocRefreshToken((t) => t + 1)
  }

  const handleRefreshBudget = () => {
    setAllocRefreshToken((t) => t + 1)
  }

  const handleCycleCreated = () => {
    setIsCreateOpen(false)
    fetchCycles().then(() => {
      // Filter will be applied automatically via useEffect
    })
    form.reset()
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
        {status === 'open' ? t('err:cycles.status_open') : t('err:cycles.status_closed')}
      </Badge>
    )
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount)
  }

  if (isLoading) {
    return <div className="text-center py-8">{t('common:loading')}</div>
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Distribution Decisions
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select
              value={selectedDonorFilter}
              onValueChange={setSelectedDonorFilter}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Filter by Donor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Donors</SelectItem>
                {donors.map((donor) => (
                  <SelectItem key={donor.id} value={donor.id}>
                    {donor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button className="bg-[#007229] hover:bg-[#007229]/90 text-white">
                  <Plus className="h-4 w-4 mr-2" />
                  Create New Distribution Decision
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                  <DialogTitle>Create New Distribution Decision</DialogTitle>
                </DialogHeader>
                <CycleCreationForm onSuccess={handleCycleCreated} />
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          {filteredCycles.length === 0 && cycles.length > 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No distribution decisions found for the selected donor filter.
            </div>
          ) : filteredCycles.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead>Cycle</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Grant</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Total Available</TableHead>
                  <TableHead>Remaining</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCycles.map((cycle) => {
                  return (
                    <CycleDetailsTable
                      key={cycle.id}
                      cycle={cycle}
                      onGrantsChanged={() => {
                        handleGrantsChanged()
                        fetchCyclesWithGrants()
                      }}
                      onAllocationsChanged={handleRefreshBudget}
                    />
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No distribution decisions found. Create a new distribution decision to get started.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}