'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'
import { Edit2, Save, X, RotateCcw } from 'lucide-react'
import type { UncommittedF1, GrantCallOption } from '../types'

export default function UncommittedF1sTab() {
  const [f1s, setF1s] = useState<UncommittedF1[]>([])
  const [grantCalls, setGrantCalls] = useState<GrantCallOption[]>([])
  const [selectedF1s, setSelectedF1s] = useState<string[]>([])
  const [editingExpenses, setEditingExpenses] = useState<Record<string, boolean>>({})
  const [editingGrantCall, setEditingGrantCall] = useState<Record<string, boolean>>({})
  const [tempExpenses, setTempExpenses] = useState<Record<string, Array<{ activity: string; total_cost: number }>>>({})
  const [tempGrantCall, setTempGrantCall] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isCommitting, setIsCommitting] = useState(false)

  useEffect(() => {
    fetchUncommittedF1s()
    fetchGrantCalls()
  }, [])

  const fetchUncommittedF1s = async () => {
    try {
      const response = await fetch('/api/f2/uncommitted')
      if (!response.ok) throw new Error('Failed to fetch uncommitted F1s')
      const data = await response.json()
      setF1s(data)
    } catch (error) {
      console.error('Error fetching uncommitted F1s:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchGrantCalls = async () => {
    try {
      const response = await fetch('/api/f2/grant-calls')
      if (!response.ok) throw new Error('Failed to fetch grant calls')
      const data = await response.json()
      setGrantCalls(data)
    } catch (error) {
      console.error('Error fetching grant calls:', error)
    }
  }

  const calculateTotalAmount = (expenses: Array<{ activity: string; total_cost: number }>) => {
    return expenses.reduce((sum, exp) => sum + (exp.total_cost || 0), 0)
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedF1s(f1s.map(f1 => f1.id))
    } else {
      setSelectedF1s([])
    }
  }

  const handleSelectF1 = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedF1s(prev => [...prev, id])
    } else {
      setSelectedF1s(prev => prev.filter(f1Id => f1Id !== id))
    }
  }

  const handleEditExpenses = (f1Id: string) => {
    const f1 = f1s.find(f => f.id === f1Id)
    if (f1) {
      setTempExpenses(prev => ({ ...prev, [f1Id]: [...f1.expenses] }))
      setEditingExpenses(prev => ({ ...prev, [f1Id]: true }))
    }
  }

  const handleSaveExpenses = async (f1Id: string) => {
    try {
      const expenses = tempExpenses[f1Id]
      const response = await fetch('/api/f2/uncommitted', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: f1Id, expenses })
      })

      if (!response.ok) throw new Error('Failed to save expenses')

      setF1s(prev => prev.map(f1 => 
        f1.id === f1Id ? { ...f1, expenses } : f1
      ))
      setEditingExpenses(prev => ({ ...prev, [f1Id]: false }))
    } catch (error) {
      console.error('Error saving expenses:', error)
      alert('Failed to save expenses')
    }
  }

  const handleCancelEditExpenses = (f1Id: string) => {
    setEditingExpenses(prev => ({ ...prev, [f1Id]: false }))
    delete tempExpenses[f1Id]
  }

  const handleExpenseChange = (f1Id: string, index: number, field: 'activity' | 'total_cost', value: string | number) => {
    setTempExpenses(prev => ({
      ...prev,
      [f1Id]: prev[f1Id].map((exp, i) => 
        i === index ? { ...exp, [field]: value } : exp
      )
    }))
  }

  const handleAddExpense = (f1Id: string) => {
    setTempExpenses(prev => ({
      ...prev,
      [f1Id]: [...prev[f1Id], { activity: '', total_cost: 0 }]
    }))
  }

  const handleRemoveExpense = (f1Id: string, index: number) => {
    setTempExpenses(prev => ({
      ...prev,
      [f1Id]: prev[f1Id].filter((_, i) => i !== index)
    }))
  }

  const handleReassignGrantCall = async (f1Id: string) => {
    try {
      const newGrantCallId = tempGrantCall[f1Id]
      if (!newGrantCallId) return

      const response = await fetch('/api/f2/uncommitted', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: f1Id, grant_call_id: newGrantCallId })
      })

      if (!response.ok) throw new Error('Failed to reassign grant call')

      // Refresh data and update dashboard overlays
      await fetchUncommittedF1s()
      try { window.dispatchEvent(new CustomEvent('pool-refresh')) } catch {}
      try { window.dispatchEvent(new CustomEvent('f1-proposal', { detail: { state: undefined, grant_call_id: undefined, amount: 0 } })) } catch {}
      setEditingGrantCall(prev => ({ ...prev, [f1Id]: false }))
      delete tempGrantCall[f1Id]
    } catch (error) {
      console.error('Error reassigning grant call:', error)
      alert('Failed to reassign grant call')
    }
  }

  const handleCommitSelected = async () => {
    if (selectedF1s.length === 0) {
      alert('Please select F1s to commit')
      return
    }

    setIsCommitting(true)
    try {
      const response = await fetch('/api/f2/uncommitted/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ f1_ids: selectedF1s })
      })

      if (!response.ok) throw new Error('Failed to commit F1s')

      const result = await response.json()
      alert(`Successfully committed ${result.committed_count} F1(s)`)
      setSelectedF1s([])
      await fetchUncommittedF1s()
    } catch (error) {
      console.error('Error committing F1s:', error)
      alert('Failed to commit F1s')
    } finally {
      setIsCommitting(false)
    }
  }

  if (isLoading) {
    return <div className="text-center py-8">Loading uncommitted F1s...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Uncommitted F1s ({f1s.length})</h3>
          <p className="text-sm text-muted-foreground">
            Review, edit expenses, reassign grant calls, and commit F1s for final approval
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleCommitSelected}
            disabled={selectedF1s.length === 0 || isCommitting}
            className="bg-green-600 hover:bg-green-700"
          >
            {isCommitting ? 'Committing...' : `Commit Selected (${selectedF1s.length})`}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectedF1s.length === f1s.length && f1s.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead>ERR ID</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Grant Call</TableHead>
                <TableHead>Donor</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {f1s.map((f1) => (
                <TableRow key={f1.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedF1s.includes(f1.id)}
                      onCheckedChange={(checked) => handleSelectF1(f1.id, checked as boolean)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{f1.err_id}</div>
                    <div className="text-sm text-muted-foreground">{f1.err_code}</div>
                  </TableCell>
                  <TableCell>{new Date(f1.date).toLocaleDateString()}</TableCell>
                  <TableCell>{f1.state}</TableCell>
                  <TableCell>{f1.locality}</TableCell>
                  <TableCell>
                    {editingGrantCall[f1.id] ? (
                      <div className="space-y-2">
                        <Select
                          value={tempGrantCall[f1.id] || ''}
                          onValueChange={(value) => {
                            setTempGrantCall(prev => ({ ...prev, [f1.id]: value }))
                            try {
                              const amt = calculateTotalAmount(f1.expenses)
                              window.dispatchEvent(new CustomEvent('f1-proposal', { detail: { state: f1.state, grant_call_id: value, amount: amt } }))
                            } catch {}
                          }}
                        >
                          <SelectTrigger className="w-48">
                            <SelectValue placeholder="Select Grant Call" />
                          </SelectTrigger>
                          <SelectContent>
                            {grantCalls.map(gc => (
                              <SelectItem key={gc.id} value={gc.id}>
                                {gc.donor_name} — {gc.name} (Rem: {gc.remaining_amount.toLocaleString()})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            onClick={() => handleReassignGrantCall(f1.id)}
                            disabled={!tempGrantCall[f1.id]}
                          >
                            <Save className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingGrantCall(prev => ({ ...prev, [f1.id]: false }))
                              delete tempGrantCall[f1.id]
                            }}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="font-medium">{f1.grant_call_name || 'Unassigned'}</div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setTempGrantCall(prev => ({ ...prev, [f1.id]: f1.grant_call_id || '' }))
                            setEditingGrantCall(prev => ({ ...prev, [f1.id]: true }))
                          }}
                        >
                          <RotateCcw className="w-3 h-3 mr-1" />
                          Reassign
                        </Button>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{f1.donor_name || '-'}</TableCell>
                  <TableCell className="text-right">
                    {editingExpenses[f1.id] ? (
                      <div className="space-y-2">
                        {tempExpenses[f1.id]?.map((expense, index) => (
                          <div key={index} className="flex gap-1">
                            <Input
                              value={expense.activity}
                              onChange={(e) => handleExpenseChange(f1.id, index, 'activity', e.target.value)}
                              placeholder="Activity"
                              className="w-32"
                            />
                            <Input
                              type="number"
                              value={expense.total_cost}
                              onChange={(e) => handleExpenseChange(f1.id, index, 'total_cost', parseFloat(e.target.value) || 0)}
                              placeholder="Amount"
                              className="w-24"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRemoveExpense(f1.id, index)}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAddExpense(f1.id)}
                          >
                            Add Expense
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleSaveExpenses(f1.id)}
                          >
                            <Save className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCancelEditExpenses(f1.id)}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                        <div className="text-sm font-medium">
                          Total: {calculateTotalAmount(tempExpenses[f1.id] || []).toLocaleString()}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="font-medium">{calculateTotalAmount(f1.expenses).toLocaleString()}</div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditExpenses(f1.id)}
                        >
                          <Edit2 className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={f1.status === 'approved' ? 'default' : 'secondary'}>
                      {f1.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
