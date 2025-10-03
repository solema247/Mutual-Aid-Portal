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

import type { FundingCycle, CycleBudgetSummary } from '@/types/cycles'
import CycleCreationForm from './CycleCreationForm'
import GrantPoolSelector from './GrantPoolSelector'
import CycleBudgetDashboard from './CycleBudgetDashboard'
import StateAllocationManager from './StateAllocationManager'

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
  const [isLoading, setIsLoading] = useState(true)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [selectedCycle, setSelectedCycle] = useState<FundingCycle | null>(null)
  const [budgetSummary, setBudgetSummary] = useState<CycleBudgetSummary | null>(null)
  const [isRefreshingBudget, setIsRefreshingBudget] = useState(false)
  const [allocRefreshToken, setAllocRefreshToken] = useState(0)
  const [isBudgetSummaryExpanded, setIsBudgetSummaryExpanded] = useState(true)
  const [isFundingCyclesExpanded, setIsFundingCyclesExpanded] = useState(true)

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
  }, [])

  const fetchCycles = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/cycles')
      if (!response.ok) throw new Error('Failed to fetch cycles')
      const data = await response.json()
      setCycles(data)
    } catch (error) {
      console.error('Error fetching cycles:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchBudgetSummary = async (cycleId: string) => {
    try {
      const response = await fetch(`/api/cycles/budget-summary/${cycleId}`)
      if (!response.ok) throw new Error('Failed to fetch budget summary')
      const data = await response.json()
      setBudgetSummary(data)
    } catch (error) {
      console.error('Error fetching budget summary:', error)
    }
  }

  const handleRefreshBudget = async () => {
    if (!selectedCycle) return
    
    try {
      setIsRefreshingBudget(true)
      await fetchBudgetSummary(selectedCycle.id)
    } catch (error) {
      console.error('Error refreshing budget summary:', error)
    } finally {
      setIsRefreshingBudget(false)
    }
  }

  const handleGrantsChanged = async () => {
    await handleRefreshBudget()
    setAllocRefreshToken((t) => t + 1)
  }

  const handleCycleSelect = (cycle: FundingCycle) => {
    setSelectedCycle(cycle)
    fetchBudgetSummary(cycle.id)
  }

  const handleCycleCreated = () => {
    setIsCreateOpen(false)
    fetchCycles()
    form.reset()
  }

  const handleCloseCycle = async (cycleId: string) => {
    if (!confirm(t('err:cycles.confirm_close'))) {
      return
    }

    try {
      const response = await fetch(`/api/cycles/${cycleId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'closed' }),
      })

      if (!response.ok) throw new Error('Failed to close cycle')

      // Refresh cycles and update selected cycle if it was the one closed
      await fetchCycles()
      if (selectedCycle?.id === cycleId) {
        const updatedCycle = cycles.find(c => c.id === cycleId)
        if (updatedCycle) {
          setSelectedCycle({ ...updatedCycle, status: 'closed' })
        }
      }
    } catch (error) {
      console.error('Error closing cycle:', error)
      alert('Failed to close cycle. Please try again.')
    }
  }

  const handleReopenCycle = async (cycleId: string) => {
    if (!confirm(t('err:cycles.confirm_reopen'))) {
      return
    }

    try {
      const response = await fetch(`/api/cycles/${cycleId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'open' }),
      })

      if (!response.ok) throw new Error('Failed to reopen cycle')

      // Refresh cycles and update selected cycle if it was the one reopened
      await fetchCycles()
      if (selectedCycle?.id === cycleId) {
        const updatedCycle = cycles.find(c => c.id === cycleId)
        if (updatedCycle) {
          setSelectedCycle({ ...updatedCycle, status: 'open' })
        }
      }
    } catch (error) {
      console.error('Error reopening cycle:', error)
      alert('Failed to reopen cycle. Please try again.')
    }
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
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">{t('err:cycles.title')}</h2>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#007229] hover:bg-[#007229]/90 text-white">
              <Plus className="h-4 w-4 mr-2" />
              {t('err:cycles.create_new')}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>{t('err:cycles.create_dialog_title')}</DialogTitle>
            </DialogHeader>
            <CycleCreationForm onSuccess={handleCycleCreated} />
          </DialogContent>
        </Dialog>
      </div>

      {/* 1. Funding Cycles Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {t('err:cycles.table_title')}
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsFundingCyclesExpanded(!isFundingCyclesExpanded)}
              className="h-8 w-8 p-0"
            >
              {isFundingCyclesExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardHeader>
        {isFundingCyclesExpanded && (
          <CardContent>
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('err:cycles.headers.cycle')}</TableHead>
                    <TableHead>{t('err:cycles.headers.year')}</TableHead>
                    <TableHead>{t('err:cycles.headers.status')}</TableHead>
                    <TableHead>{t('err:cycles.headers.period')}</TableHead>
                    <TableHead>{t('err:cycles.headers.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cycles.map((cycle) => (
                    <TableRow 
                      key={cycle.id}
                      className={cn(
                        selectedCycle?.id === cycle.id && "bg-muted/50",
                        "cursor-pointer hover:bg-muted/30"
                      )}
                      onClick={() => handleCycleSelect(cycle)}
                    >
                      <TableCell>
                        <div>
                          <div className="font-medium">{cycle.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {t('err:cycles.cycle_number', { num: cycle.cycle_number })}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{cycle.year}</TableCell>
                      <TableCell>{getStatusBadge(cycle.status)}</TableCell>
                      <TableCell>
                        {cycle.start_date && cycle.end_date ? (
                          <div className="text-sm">
                            <div>{new Date(cycle.start_date).toLocaleDateString()}</div>
                            <div className="text-muted-foreground">
                              {t('err:cycles.to')} {new Date(cycle.end_date).toLocaleDateString()}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">{t('err:cycles.no_dates')}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant={selectedCycle?.id === cycle.id ? "default" : "outline"}
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleCycleSelect(cycle)
                            }}
                          >
                            {selectedCycle?.id === cycle.id ? t('err:cycles.selected') : t('err:cycles.select')}
                          </Button>
                          {cycle.status === 'open' ? (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCloseCycle(cycle.id)
                              }}
                            >
                              {t('err:cycles.close')}
                            </Button>
                          ) : (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleReopenCycle(cycle.id)
                              }}
                              className="bg-green-600 hover:bg-green-700 text-white"
                            >
                              {t('err:cycles.reopen')}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        )}
      </Card>

      {/* 2. Funding Cycle Details */}
      {selectedCycle && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                {t('err:cycles.details')} - {selectedCycle.name}
              </span>
              {selectedCycle.status === 'open' ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleCloseCycle(selectedCycle.id)}
                >
                  {t('err:cycles.close_cycle')}
                </Button>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => handleReopenCycle(selectedCycle.id)}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {t('err:cycles.reopen_cycle')}
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">{t('err:cycles.detail_labels.cycle_number')}</div>
                <div className="text-2xl font-bold">#{selectedCycle.cycle_number}</div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">{t('err:cycles.detail_labels.year')}</div>
                <div className="text-2xl font-bold">{selectedCycle.year}</div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">{t('err:cycles.detail_labels.status')}</div>
                <div className="text-2xl">{getStatusBadge(selectedCycle.status)}</div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">{t('err:cycles.detail_labels.period')}</div>
                <div className="text-sm">
                  {selectedCycle.start_date && selectedCycle.end_date ? (
                    <>
                      <div>{new Date(selectedCycle.start_date).toLocaleDateString()}</div>
                      <div className="text-muted-foreground">
                        {t('err:cycles.to')} {new Date(selectedCycle.end_date).toLocaleDateString()}
                      </div>
                    </>
                  ) : (
                    <span className="text-muted-foreground">{t('err:cycles.no_dates')}</span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3. Budget Summary */}
      {selectedCycle && budgetSummary && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                {t('err:cycles.budget_summary')}
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsBudgetSummaryExpanded(!isBudgetSummaryExpanded)}
                className="h-8 w-8 p-0"
              >
                {isBudgetSummaryExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardHeader>
          {isBudgetSummaryExpanded && (
            <CardContent>
              <CycleBudgetDashboard 
                cycle={selectedCycle}
                budgetSummary={budgetSummary}
                onRefresh={handleRefreshBudget}
                isRefreshing={isRefreshingBudget}
              />
            </CardContent>
          )}
        </Card>
      )}

      {/* 4. Grant Pool */}
      {selectedCycle && (
        <Card>
          <CardContent className="pt-6">
            <GrantPoolSelector 
              cycleId={selectedCycle.id} 
              onGrantsChanged={handleGrantsChanged}
            />
          </CardContent>
        </Card>
      )}

      {/* 5. State Allocations */}
      {selectedCycle && (
        <Card>
          <CardContent className="pt-6">
            <StateAllocationManager 
              cycleId={selectedCycle.id} 
              cycle={selectedCycle}
              refreshToken={allocRefreshToken}
              onAllocationsChanged={handleRefreshBudget}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}