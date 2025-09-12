'use client'

import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Save, Trash2, MapPin } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface State {
  state_name: string
}

interface CycleStateAllocation {
  id: string
  cycle_id: string
  state_name: string
  amount: number
  decision_no: number
  total_committed?: number
  total_pending?: number
  remaining?: number
}

interface StateAllocationManagerProps {
  cycleId: string
}

export default function StateAllocationManager({ cycleId }: StateAllocationManagerProps) {
  const { t } = useTranslation(['err', 'common'])
  const [states, setStates] = useState<State[]>([])
  const [allocations, setAllocations] = useState<CycleStateAllocation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [newAllocations, setNewAllocations] = useState<{ state_name: string; amount: string }[]>([])

  useEffect(() => {
    fetchData()
  }, [cycleId])

  const fetchData = async () => {
    try {
      setIsLoading(true)
      
      // Fetch states
      const statesResponse = await fetch('/api/states')
      if (!statesResponse.ok) throw new Error('Failed to fetch states')
      const statesData = await statesResponse.json()
      setStates(statesData)

      // Fetch allocations
      const allocationsResponse = await fetch(`/api/cycles/${cycleId}/allocations`)
      if (!allocationsResponse.ok) throw new Error('Failed to fetch allocations')
      const allocationsData = await allocationsResponse.json()
      setAllocations(allocationsData)
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddState = () => {
    setNewAllocations(prev => [...prev, { state_name: '', amount: '' }])
  }

  const handleAllocationChange = (index: number, field: string, value: string) => {
    setNewAllocations(prev => prev.map((alloc, i) => 
      i === index ? { ...alloc, [field]: value } : alloc
    ))
  }

  const handleSaveAllocations = async () => {
    const validAllocations = newAllocations.filter(alloc => 
      alloc.state_name && alloc.amount && Number(alloc.amount) > 0
    )

    if (validAllocations.length === 0) return

    try {
      setIsSubmitting(true)

      const allocationsToInsert = validAllocations.map(alloc => ({
        state_name: alloc.state_name,
        amount: Number(alloc.amount)
      }))

      const response = await fetch(`/api/cycles/${cycleId}/allocations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ allocations: allocationsToInsert }),
      })

      if (!response.ok) throw new Error('Failed to save allocations')

      setNewAllocations([])
      fetchData()
    } catch (error) {
      console.error('Error saving allocations:', error)
      alert('Failed to save allocations')
    } finally {
      setIsSubmitting(false)
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

  const getTotalAllocated = () => {
    return allocations.reduce((sum, alloc) => sum + alloc.amount, 0)
  }

  const getTotalCommitted = () => {
    return allocations.reduce((sum, alloc) => sum + (alloc.total_committed || 0), 0)
  }

  const getTotalPending = () => {
    return allocations.reduce((sum, alloc) => sum + (alloc.total_pending || 0), 0)
  }

  if (isLoading) {
    return <div className="text-center py-4">Loading...</div>
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            State Allocations
          </span>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleAddState}
              variant="outline"
              size="sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add State
            </Button>
            {newAllocations.length > 0 && (
              <Button
                onClick={handleSaveAllocations}
                disabled={isSubmitting}
                className="bg-[#007229] hover:bg-[#007229]/90 text-white"
                size="sm"
              >
                <Save className="h-4 w-4 mr-2" />
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Total Allocated</div>
              <div className="text-lg font-bold">{formatCurrency(getTotalAllocated())}</div>
            </div>
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Total Committed</div>
              <div className="text-lg font-bold text-green-600">{formatCurrency(getTotalCommitted())}</div>
            </div>
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Total Pending</div>
              <div className="text-lg font-bold text-orange-600">{formatCurrency(getTotalPending())}</div>
            </div>
          </div>

          {/* New Allocations */}
          {newAllocations.length > 0 && (
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground">New Allocations</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>State</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {newAllocations.map((allocation, index) => (
                    <TableRow key={index} className="bg-muted/20">
                      <TableCell>
                        <Select
                          value={allocation.state_name}
                          onValueChange={(value) => handleAllocationChange(index, 'state_name', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select state" />
                          </SelectTrigger>
                          <SelectContent>
                            {states.map((state) => (
                              <SelectItem key={state.state_name} value={state.state_name}>
                                {state.state_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="text"
                          value={allocation.amount}
                          onChange={(e) => {
                            const value = e.target.value.replace(/,/g, '').replace(/[^\d.]/g, '')
                            if (value === '' || !isNaN(Number(value))) {
                              handleAllocationChange(index, 'amount', value)
                            }
                          }}
                          className="text-right"
                          placeholder="0"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setNewAllocations(prev => prev.filter((_, i) => i !== index))
                          }}
                          className="h-8 w-8 text-destructive hover:text-destructive/80"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Existing Allocations */}
          {allocations.length > 0 && (
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground">Current Allocations</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>State</TableHead>
                    <TableHead className="text-right">Allocated</TableHead>
                    <TableHead className="text-right">Committed</TableHead>
                    <TableHead className="text-right">Pending</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allocations.map((allocation) => (
                    <TableRow key={allocation.id}>
                      <TableCell className="font-medium">{allocation.state_name}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(allocation.amount)}
                      </TableCell>
                      <TableCell className="text-right text-green-600">
                        {formatCurrency(allocation.total_committed || 0)}
                      </TableCell>
                      <TableCell className="text-right text-orange-600">
                        {formatCurrency(allocation.total_pending || 0)}
                      </TableCell>
                      <TableCell className={cn(
                        "text-right font-medium",
                        (allocation.remaining || 0) >= 0 ? "text-green-600" : "text-red-600"
                      )}>
                        {formatCurrency(allocation.remaining || 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {allocations.length === 0 && newAllocations.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No state allocations yet. Add states to get started.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
