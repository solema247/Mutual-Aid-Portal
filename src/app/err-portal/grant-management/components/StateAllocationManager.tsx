'use client'

import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Save, Trash2, MapPin, Pencil, X } from 'lucide-react'
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
  cycle?: { tranche_count?: number | null }
  refreshToken?: number
  onAllocationsChanged?: () => void
}

export default function StateAllocationManager({ cycleId, cycle, refreshToken, onAllocationsChanged }: StateAllocationManagerProps) {
  const { t } = useTranslation(['err', 'common'])
  const [states, setStates] = useState<State[]>([])
  const [allocations, setAllocations] = useState<CycleStateAllocation[]>([])
  const [activeTranche, setActiveTranche] = useState<number>(1)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSavingSplits, setIsSavingSplits] = useState(false)
  const [newAllocations, setNewAllocations] = useState<{ state_name: string; amount: string }[]>([])
  const [editingAllocation, setEditingAllocation] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState<string>('')

  useEffect(() => {
    fetchData()
  }, [cycleId, refreshToken])

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
      // Default to tranche 1 if tranche_count set; else latest tranche if any; else 1
      const maxDecision = allocationsData.reduce((m: number, a: any) => Math.max(m, a.decision_no || 0), 0)
      if (cycle?.tranche_count && cycle.tranche_count > 0) {
        setActiveTranche(1)
      } else {
        setActiveTranche(maxDecision || 1)
      }
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
        amount: Number(alloc.amount),
        decision_no: activeTranche // Force allocation to current active tranche
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
      onAllocationsChanged?.() // Notify parent that allocations changed
    } catch (error) {
      console.error('Error saving allocations:', error)
      alert('Failed to save allocations')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEditAllocation = (allocationId: string, currentAmount: number) => {
    setEditingAllocation(allocationId)
    setEditAmount(currentAmount.toString())
  }

  const handleSaveEdit = async () => {
    if (!editingAllocation || !editAmount || Number(editAmount) <= 0) return

    try {
      setIsSubmitting(true)

      const response = await fetch(`/api/cycles/${cycleId}/allocations/${editingAllocation}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount: Number(editAmount) }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update allocation')
      }

      setEditingAllocation(null)
      setEditAmount('')
      fetchData()
      onAllocationsChanged?.() // Notify parent that allocations changed
    } catch (error) {
      console.error('Error updating allocation:', error)
      alert(error instanceof Error ? error.message : 'Failed to update allocation')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancelEdit = () => {
    setEditingAllocation(null)
    setEditAmount('')
  }

  const handleDeleteAllocation = async (allocationId: string, stateName: string) => {
    if (!confirm(`Are you sure you want to delete the allocation for ${stateName}?`)) {
      return
    }

    try {
      setIsSubmitting(true)

      const response = await fetch(`/api/cycles/${cycleId}/allocations/${allocationId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete allocation')
      }

      fetchData()
      onAllocationsChanged?.() // Notify parent that allocations changed
    } catch (error) {
      console.error('Error deleting allocation:', error)
      alert(error instanceof Error ? error.message : 'Failed to delete allocation')
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

  const filteredAllocations = () => {
    return allocations.filter(a => a.decision_no === activeTranche)
  }

  const getAllAllocations = () => {
    return allocations
  }

  const getTotalAllocated = () => {
    return filteredAllocations().reduce((sum, alloc) => sum + alloc.amount, 0)
  }

  const getTotalCommitted = () => {
    return filteredAllocations().reduce((sum, alloc) => sum + (alloc.total_committed || 0), 0)
  }

  const getTotalPending = () => {
    return filteredAllocations().reduce((sum, alloc) => sum + (alloc.total_pending || 0), 0)
  }

  const getTrancheAllocations = (trancheNum: number) => {
    return allocations.filter(a => a.decision_no === trancheNum)
  }

  const getTrancheTotal = (trancheNum: number) => {
    return getTrancheAllocations(trancheNum).reduce((sum, alloc) => sum + alloc.amount, 0)
  }

  // Get cycle pool amount from grant inclusions
  const [cyclePoolAmount, setCyclePoolAmount] = useState(0)

  useEffect(() => {
    const fetchCyclePool = async () => {
      try {
        const response = await fetch(`/api/cycles/${cycleId}`)
        if (response.ok) {
          const cycleData = await response.json()
          const totalPool = cycleData.cycle_grant_inclusions?.reduce((sum: number, inclusion: any) => 
            sum + (Number(inclusion.amount_included) || 0), 0) || 0
          setCyclePoolAmount(totalPool)
        }
      } catch (error) {
        console.error('Error fetching cycle pool:', error)
      }
    }
    fetchCyclePool()
  }, [cycleId, refreshToken])

  // Tranche management via API (cycle_tranches)
  const [tranches, setTranches] = useState<Array<{ tranche_no: number; planned_cap: number; status: 'open' | 'closed' }>>([])
  const trancheCount = tranches.length > 0 ? tranches.length : (cycle?.tranche_count && cycle.tranche_count > 0 ? cycle.tranche_count : 1)
  const [trancheSplits, setTrancheSplits] = useState<number[]>([])

  const loadTranches = async () => {
    try {
      const res = await fetch(`/api/cycles/${cycleId}/tranches`)
      if (!res.ok) throw new Error('Failed to load tranches')
      const data = await res.json()
      const normalized = (data || []).map((t: any) => ({
        tranche_no: Number(t.tranche_no),
        planned_cap: Number(t.planned_cap) || 0,
        status: (t.status as 'open' | 'closed') || 'closed'
      }))
      normalized.sort((a: any, b: any) => a.tranche_no - b.tranche_no)
      setTranches(normalized)
      setTrancheSplits(normalized.map(t => t.planned_cap))
      // initialize statuses and active tranche
      const statuses: {[key: number]: 'open' | 'closed'} = {}
      let currentOpen = 1
      for (const t of normalized) {
        statuses[t.tranche_no] = t.status
        if (t.status === 'open') {
          currentOpen = Math.min(currentOpen, t.tranche_no)
        }
      }
      setTrancheStatuses(statuses)
      setActiveTranche(currentOpen)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    loadTranches()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId, refreshToken])

  const handleEqualSplit = () => {
    if (trancheCount <= 0 || cyclePoolAmount <= 0) return
    const equalAmount = Math.floor(cyclePoolAmount / trancheCount)
    const splits = new Array(trancheCount).fill(equalAmount)
    // Adjust last tranche to account for rounding
    const total = splits.reduce((sum, amount) => sum + amount, 0)
    splits[trancheCount - 1] += cyclePoolAmount - total
    setTrancheSplits(splits)
  }

  const saveTrancheSplits = async () => {
    try {
      setIsSavingSplits(true)
      // Persist each tranche's planned_cap
      for (let i = 0; i < trancheSplits.length; i++) {
        const tranche_no = i + 1
        const cap = trancheSplits[i] || 0
        await fetch(`/api/cycles/${cycleId}/tranches`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tranche_no, planned_cap: cap })
        })
      }
      // Back-compat: also persist splits on funding_cycles for summary views
      await fetch(`/api/cycles/${cycleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tranche_count: trancheSplits.length, tranche_splits: trancheSplits })
      })

      // Ensure at least tranche 1 is open
      const anyOpen = Object.values(trancheStatuses || {}).some(s => s === 'open')
      if (!anyOpen && trancheSplits.length > 0) {
        await fetch(`/api/cycles/${cycleId}/tranches`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tranche_no: 1, status: 'open' })
        })
        setActiveTranche(1)
      }
      await loadTranches()
    } catch (error) {
      console.error('Error saving tranche splits:', error)
      alert('Failed to save tranche splits')
    } finally {
      setIsSavingSplits(false)
    }
  }

  const addNewTranche = async () => {
    try {
      setIsSavingSplits(true)
      
      // Calculate remaining pool not yet planned in existing tranches
      const totalPlanned = (tranches && tranches.length > 0)
        ? tranches.reduce((sum, t) => sum + (Number(t.planned_cap) || 0), 0)
        : trancheSplits.reduce((sum, n) => sum + (Number(n) || 0), 0)
      const remainingBalance = Math.max(0, cyclePoolAmount - totalPlanned)
      
      if (remainingBalance <= 0) {
        alert('No remaining balance available to create a new tranche')
        return
      }
      
      // Add new tranche with remaining unplanned pool
      const newTrancheNo = (tranches && tranches.length > 0)
        ? Math.max(...tranches.map(t => t.tranche_no)) + 1
        : trancheCount + 1
      const response = await fetch(`/api/cycles/${cycleId}/tranches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tranche_no: newTrancheNo, planned_cap: remainingBalance, status: 'closed' })
      })
      if (!response.ok) throw new Error('Failed to add new tranche')
      await loadTranches()
      alert(`Tranche ${newTrancheNo} added with ${formatCurrency(remainingBalance)}`)
    } catch (error) {
      console.error('Error adding new tranche:', error)
      alert('Failed to add new tranche')
    } finally {
      setIsSavingSplits(false)
    }
  }

  // Tranche status tracking
  const [trancheStatuses, setTrancheStatuses] = useState<{[key: number]: 'open' | 'closed'}>({})

  // Initialize tranche statuses
  useEffect(() => {
    if (cycle?.type === 'tranches' && trancheCount > 0) {
      const statuses: {[key: number]: 'open' | 'closed'} = {}
      // First tranche is always open, others start as closed
      for (let i = 1; i <= trancheCount; i++) {
        statuses[i] = i === 1 ? 'open' : 'closed'
      }
      setTrancheStatuses(statuses)
    }
  }, [cycle?.type, trancheCount])

  // Tranche completion logic
  const getCurrentTrancheStatus = () => {
    if (cycle?.type !== 'tranches' || !trancheSplits.length) return null

    // Carryover logic: current tranche cap = (sum of splits up to current)
    // minus allocations already made in previous tranches, shown as a running balance
    const cumulativeSplitUpToCurrent = trancheSplits
      .slice(0, activeTranche)
      .reduce((sum, n) => sum + (Number(n) || 0), 0)

    const allocatedInPreviousTranches = allocations
      .filter(a => a.decision_no < activeTranche)
      .reduce((sum, a) => sum + (Number(a.amount) || 0), 0)

    const effectiveCurrentCap = Math.max(0, cumulativeSplitUpToCurrent - allocatedInPreviousTranches)

    const currentTrancheAllocated = filteredAllocations().reduce((sum, alloc) => sum + (Number(alloc.amount) || 0), 0)
    const currentTrancheCommitted = filteredAllocations().reduce((sum, alloc) => sum + (Number(alloc.total_committed) || 0), 0)
    const currentTranchePending = filteredAllocations().reduce((sum, alloc) => sum + (Number(alloc.total_pending) || 0), 0)

    const isAllocated = currentTrancheAllocated >= effectiveCurrentCap && effectiveCurrentCap > 0
    const remaining = effectiveCurrentCap - currentTrancheAllocated
    const isOpen = trancheStatuses[activeTranche] === 'open'

    return {
      cap: effectiveCurrentCap,
      allocated: currentTrancheAllocated,
      committed: currentTrancheCommitted,
      pending: currentTranchePending,
      remaining,
      isAllocated,
      isOpen,
      canClose: isAllocated && isOpen
    }
  }

  const trancheStatus = getCurrentTrancheStatus()

  // Close/Open tranche functions
  const closeTranche = async (trancheNum: number) => {
    const confirmed = window.confirm(
      `Are you sure you want to close Tranche ${trancheNum}?\n\n` +
      `This will:\n` +
      `- Prevent further allocations to this tranche\n` +
      `- Open the next tranche for allocation\n` +
      `- This action cannot be easily undone\n\n` +
      `Click OK to confirm or Cancel to abort.`
    )
    
    if (!confirmed) return
    
    try {
      setIsSavingSplits(true)
      // Persist status changes
      await fetch(`/api/cycles/${cycleId}/tranches`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tranche_no: trancheNum, status: 'closed' })
      })
      if (trancheNum < trancheCount) {
        await fetch(`/api/cycles/${cycleId}/tranches`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tranche_no: trancheNum + 1, status: 'open' })
        })
      }
      await loadTranches()
      if (trancheNum < trancheCount) setActiveTranche(trancheNum + 1)
      
      alert(`Tranche ${trancheNum} closed successfully`)
    } catch (error) {
      console.error('Error closing tranche:', error)
      alert('Failed to close tranche')
    } finally {
      setIsSavingSplits(false)
    }
  }

  const openTranche = async (trancheNum: number) => {
    const confirmed = window.confirm(
      `Are you sure you want to open Tranche ${trancheNum}?\n\n` +
      `This will allow allocations to this tranche.\n\n` +
      `Click OK to confirm or Cancel to abort.`
    )
    
    if (!confirmed) return
    
    try {
      setIsSavingSplits(true)
      // Persist
      await fetch(`/api/cycles/${cycleId}/tranches`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tranche_no: trancheNum - 1, status: 'closed' })
      })
      await fetch(`/api/cycles/${cycleId}/tranches`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tranche_no: trancheNum, status: 'open' })
      })
      await loadTranches()
      setActiveTranche(trancheNum)
      
      alert(`Tranche ${trancheNum} opened successfully`)
    } catch (error) {
      console.error('Error opening tranche:', error)
      alert('Failed to open tranche')
    } finally {
      setIsSavingSplits(false)
    }
  }

  if (isLoading) {
    return <div className="text-center py-4">{t('common:loading')}</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          {t('err:cycles.alloc.title')}
        </h3>
      </div>
      {/* Cycle Pool and Tranche Allocation */}
      {cycle?.type === 'tranches' && cyclePoolAmount > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tranche Allocation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <span className="font-medium">Total Pool Amount:</span>
              <span className="text-lg font-bold">{formatCurrency(cyclePoolAmount)}</span>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Split across {trancheCount} tranches:</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleEqualSplit}>
                    Equal Split
                  </Button>
                  <Button 
                    size="sm" 
                    className="bg-[#007229] hover:bg-[#007229]/90 text-white" 
                    onClick={saveTrancheSplits} 
                    disabled={isSavingSplits}
                  >
                    {isSavingSplits ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </div>
              
              <div className="max-h-64 overflow-y-auto border rounded-lg bg-white">
                <div className="grid grid-cols-1 gap-1 p-2">
                  {Array.from({ length: trancheCount }, (_, i) => i + 1).map(trancheNum => (
                    <div key={trancheNum} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded">
                      <div className="text-sm font-medium min-w-[80px]">Tranche {trancheNum}</div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={trancheSplits[trancheNum - 1] || 0}
                          onChange={(e) => {
                            const value = parseFloat(e.target.value || '0')
                            setTrancheSplits(prev => {
                              const newSplits = [...prev]
                              newSplits[trancheNum - 1] = value
                              return newSplits
                            })
                          }}
                          className="w-24 text-right text-sm"
                        />
                        <span className="text-xs text-muted-foreground">USD</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tranche Tabs */}
      {cycle?.type === 'tranches' && (
        <div className="space-y-3">
          <div className="space-y-3">
            {/* Tranche Navigation */}
            <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
              <span className="text-sm font-medium mr-2">Active Tranche:</span>
              <div className="flex items-center gap-1">
                {(() => {
                  // Only show past tranches (closed) and the current open tranche
                  const closedTranches = Object.entries(trancheStatuses)
                    .filter(([, status]) => status === 'closed')
                    .map(([k]) => Number(k))
                  const openTranches = Object.entries(trancheStatuses)
                    .filter(([, status]) => status === 'open')
                    .map(([k]) => Number(k))
                  const currentOpen = openTranches.length > 0 ? Math.min(...openTranches) : 1
                  const toShow = [...closedTranches.filter(n => n < currentOpen), currentOpen]
                    .sort((a, b) => a - b)
                  return toShow
                })().map(trancheNum => {
                  const isOpen = trancheStatuses[trancheNum] === 'open'
                  const isActive = activeTranche === trancheNum
                  return (
                    <Button
                      key={trancheNum}
                      variant={isActive ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setActiveTranche(trancheNum)}
                      className={!isOpen && !isActive ? 'opacity-60' : ''}
                    >
                      {trancheNum}
                    </Button>
                  )
                })}
              </div>
              
              {/* Close current tranche button */}
              {trancheStatus?.canClose && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => closeTranche(activeTranche)}
                  className="ml-2"
                >
                  Close Tranche {activeTranche}
                </Button>
              )}
              
              {/* Open next tranche button */}
              {(() => {
                const nextTranche = activeTranche + 1
                const nextTrancheExists = nextTranche <= trancheCount
                const nextTrancheIsClosed = nextTrancheExists && trancheStatuses[nextTranche] === 'closed'
                
                if (nextTrancheIsClosed) {
                  return (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openTranche(nextTranche)}
                      className="ml-2"
                    >
                      Open Tranche {nextTranche}
                    </Button>
                  )
                }
                return null
              })()}
              
              <Button 
                variant="outline" 
                size="sm" 
                onClick={addNewTranche}
                disabled={isSavingSplits}
                className="ml-2"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Tranche
              </Button>
            </div>
            
            {/* Tranche Summary */}
            <div className="text-xs text-muted-foreground px-2">
              Showing Tranche {activeTranche} of {trancheCount} total tranches
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              onClick={handleAddState}
              variant="outline"
              size="sm"
              disabled={!trancheStatus?.isOpen || trancheStatus?.isAllocated}
            >
              <Plus className="h-4 w-4 mr-2" />
              {!trancheStatus?.isOpen ? 'Tranche Closed' : trancheStatus?.isAllocated ? 'Tranche Full' : t('err:cycles.alloc.add_state')}
            </Button>
            {newAllocations.length > 0 && (
              <Button
                onClick={handleSaveAllocations}
                disabled={isSubmitting}
                className="bg-[#007229] hover:bg-[#007229]/90 text-white"
                size="sm"
              >
                <Save className="h-4 w-4 mr-2" />
                {isSubmitting ? t('err:cycles.alloc.saving') : t('err:cycles.alloc.save_changes')}
              </Button>
            )}
          </div>
      </div>
      )}

      {/* Tranche Status */}
      {trancheStatus && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tranche {activeTranche} Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-sm text-muted-foreground">Cap</div>
                <div className="text-lg font-bold">{formatCurrency(trancheStatus.cap)}</div>
              </div>
              <div className="text-center">
                <div className="text-sm text-muted-foreground">Allocated</div>
                <div className="text-lg font-bold">{formatCurrency(trancheStatus.allocated)}</div>
              </div>
              <div className="text-center">
                <div className="text-sm text-muted-foreground">Committed</div>
                <div className="text-lg font-bold text-green-600">{formatCurrency(trancheStatus.committed)}</div>
              </div>
              <div className="text-center">
                <div className="text-sm text-muted-foreground">Remaining</div>
                <div className={`text-lg font-bold ${trancheStatus.remaining > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                  {formatCurrency(trancheStatus.remaining)}
                </div>
              </div>
            </div>
            
            {trancheStatus.isAllocated && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm font-medium text-green-800">
                    Tranche {activeTranche} is fully allocated
                  </span>
                </div>
                <div className="mt-2 text-sm text-green-700">
                  You can now close this tranche to open the next one.
                </div>
              </div>
            )}
            
            {!trancheStatus.isAllocated && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span className="text-sm font-medium text-blue-800">
                    {formatCurrency(trancheStatus.remaining)} remaining to allocate
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

          {/* Summary */}
          <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
            <div className="text-center">
              <div className="text-sm text-muted-foreground">{t('err:cycles.alloc.total_allocated')}</div>
              <div className="text-lg font-bold">{formatCurrency(getTotalAllocated())}</div>
            </div>
            <div className="text-center">
              <div className="text-sm text-muted-foreground">{t('err:cycles.alloc.total_committed')}</div>
              <div className="text-lg font-bold text-green-600">{formatCurrency(getTotalCommitted())}</div>
            </div>
            <div className="text-center">
              <div className="text-sm text-muted-foreground">{t('err:cycles.alloc.total_pending')}</div>
              <div className="text-lg font-bold text-orange-600">{formatCurrency(getTotalPending())}</div>
            </div>
          </div>

          {/* New Allocations */}
          {newAllocations.length > 0 && (
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground">{t('err:cycles.alloc.new_allocations')}</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('err:cycles.alloc.headers.state')}</TableHead>
                    <TableHead className="text-right">{t('err:cycles.alloc.headers.amount')}</TableHead>
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
                            <SelectValue placeholder={t('err:cycles.alloc.select_state')} />
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

          {/* Existing Allocations - Active Tranche Only */}
          {filteredAllocations().length > 0 && (
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground">{t('err:cycles.alloc.current_allocations')}</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('err:cycles.alloc.headers.state')}</TableHead>
                    <TableHead className="text-right">{t('err:cycles.alloc.headers.allocated')}</TableHead>
                    <TableHead className="text-right">{t('err:cycles.alloc.headers.committed')}</TableHead>
                    <TableHead className="text-right">{t('err:cycles.alloc.headers.pending')}</TableHead>
                    <TableHead className="text-right">{t('err:cycles.alloc.headers.remaining')}</TableHead>
                    <TableHead className="w-[100px]">{t('err:cycles.alloc.headers.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAllocations().map((allocation) => (
                    <TableRow key={allocation.id}>
                      <TableCell className="font-medium">{allocation.state_name}</TableCell>
                      <TableCell className="text-right">
                        {editingAllocation === allocation.id && trancheStatuses[activeTranche] === 'open' ? (
                          <Input
                            type="text"
                            value={editAmount}
                            onChange={(e) => {
                              const value = e.target.value.replace(/,/g, '').replace(/[^\d.]/g, '')
                              if (value === '' || !isNaN(Number(value))) {
                                setEditAmount(value)
                              }
                            }}
                            className="text-right w-24"
                            placeholder="0"
                          />
                        ) : (
                          formatCurrency(allocation.amount)
                        )}
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
                      <TableCell>
                        {trancheStatuses[activeTranche] === 'open' && (
                        <div className="flex items-center gap-1">
                          {editingAllocation === allocation.id ? (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleSaveEdit}
                                disabled={isSubmitting}
                                className="h-8 w-8 text-green-600 hover:text-green-700"
                              >
                                <Save className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleCancelEdit}
                                disabled={isSubmitting}
                                className="h-8 w-8 text-gray-600 hover:text-gray-700"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEditAllocation(allocation.id, allocation.amount)}
                                disabled={isSubmitting}
                                className="h-8 w-8 text-blue-600 hover:text-blue-700"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteAllocation(allocation.id, allocation.state_name)}
                                disabled={isSubmitting || (allocation.total_committed || 0) > 0}
                                className="h-8 w-8 text-destructive hover:text-destructive/80"
                                title={(allocation.total_committed || 0) > 0 ? t('err:cycles.alloc.cannot_delete_committed') : t('err:cycles.alloc.delete_allocation')}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
    </div>
  )
}
