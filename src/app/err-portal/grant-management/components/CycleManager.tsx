'use client'

import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Calendar, DollarSign, TrendingUp } from 'lucide-react'
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

  const handleCycleSelect = (cycle: FundingCycle) => {
    setSelectedCycle(cycle)
    fetchBudgetSummary(cycle.id)
  }

  const handleCycleCreated = () => {
    setIsCreateOpen(false)
    fetchCycles()
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
        {status === 'open' ? 'Open' : 'Closed'}
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
    return <div className="text-center py-8">Loading...</div>
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Funding Cycle Management</h2>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#007229] hover:bg-[#007229]/90 text-white">
              <Plus className="h-4 w-4 mr-2" />
              Create New Cycle
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Create New Funding Cycle</DialogTitle>
            </DialogHeader>
            <CycleCreationForm onSuccess={handleCycleCreated} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cycles List */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Funding Cycles</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cycle</TableHead>
                    <TableHead>Year</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Actions</TableHead>
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
                            Cycle #{cycle.cycle_number}
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
                              to {new Date(cycle.end_date).toLocaleDateString()}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">No dates set</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant={selectedCycle?.id === cycle.id ? "default" : "outline"}
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleCycleSelect(cycle)
                          }}
                        >
                          {selectedCycle?.id === cycle.id ? 'Selected' : 'Select'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Budget Summary */}
        <div className="space-y-6">
          {selectedCycle && budgetSummary && (
            <CycleBudgetDashboard 
              cycle={selectedCycle}
              budgetSummary={budgetSummary}
            />
          )}
        </div>
      </div>

      {/* Grant Pool Selector and State Allocations */}
      {selectedCycle && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <GrantPoolSelector cycleId={selectedCycle.id} />
          <StateAllocationManager cycleId={selectedCycle.id} />
        </div>
      )}
    </div>
  )
}
