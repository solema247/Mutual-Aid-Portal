'use client'

import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, ChevronDown, Plus, Trash2, Pencil, DollarSign, Building2, MapPin, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

import type { FundingCycle, CycleBudgetSummary } from '@/types/cycles'
import type { CycleGrantInclusion } from '@/types/cycles'

interface CycleDetailsTableProps {
  cycle: FundingCycle
  onGrantsChanged?: () => void
  onAllocationsChanged?: () => void
}

interface GrantCall {
  id: string
  name: string
  shortname: string | null
  amount: number | null
  available_amount: number | null
  status: 'open' | 'closed'
  donor: {
    id: string
    name: string
    short_name: string | null
  }
}

interface StateAllocation {
  id: string
  state_name: string
  amount: number
  decision_no: number
  total_committed?: number
  total_pending?: number
  remaining?: number
}

export default function CycleDetailsTable({
  cycle,
  onGrantsChanged,
  onAllocationsChanged
}: CycleDetailsTableProps) {
  const { t } = useTranslation(['err', 'common'])
  const [isExpanded, setIsExpanded] = useState(false)
  const [isGrantBudgetExpanded, setIsGrantBudgetExpanded] = useState(false)
  const [isStatesExpanded, setIsStatesExpanded] = useState(false)
  
  const [includedGrants, setIncludedGrants] = useState<CycleGrantInclusion[]>([])
  const [availableGrants, setAvailableGrants] = useState<GrantCall[]>([])
  const [states, setStates] = useState<Array<{ state_name: string }>>([])
  const [allocations, setAllocations] = useState<StateAllocation[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [localBudgetSummary, setLocalBudgetSummary] = useState<CycleBudgetSummary | null>(null)
  const [isRefreshingBudget, setIsRefreshingBudget] = useState(false)
  const [grantName, setGrantName] = useState<string | null>(null)
  
  const [isAddGrantOpen, setIsAddGrantOpen] = useState(false)
  const [selectedGrant, setSelectedGrant] = useState<string>('')
  const [amountIncluded, setAmountIncluded] = useState<string>('')
  
  const [isAddStateOpen, setIsAddStateOpen] = useState(false)
  const [newAllocations, setNewAllocations] = useState<{ state_name: string; amount: string }[]>([])
  const [editingAllocation, setEditingAllocation] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState<string>('')

  useEffect(() => {
    // Always fetch budget summary and grant name on mount and when cycle changes
    fetchBudgetSummary()
    fetchGrantName()
    
    if (isExpanded) {
      fetchData()
    }
  }, [isExpanded, cycle.id])
  
  const fetchGrantName = async () => {
    try {
      const response = await fetch(`/api/cycles/${cycle.id}/grants`)
      if (response.ok) {
        const grantsData = await response.json()
        if (grantsData && grantsData.length > 0) {
          // Since only one grant per cycle, get the first one
          setGrantName(grantsData[0]?.grant_calls?.name || null)
        } else {
          setGrantName(null)
        }
      }
    } catch (error) {
      console.error('Error fetching grant name:', error)
      setGrantName(null)
    }
  }

  const fetchBudgetSummary = async () => {
    try {
      setIsRefreshingBudget(true)
      const response = await fetch(`/api/cycles/budget-summary/${cycle.id}`)
      if (response.ok) {
        const data = await response.json()
        setLocalBudgetSummary(data)
      }
    } catch (error) {
      console.error('Error fetching budget summary:', error)
    } finally {
      setIsRefreshingBudget(false)
    }
  }

  const fetchData = async () => {
    try {
      setIsLoading(true)
      
      // Fetch grant inclusions
      const grantsResponse = await fetch(`/api/cycles/${cycle.id}/grants`)
      if (grantsResponse.ok) {
        const grantsData = await grantsResponse.json()
        setIncludedGrants(grantsData)
        // Update grant name
        if (grantsData && grantsData.length > 0) {
          setGrantName(grantsData[0]?.grant_calls?.name || null)
        } else {
          setGrantName(null)
        }
      }
      
      // Fetch available grants
      const availableResponse = await fetch('/api/grant-calls')
      if (availableResponse.ok) {
        const availableData = await availableResponse.json()
        setAvailableGrants(availableData.filter((g: GrantCall) => g.status === 'open'))
      }
      
      // Fetch states
      const statesResponse = await fetch('/api/states')
      if (statesResponse.ok) {
        const statesData = await statesResponse.json()
        setStates(statesData)
      }
      
      // Fetch allocations
      const allocationsResponse = await fetch(`/api/cycles/${cycle.id}/allocations`)
      if (allocationsResponse.ok) {
        const allocationsData = await allocationsResponse.json()
        setAllocations(allocationsData)
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddGrant = async () => {
    if (!selectedGrant || !amountIncluded || includedGrants.length > 0) return

    const amount = parseFloat(amountIncluded)
    const selectedGrantCall = availableGrants.find(g => g.id === selectedGrant)
    if (!selectedGrantCall) return

    if (selectedGrantCall.available_amount !== null && amount > selectedGrantCall.available_amount) {
      alert('Amount exceeds available grant amount')
      return
    }

    try {
      const response = await fetch(`/api/cycles/${cycle.id}/grants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_inclusions: [{
            grant_call_id: selectedGrant,
            amount_included: amount
          }]
        }),
      })

      if (!response.ok) throw new Error('Failed to add grant')
      
      setIsAddGrantOpen(false)
      setSelectedGrant('')
      setAmountIncluded('')
      await fetchData()
      await fetchGrantName()
      onGrantsChanged?.()
    } catch (error) {
      console.error('Error adding grant:', error)
      alert('Failed to add grant')
    }
  }

  const handleRemoveGrant = async (grantId: string) => {
    try {
      const response = await fetch(`/api/cycles/${cycle.id}/grants/${grantId}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error('Failed to remove grant')
      await fetchData()
      await fetchGrantName()
      onGrantsChanged?.()
    } catch (error) {
      console.error('Error removing grant:', error)
      alert('Failed to remove grant')
    }
  }

  const handleAddState = () => {
    setNewAllocations(prev => [...prev, { state_name: '', amount: '' }])
  }

  const handleSaveAllocations = async () => {
    const validAllocations = newAllocations.filter(alloc => 
      alloc.state_name && alloc.amount && Number(alloc.amount) > 0
    )

    if (validAllocations.length === 0) return

    try {
      const allocationsToInsert = validAllocations.map(alloc => ({
        state_name: alloc.state_name,
        amount: Number(alloc.amount),
        decision_no: 1
      }))

      const response = await fetch(`/api/cycles/${cycle.id}/allocations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allocations: allocationsToInsert }),
      })

      if (!response.ok) throw new Error('Failed to save allocations')

      setNewAllocations([])
      setIsAddStateOpen(false)
      fetchData()
      onAllocationsChanged?.()
    } catch (error) {
      console.error('Error saving allocations:', error)
      alert('Failed to save allocations')
    }
  }

  const handleEditAllocation = (allocationId: string, currentAmount: number) => {
    setEditingAllocation(allocationId)
    setEditAmount(currentAmount.toString())
  }

  const handleSaveEdit = async () => {
    if (!editingAllocation || !editAmount || Number(editAmount) <= 0) return

    try {
      const response = await fetch(`/api/cycles/${cycle.id}/allocations/${editingAllocation}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(editAmount) }),
      })

      if (!response.ok) throw new Error('Failed to update allocation')

      setEditingAllocation(null)
      setEditAmount('')
      fetchData()
      onAllocationsChanged?.()
    } catch (error) {
      console.error('Error updating allocation:', error)
      alert('Failed to update allocation')
    }
  }

  const handleDeleteAllocation = async (allocationId: string, stateName: string) => {
    if (!confirm(`Delete allocation for ${stateName}?`)) return

    try {
      const response = await fetch(`/api/cycles/${cycle.id}/allocations/${allocationId}`, {
        method: 'DELETE',
      })

      if (!response.ok) throw new Error('Failed to delete allocation')
      fetchData()
      onAllocationsChanged?.()
    } catch (error) {
      console.error('Error deleting allocation:', error)
      alert('Failed to delete allocation')
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

  const formatDate = (date: string | null) => {
    if (!date) return '—'
    return new Date(date).toLocaleDateString()
  }

  const getTotalIncluded = () => {
    return includedGrants.reduce((sum, inclusion) => sum + inclusion.amount_included, 0)
  }

  const getTotalAllocated = () => {
    return allocations.reduce((sum, alloc) => sum + alloc.amount, 0)
  }

  const getTotalCommitted = () => {
    return allocations.reduce((sum, alloc) => sum + (alloc.total_committed || 0), 0)
  }

  return (
    <>
      <TableRow 
        className={cn(
          "cursor-pointer hover:bg-muted/50",
          isExpanded && "bg-muted/30"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <TableCell className="w-[50px]">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </TableCell>
        <TableCell>
          <div>
            <div className="font-medium">{cycle.name}</div>
            <div className="text-sm text-muted-foreground">
              Cycle #{cycle.cycle_number}
            </div>
          </div>
        </TableCell>
        <TableCell>{cycle.year}</TableCell>
        <TableCell>
          {grantName ? (
            <span className="font-medium">{grantName}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell>
          {cycle.start_date && cycle.end_date ? (
            <div className="text-sm">
              {formatDate(cycle.start_date)} to {formatDate(cycle.end_date)}
            </div>
          ) : (
            <span className="text-muted-foreground">No dates set</span>
          )}
        </TableCell>
        <TableCell>
          {isRefreshingBudget ? (
            <span className="text-muted-foreground">Loading...</span>
          ) : localBudgetSummary ? (
            formatCurrency(localBudgetSummary.total_available)
          ) : (
            '—'
          )}
        </TableCell>
        <TableCell>
          {isRefreshingBudget ? (
            <span className="text-muted-foreground">Loading...</span>
          ) : localBudgetSummary ? (
            formatCurrency(localBudgetSummary.remaining)
          ) : (
            '—'
          )}
        </TableCell>
      </TableRow>

      {isExpanded && (
        <>
          {/* Distribution Decision Summary Row */}
          <TableRow className="bg-blue-50/50">
            <TableCell></TableCell>
            <TableCell colSpan={7}>
              <div 
                className="flex items-center justify-between py-2 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsGrantBudgetExpanded(!isGrantBudgetExpanded)
                }}
              >
                <div className="flex items-center gap-2">
                  {isGrantBudgetExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <Building2 className="h-4 w-4" />
                  <span className="font-semibold">Distribution Decision Summary</span>
                </div>
                <div className="flex items-center gap-2">
                  {localBudgetSummary && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        fetchBudgetSummary()
                      }}
                      disabled={isRefreshingBudget}
                    >
                      <RefreshCw className={cn("h-4 w-4", isRefreshingBudget && "animate-spin")} />
                    </Button>
                  )}
                  {includedGrants.length === 0 && (
                    <Dialog open={isAddGrantOpen} onOpenChange={setIsAddGrantOpen}>
                      <DialogTrigger asChild>
                        <Button 
                          size="sm" 
                          className="bg-[#007229] hover:bg-[#007229]/90 text-white"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Grant
                        </Button>
                      </DialogTrigger>
                      <DialogContent onClick={(e) => e.stopPropagation()}>
                        <DialogHeader>
                          <DialogTitle>Add Grant to Cycle</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <label className="text-sm font-medium">Select Grant</label>
                            <Select value={selectedGrant} onValueChange={setSelectedGrant}>
                              <SelectTrigger>
                                <SelectValue placeholder="Choose grant" />
                              </SelectTrigger>
                              <SelectContent>
                                {availableGrants
                                  .filter(g => !includedGrants.some(inc => inc.grant_calls?.id === g.id))
                                  .map((grant) => (
                                  <SelectItem key={grant.id} value={grant.id}>
                                    <div>
                                      <div className="font-medium">{grant.name}</div>
                                      <div className="text-sm text-muted-foreground">
                                        {grant.donor.name} - {formatCurrency(grant.amount || 0)}
                                      </div>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <label className="text-sm font-medium">Amount to Include</label>
                            <Input
                              type="number"
                              value={amountIncluded}
                              onChange={(e) => setAmountIncluded(e.target.value)}
                              placeholder="Enter amount"
                            />
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setIsAddGrantOpen(false)}>
                              Cancel
                            </Button>
                            <Button 
                              onClick={handleAddGrant}
                              disabled={!selectedGrant || !amountIncluded}
                              className="bg-[#007229] hover:bg-[#007229]/90 text-white"
                            >
                              Add
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>
              
              {isGrantBudgetExpanded && (
                <div className="pl-6 mt-2">
                  {includedGrants.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-2">No grants added</div>
                  ) : (
                    <div className="flex items-center gap-8 py-2">
                      {/* Grant Info */}
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="font-medium">{includedGrants[0]?.grant_calls?.name || 'Unknown'}</div>
                          <div className="text-sm text-muted-foreground">
                            {includedGrants[0]?.grant_calls?.donor?.name} • {formatCurrency(includedGrants[0]?.amount_included || 0)}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRemoveGrant(includedGrants[0]?.grant_calls?.id || '')
                          }}
                          className="h-8 w-8 text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      {/* Budget Summary */}
                      {localBudgetSummary && (
                        <div className="flex items-center gap-6">
                          <div>
                            <div className="text-xs text-muted-foreground">Total Available</div>
                            <div className="font-semibold">{formatCurrency(localBudgetSummary.total_available)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Total Allocated</div>
                            <div className="font-semibold">{formatCurrency(localBudgetSummary.total_allocated)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Committed</div>
                            <div className="font-semibold text-green-600">{formatCurrency(localBudgetSummary.total_committed)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Pending</div>
                            <div className="font-semibold text-orange-600">{formatCurrency(localBudgetSummary.total_pending)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Remaining</div>
                            <div className={cn(
                              "font-semibold",
                              localBudgetSummary.remaining >= 0 ? "text-green-600" : "text-red-600"
                            )}>
                              {formatCurrency(localBudgetSummary.remaining)}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </TableCell>
          </TableRow>

          {/* State Allocations Row */}
          <TableRow className="bg-purple-50/50">
            <TableCell></TableCell>
            <TableCell colSpan={7}>
              <div 
                className="flex items-center justify-between py-2 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsStatesExpanded(!isStatesExpanded)
                }}
              >
                <div className="flex items-center gap-2">
                  {isStatesExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <MapPin className="h-4 w-4" />
                  <span className="font-semibold">State Allocations</span>
                  <Badge variant="outline">
                    {allocations.length} states • {formatCurrency(getTotalAllocated())}
                  </Badge>
                </div>
                <Dialog open={isAddStateOpen} onOpenChange={setIsAddStateOpen}>
                  <DialogTrigger asChild>
                    <Button 
                      size="sm" 
                      className="bg-[#007229] hover:bg-[#007229]/90 text-white"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add State
                    </Button>
                  </DialogTrigger>
                  <DialogContent onClick={(e) => e.stopPropagation()}>
                    <DialogHeader>
                      <DialogTitle>Add State Allocation</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      {newAllocations.map((alloc, idx) => (
                        <div key={idx} className="flex gap-2">
                          <Select
                            value={alloc.state_name}
                            onValueChange={(value) => {
                              setNewAllocations(prev => prev.map((a, i) => 
                                i === idx ? { ...a, state_name: value } : a
                              ))
                            }}
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
                          <Input
                            type="number"
                            placeholder="Amount"
                            value={alloc.amount}
                            onChange={(e) => {
                              setNewAllocations(prev => prev.map((a, i) => 
                                i === idx ? { ...a, amount: e.target.value } : a
                              ))
                            }}
                            className="w-32"
                          />
                        </div>
                      ))}
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={handleAddState}>
                          Add Another
                        </Button>
                        <Button variant="outline" onClick={() => {
                          setIsAddStateOpen(false)
                          setNewAllocations([])
                        }}>
                          Cancel
                        </Button>
                        <Button 
                          onClick={handleSaveAllocations}
                          className="bg-[#007229] hover:bg-[#007229]/90 text-white"
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              
              {isStatesExpanded && (
                <div className="pl-6 mt-2">
                  {allocations.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-2">No state allocations</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>State</TableHead>
                            <TableHead className="text-right">Allocated</TableHead>
                            <TableHead className="text-right">Committed</TableHead>
                            <TableHead className="text-right">Remaining</TableHead>
                            <TableHead className="w-[100px]">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {allocations.map((allocation) => (
                            <TableRow key={allocation.id}>
                              <TableCell className="font-medium">{allocation.state_name}</TableCell>
                              <TableCell className="text-right">{formatCurrency(allocation.amount)}</TableCell>
                              <TableCell className="text-right text-green-600">
                                {formatCurrency(allocation.total_committed || 0)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(allocation.remaining || allocation.amount)}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {editingAllocation === allocation.id ? (
                                    <>
                                      <Input
                                        type="number"
                                        value={editAmount}
                                        onChange={(e) => setEditAmount(e.target.value)}
                                        className="w-24"
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                      <Button 
                                        size="sm" 
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleSaveEdit()
                                        }}
                                      >
                                        Save
                                      </Button>
                                      <Button 
                                        size="sm" 
                                        variant="outline" 
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setEditingAllocation(null)
                                        }}
                                      >
                                        Cancel
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleEditAllocation(allocation.id, allocation.amount)
                                        }}
                                        className="h-8 w-8"
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleDeleteAllocation(allocation.id, allocation.state_name)
                                        }}
                                        className="h-8 w-8 text-destructive"
                                      >
                                        <Trash2 className="h-4 w-4" />
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
                  )}
                </div>
              )}
            </TableCell>
          </TableRow>
        </>
      )}
    </>
  )
}

