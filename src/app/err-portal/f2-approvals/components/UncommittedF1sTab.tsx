'use client'

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
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
import { Edit2, Save, X, ArrowRightLeft, Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import ProjectEditor from './ProjectEditor'
import type { UncommittedF1, GrantCallOption } from '../types'

export default function UncommittedF1sTab() {
  const { t, i18n } = useTranslation(['f2', 'common'])
  const [f1s, setF1s] = useState<UncommittedF1[]>([])
  const [grantCalls, setGrantCalls] = useState<GrantCallOption[]>([])
  const [selectedF1s, setSelectedF1s] = useState<string[]>([])
  const [editingExpenses, setEditingExpenses] = useState<Record<string, boolean>>({})
  const [editingGrantCall, setEditingGrantCall] = useState<Record<string, boolean>>({})
  const [tempExpenses, setTempExpenses] = useState<Record<string, Array<{ activity: string; total_cost: number }>>>({})
  const [tempGrantCall, setTempGrantCall] = useState<Record<string, string>>({})
  const [tempFundingCycle, setTempFundingCycle] = useState<Record<string, string>>({})
  const [tempMMYY, setTempMMYY] = useState<Record<string, string>>({})
  const [tempGrantSerial, setTempGrantSerial] = useState<Record<string, string>>({})
  const [fundingCycles, setFundingCycles] = useState<any[]>([])
  const [grantCallsForCycle, setGrantCallsForCycle] = useState<Record<string, any[]>>({})
  const [donors, setDonors] = useState<any[]>([])
  const [grantSerials, setGrantSerials] = useState<any[]>([])
  const [stateShorts, setStateShorts] = useState<Record<string, string>>({})
  const [lastWorkplanNums, setLastWorkplanNums] = useState<Record<string, number>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isCommitting, setIsCommitting] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorProjectId, setEditorProjectId] = useState<string | null>(null)
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [assigningF1Id, setAssigningF1Id] = useState<string | null>(null)

  useEffect(() => {
    fetchUncommittedF1s()
    fetchGrantCalls()
    fetchFundingCycles()
    fetchDonors()
  }, [])

  useEffect(() => {
    if (f1s.length > 0) {
      fetchStateShorts()
    }
  }, [f1s])

  useEffect(() => {
    // When grant serial changes, fetch last workplan number for it
    const fetchLastWorkplanNum = async () => {
      const f1 = f1s.find(f => f.id === assigningF1Id)
      if (!f1 || !tempGrantSerial[f1.id] || tempGrantSerial[f1.id] === 'new') {
        return
      }

      try {
        const { data } = await supabase
          .from('grant_workplan_seq')
          .select('last_workplan_number')
          .eq('grant_serial', tempGrantSerial[f1.id])
          .single()

        if (data) {
          setLastWorkplanNums(prev => ({
            ...prev,
            [f1.id]: data.last_workplan_number
          }))
        } else {
          // No sequence found, default to 0
          setLastWorkplanNums(prev => ({
            ...prev,
            [f1.id]: 0
          }))
        }
      } catch (error) {
        console.error('Error fetching last workplan number:', error)
        setLastWorkplanNums(prev => ({
          ...prev,
          [f1.id]: 0
        }))
      }
    }

    if (assigningF1Id) {
      fetchLastWorkplanNum()
    }
  }, [tempGrantSerial, assigningF1Id, f1s])

  const fetchStateShorts = async () => {
    try {
      const states = [...new Set(f1s.map(f => f.state).filter(Boolean))]
      const { data } = await supabase
        .from('states')
        .select('state_name, state_short')
        .in('state_name', states)
      
      const shorts: Record<string, string> = {}
      ;(data || []).forEach((row: any) => {
        shorts[row.state_name] = row.state_short
      })
      setStateShorts(shorts)
    } catch (error) {
      console.error('Error fetching state shorts:', error)
    }
  }

  const fetchFundingCycles = async () => {
    try {
      const { data } = await supabase
        .from('funding_cycles')
        .select('id, name, type, status')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
      setFundingCycles(data || [])
    } catch (error) {
      console.error('Error fetching funding cycles:', error)
    }
  }

  const fetchDonors = async () => {
    try {
      const { data } = await supabase
        .from('donors')
        .select('id, name, short_name')
        .order('name')
      setDonors(data || [])
    } catch (error) {
      console.error('Error fetching donors:', error)
    }
  }

  const fetchGrantCallsForCycle = async (cycleId: string) => {
    try {
      const { data } = await supabase
        .from('cycle_grant_inclusions')
        .select(`
          grant_call_id,
          grant_calls (
            id,
            name,
            donor_id,
            donors (
              id,
              name,
              short_name
            )
          )
        `)
        .eq('cycle_id', cycleId)
      
      const grantCalls = (data || []).map((item: any) => ({
        id: item.grant_call_id,
        name: item.grant_calls?.name || '',
        donor_id: item.grant_calls?.donor_id || '',
        donor_name: item.grant_calls?.donors?.name || '',
        donor_short: item.grant_calls?.donors?.short_name || ''
      }))
      
      setGrantCallsForCycle(prev => ({ ...prev, [cycleId]: grantCalls }))
    } catch (error) {
      console.error('Error fetching grant calls for cycle:', error)
    }
  }

  const fetchGrantSerials = async (grantCallId: string, stateName: string, mmyy: string) => {
    try {
      const { data } = await supabase
        .from('grant_serials')
        .select('grant_serial')
        .eq('grant_call_id', grantCallId)
        .eq('state_name', stateName)
        .eq('yymm', mmyy)
      setGrantSerials(data || [])
    } catch (error) {
      console.error('Error fetching grant serials:', error)
    }
  }

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

  // Load grant serials when MMYY changes
  useEffect(() => {
    Object.entries(tempMMYY).forEach(([f1Id, mmyy]) => {
      const f1 = f1s.find(f => f.id === f1Id)
      if (f1 && tempGrantCall[f1Id] && mmyy && mmyy.length === 4) {
        fetchGrantSerials(tempGrantCall[f1Id], f1.state, mmyy)
      }
    })
  }, [tempMMYY, tempGrantCall])

  const calculateTotalAmount = (expenses: Array<{ activity: string; total_cost: number }>) => {
    return expenses.reduce((sum, exp) => sum + (exp.total_cost || 0), 0)
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      // Only select rows that have an approval file
      setSelectedF1s(f1s.filter(f1 => !!f1.approval_file_key).map(f1 => f1.id))
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

  const handleSaveMetadata = async (f1Id: string) => {
    try {
      const f1 = f1s.find(f => f.id === f1Id)
      if (!f1 || !f1.temp_file_key) {
        console.error('F1:', f1, 'temp_file_key:', f1?.temp_file_key)
        alert('No temp file found for this F1')
        return
      }
      
      console.log('Moving file from:', f1.temp_file_key)

      const fundingCycleId = tempFundingCycle[f1Id]
      const grantCallId = tempGrantCall[f1Id]
      const mmyy = tempMMYY[f1Id]
      const grantSerial = tempGrantSerial[f1Id]

      if (!fundingCycleId || !grantCallId || !mmyy || !grantSerial) {
        alert('Please fill all metadata fields (Funding Cycle, Grant Call, MMYY, and Grant Serial)')
        return
      }

      // Get grant call details to find donor
      const grantCall = grantCallsForCycle[fundingCycleId]?.find((gc: any) => gc.id === grantCallId)
      if (!grantCall) {
        alert('Grant call not found')
        return
      }

      // Get state short name
      const { data: stateData } = await supabase
        .from('states')
        .select('state_short')
        .eq('state_name', f1.state)
        .limit(1)
      
      const stateShort = stateData?.[0]?.state_short || 'XX'

      // Get cycle_state_allocation_id based on funding_cycle_id and state
      const { data: cycleAllocationData } = await supabase
        .from('cycle_state_allocations')
        .select('id')
        .eq('cycle_id', fundingCycleId)
        .eq('state_name', f1.state)
        .limit(1)
      
      const cycleStateAllocationId = cycleAllocationData?.[0]?.id || null

      // Determine grant_serial_id and workplan_number
      let grantSerialId: string | null = null
      let workplanNumber: number | null = null
      
      if (grantSerial === 'new') {
        // Creating new serial - this will be handled by the API
        grantSerialId = null
      } else {
        // Using existing serial
        grantSerialId = grantSerial
        
        // Get last workplan number and increment
        const { data: seqData } = await supabase
          .from('grant_workplan_seq')
          .select('last_workplan_number')
          .eq('grant_serial', grantSerial)
          .single()
        
        workplanNumber = seqData ? seqData.last_workplan_number + 1 : 1
        
        // Update workplan sequence
        if (seqData) {
          await supabase
            .from('grant_workplan_seq')
            .update({ last_workplan_number: workplanNumber })
            .eq('grant_serial', grantSerial)
        } else {
          await supabase
            .from('grant_workplan_seq')
            .insert({ grant_serial: grantSerial, last_workplan_number: workplanNumber })
        }
      }

      // Construct final workplan ID for filename
      const grantId = grantSerialId ? `${grantSerialId}-${String(workplanNumber).padStart(3, '0')}` : `TEMP-${f1Id}`

      // Move file from temp to final location
      const moveResponse = await fetch('/api/f2/move-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: f1Id,
          temp_file_key: f1.temp_file_key,
          donor_id: grantCall.donor_id,
          state_short: stateShort,
          mmyy: mmyy,
          grant_id: grantId
        })
      })

      if (!moveResponse.ok) {
        throw new Error('Failed to move file')
      }

      // Update F1 metadata in database
      const updateResponse = await fetch('/api/f2/uncommitted', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: f1Id,
          donor_id: grantCall.donor_id,
          grant_call_id: grantCallId,
          funding_cycle_id: fundingCycleId,
          grant_serial_id: grantSerialId,
          workplan_number: workplanNumber,
          cycle_state_allocation_id: cycleStateAllocationId
        })
      })

      if (!updateResponse.ok) {
        throw new Error('Failed to update metadata')
      }

      alert('Metadata assigned and file moved successfully!')
      // Clear temp values
      setTempFundingCycle(prev => { const { [f1Id]: _, ...rest } = prev; return rest })
      setTempGrantCall(prev => { const { [f1Id]: _, ...rest } = prev; return rest })
      setTempMMYY(prev => { const { [f1Id]: _, ...rest } = prev; return rest })
      setTempGrantSerial(prev => { const { [f1Id]: _, ...rest } = prev; return rest })
      await fetchUncommittedF1s()
    } catch (error) {
      console.error('Error saving metadata:', error)
      alert('Failed to save metadata')
    }
  }

  const handleAssignMetadata = async (f1Id: string, metadata: any) => {
    try {
      const f1 = f1s.find(f => f.id === f1Id)
      if (!f1 || !f1.temp_file_key) {
        alert('No temp file found for this F1')
        return
      }

      // Get state short name
      const { data: stateData } = await supabase
        .from('states')
        .select('state_short')
        .eq('state_name', f1.state)
        .limit(1)
      
      const stateShort = stateData?.[0]?.state_short || 'XX'

      // Move file from temp to final location
      const moveResponse = await fetch('/api/f2/move-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: f1Id,
          temp_file_key: f1.temp_file_key,
          donor_id: metadata.donor_id,
          state_short: stateShort,
          mmyy: metadata.mmyy,
          grant_id: f1.grant_id || `TEMP-${f1Id}`
        })
      })

      if (!moveResponse.ok) {
        throw new Error('Failed to move file')
      }

      // Update F1 metadata in database
      const updateResponse = await fetch('/api/f2/uncommitted', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: f1Id,
          donor_id: metadata.donor_id,
          grant_call_id: metadata.grant_call_id,
          funding_cycle_id: metadata.funding_cycle_id
        })
      })

      if (!updateResponse.ok) {
        throw new Error('Failed to update metadata')
      }

      alert('Metadata assigned and file moved successfully!')
      await fetchUncommittedF1s()
    } catch (error) {
      console.error('Error assigning metadata:', error)
      alert('Failed to assign metadata')
    }
  }

  const handleCommitSelected = async () => {
    if (selectedF1s.length === 0) {
      alert('Please select F1s to commit')
      return
    }

    // Client-side guard: prevent commit if any selected item lacks approval
    const missing = selectedF1s.filter(id => !f1s.find(f => f.id === id)?.approval_file_key)
    if (missing.length > 0) {
      alert(t('f2:cannot_commit_without_approval'))
      return
    }

    setIsCommitting(true)
    try {
      const response = await fetch('/api/f2/uncommitted/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ f1_ids: selectedF1s })
      })

      if (!response.ok) {
        try {
          const err = await response.json()
          if (err?.missing_project_ids?.length) {
            alert(`${t('f2:cannot_commit_without_approval')}: ${err.missing_project_ids.length} item(s) missing.`)
          } else {
            alert('Failed to commit F1s')
          }
        } catch {
          alert('Failed to commit F1s')
        }
        return
      }

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
    return <div className="text-center py-8">{t('common:loading')}</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">{t('f2:uncommitted_header', { count: f1s.length })}</h3>
          <p className="text-sm text-muted-foreground">{t('f2:uncommitted_desc')}</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleCommitSelected}
          disabled={selectedF1s.length === 0 || isCommitting || selectedF1s.some(id => !f1s.find(f => f.id === id)?.approval_file_key)}
            className="bg-green-600 hover:bg-green-700"
          >
            {isCommitting ? t('f2:committing') : t('f2:commit_selected', { count: selectedF1s.length })}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table dir={i18n.language === 'ar' ? 'rtl' : 'ltr'}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 px-4">
                  <Checkbox
                    checked={selectedF1s.length === f1s.length && f1s.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead>{t('f2:err_id')}</TableHead>
                <TableHead>{t('f2:date') || 'Date'}</TableHead>
                <TableHead>{t('f2:state')}</TableHead>
                <TableHead>{t('f2:locality')}</TableHead>
                <TableHead className="text-right">{t('f2:requested_amount')}</TableHead>
                <TableHead>{t('f2:community_approval')}</TableHead>
                <TableHead>Assignment</TableHead>
                {/* Status column removed visually */}
              </TableRow>
            </TableHeader>
            <TableBody>
              {f1s.map((f1) => (
                <TableRow key={f1.id}>
                  <TableCell className="px-4">
                    <Checkbox
                      checked={selectedF1s.includes(f1.id)}
                      disabled={!f1.approval_file_key}
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
                  <TableCell className="text-right">
                    {editingExpenses[f1.id] ? (
                      <div className="space-y-2">
                        {tempExpenses[f1.id]?.map((expense, index) => (
                          <div key={index} className="flex gap-1">
                            <Input
                              value={expense.activity}
                              onChange={(e) => handleExpenseChange(f1.id, index, 'activity', e.target.value)}
                              placeholder={t('projects:activity') as string}
                              className="w-32"
                            />
                            <Input
                              type="number"
                              value={expense.total_cost}
                              onChange={(e) => handleExpenseChange(f1.id, index, 'total_cost', parseFloat(e.target.value) || 0)}
                              placeholder={t('projects:amount') as string}
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
                            {t('projects:add_expense')}
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
                          {t('projects:total')}: {calculateTotalAmount(tempExpenses[f1.id] || []).toLocaleString()}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium">{calculateTotalAmount(f1.expenses).toLocaleString()}</div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setEditorProjectId(f1.id); setEditorOpen(true) }}
                          title={t('projects:edit_project') as string}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {f1.approval_file_key ? (
                      <Badge variant="default">{t('f2:approval_uploaded')}</Badge>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-muted-foreground">{t('f2:approval_required')}</Badge>
                        <input
                          id={`approval-file-${f1.id}`}
                          type="file"
                          className="hidden"
                          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            try {
                              const key = `f2-approvals/${f1.id}/${Date.now()}-${file.name.replace(/\s+/g,'_')}`
                              const { error: upErr } = await supabase.storage.from('images').upload(key, file, { upsert: true })
                              if (upErr) { alert(t('f2:upload_failed')); return }
                              const resp = await fetch('/api/f2/uncommitted', {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: f1.id, approval_file_key: key })
                              })
                              if (!resp.ok) { alert(t('f2:upload_failed')); return }
                              await fetchUncommittedF1s()
                            } catch (err) {
                              console.error('Upload error', err)
                              alert(t('f2:upload_failed'))
                            }
                          }}
                        />
                        <Button size="sm" variant="outline" onClick={() => document.getElementById(`approval-file-${f1.id}`)?.click()}>
                          {t('f2:upload')}
                        </Button>
                      </div>
                    )}
                  </TableCell>
                  {/* Assignment Column */}
                  <TableCell>
                    {f1.temp_file_key ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setAssigningF1Id(f1.id)
                          setAssignModalOpen(true)
                        }}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Assign Work Plan
                      </Button>
                    ) : (
                      <Badge variant="default">Assigned</Badge>
                    )}
                  </TableCell>
                  {/* Status cell removed visually */}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <ProjectEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        projectId={editorProjectId}
        onSaved={async () => { await fetchUncommittedF1s() }}
      />

      {/* Assign Work Plan Modal */}
      <Dialog open={assignModalOpen} onOpenChange={setAssignModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assign Work Plan</DialogTitle>
          </DialogHeader>
          {assigningF1Id && (() => {
            const f1 = f1s.find(f => f.id === assigningF1Id)
            if (!f1) return null

            return (
              <div className="space-y-4 mt-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Assign funding cycle, grant call, MMYY, and grant serial for: {f1.err_id}
                  </p>
                </div>

                {/* Row 1: Funding Cycle, Grant Call, Donor */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Funding Cycle *</Label>
                    <Select 
                      value={tempFundingCycle[f1.id] || ''} 
                      onValueChange={(value) => {
                        setTempFundingCycle(prev => ({ ...prev, [f1.id]: value }))
                        fetchGrantCallsForCycle(value)
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {fundingCycles.map(fc => (
                          <SelectItem key={fc.id} value={fc.id}>{fc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Grant Call *</Label>
                    <Select 
                      value={tempGrantCall[f1.id] || ''} 
                      onValueChange={(value) => setTempGrantCall(prev => ({ ...prev, [f1.id]: value }))}
                      disabled={!tempFundingCycle[f1.id]}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {(grantCallsForCycle[tempFundingCycle[f1.id]] || []).map((gc: any) => (
                          <SelectItem key={gc.id} value={gc.id}>{gc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Donor</Label>
                    <Input
                      value={tempGrantCall[f1.id] && grantCallsForCycle[tempFundingCycle[f1.id]]?.find((gc: any) => gc.id === tempGrantCall[f1.id])?.donor_name || ''}
                      disabled
                      className="bg-muted"
                    />
                  </div>
                </div>

                {/* Row 2: MMYY and Grant Serial */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>MMYY *</Label>
                    <Input
                      value={tempMMYY[f1.id] || ''}
                      onChange={(e) => setTempMMYY(prev => ({ ...prev, [f1.id]: e.target.value.replace(/[^0-9]/g, '').slice(0, 4) }))}
                      placeholder="0825"
                      maxLength={4}
                    />
                  </div>

                  <div>
                    <Label>Grant Serial *</Label>
                    <Select 
                      value={tempGrantSerial[f1.id] || ''} 
                      onValueChange={(value) => setTempGrantSerial(prev => ({ ...prev, [f1.id]: value }))}
                      disabled={!tempGrantCall[f1.id] || !tempMMYY[f1.id]}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select or create" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">Create new serial</SelectItem>
                        {grantSerials.map(gs => (
                          <SelectItem key={gs.grant_serial} value={gs.grant_serial}>{gs.grant_serial}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Generated Serial ID Preview */}
                <div>
                  <Label>Generated Workplan Serial</Label>
                  <div className="p-3 bg-muted rounded-md font-mono text-lg">
                    {(() => {
                      const grantCall = tempGrantCall[f1.id] && grantCallsForCycle[tempFundingCycle[f1.id]]?.find((gc: any) => gc.id === tempGrantCall[f1.id])
                      const donorShort = grantCall?.donor_short
                      const stateShort = stateShorts[f1.state] || ''
                      const mmyy = tempMMYY[f1.id] || ''
                      const grantSerial = tempGrantSerial[f1.id]
                      
                      // Get the last workplan number and add 1 for the next one
                      const lastNum = lastWorkplanNums[f1.id] || 0
                      const nextWorkplanNum = String(lastNum + 1).padStart(3, '0')
                      
                      // If selecting an existing serial, use it as-is with next workplan number
                      if (grantSerial && grantSerial !== 'new' && grantSerial.includes('-')) {
                        return `${grantSerial}-${nextWorkplanNum}`
                      }
                      
                      // Otherwise, build new serial from components
                      if (donorShort && stateShort && mmyy) {
                        const serialNum = grantSerial === 'new' ? '0001' : '0001'
                        return `LCC-${donorShort}-${stateShort}-${mmyy}-${serialNum}-${nextWorkplanNum}`
                      }
                      return 'LCC-XXX-XX-XXXX-XXXX-XXX'
                    })()}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setAssignModalOpen(false)
                      setAssigningF1Id(null)
                      // Clear temp values
                      if (f1.id) {
                        setTempFundingCycle(prev => { const { [f1.id]: _, ...rest } = prev; return rest })
                        setTempGrantCall(prev => { const { [f1.id]: _, ...rest } = prev; return rest })
                        setTempMMYY(prev => { const { [f1.id]: _, ...rest } = prev; return rest })
                        setTempGrantSerial(prev => { const { [f1.id]: _, ...rest } = prev; return rest })
                      }
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={async () => {
                      await handleSaveMetadata(f1.id)
                      setAssignModalOpen(false)
                      setAssigningF1Id(null)
                    }}
                    disabled={!tempFundingCycle[f1.id] || !tempGrantCall[f1.id] || !tempMMYY[f1.id] || !tempGrantSerial[f1.id]}
                  >
                    Save & Assign
                  </Button>
                </div>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
