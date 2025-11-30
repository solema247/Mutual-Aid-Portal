'use client'

import { useState, useEffect, useRef } from 'react'
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
import { Edit2, Save, X, ArrowRightLeft, Plus, Trash2 } from 'lucide-react'
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
  const [grantSerials, setGrantSerials] = useState<Record<string, any[]>>({})
  const [stateShorts, setStateShorts] = useState<Record<string, string>>({})
  const [lastWorkplanNums, setLastWorkplanNums] = useState<Record<string, number>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isCommitting, setIsCommitting] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorProjectId, setEditorProjectId] = useState<string | null>(null)
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [assigningF1Id, setAssigningF1Id] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingF1Id, setDeletingF1Id] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Pre-populate grant call when opening modal for reassignment
  useEffect(() => {
    if (assignModalOpen && assigningF1Id) {
      const f1 = f1s.find(f => f.id === assigningF1Id)
      if (f1?.grant_call_id && !tempGrantCall[f1.id]) {
        setTempGrantCall(prev => ({ ...prev, [f1.id]: f1.grant_call_id! }))
      }
    }
  }, [assignModalOpen, assigningF1Id, f1s])

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
        // Get all existing workplan numbers for this grant serial to find the actual highest
        const { data: existingProjects, error: projectsError } = await supabase
          .from('err_projects')
          .select('workplan_number')
          .eq('grant_serial_id', tempGrantSerial[f1.id])
          .not('workplan_number', 'is', null)

        if (projectsError) {
          console.error('Error fetching existing workplans:', projectsError)
          setLastWorkplanNums(prev => ({ ...prev, [f1.id]: 0 }))
          return
        }

        // Find the highest workplan number in use
        const existingWorkplanNumbers = (existingProjects || [])
          .map((p: any) => p.workplan_number)
          .filter((n: number) => typeof n === 'number' && n > 0)
          .sort((a: number, b: number) => b - a)

        const highestNumber = existingWorkplanNumbers.length > 0 ? existingWorkplanNumbers[0] : 0

        setLastWorkplanNums(prev => ({
          ...prev,
          [f1.id]: highestNumber
        }))
      } catch (error) {
        console.error('Error fetching last workplan number:', error)
        setLastWorkplanNums(prev => ({ ...prev, [f1.id]: 0 }))
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

  const fetchGrantSerials = async (f1Id: string, grantCallId: string, stateName: string, mmyy: string) => {
    try {
      // Show ALL grant serials for this state and MMYY combination (regardless of grant call)
      // This allows users to see existing serials when reassigning to a different grant call
      const { data, error } = await supabase
        .from('grant_serials')
        .select('grant_serial, grant_call_id')
        .eq('state_name', stateName)
        .eq('yymm', mmyy)
        .order('grant_serial', { ascending: true })
      
      // Filter to only return the grant_serial field for the dropdown
      const serials = (data || []).map(s => ({ grant_serial: s.grant_serial }))
      setGrantSerials(prev => {
        const updated = { ...prev, [f1Id]: serials }
        return updated
      })
    } catch (error) {
      console.error('[fetchGrantSerials] Error fetching grant serials:', error)
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

  // Load grant serials when MMYY or grant call changes
  useEffect(() => {
    Object.entries(tempMMYY).forEach(([f1Id, mmyy]) => {
      const f1 = f1s.find(f => f.id === f1Id)
      if (f1 && tempGrantCall[f1Id] && mmyy && mmyy.length === 4) {
        fetchGrantSerials(f1Id, tempGrantCall[f1Id], f1.state, mmyy)
      }
    })
  }, [tempMMYY, tempGrantCall, f1s])

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
      const f1 = f1s.find(f => f.id === f1Id)
      if (!f1) {
        alert('Project not found')
        return
      }

      const newGrantCallId = tempGrantCall[f1Id]
      const selectedMMYY = tempMMYY[f1Id]
      const selectedGrantSerial = tempGrantSerial[f1Id]
      
      if (!newGrantCallId) {
        alert('Please select a grant call')
        return
      }
      
      if (!selectedMMYY || selectedMMYY.length !== 4) {
        alert('Please enter MMYY (e.g., 1025)')
        return
      }
      
      if (!selectedGrantSerial) {
        alert('Please select or create a grant serial')
        return
      }

      // Fetch current project data to get old grant serial and file info
      const { data: currentProject, error: fetchError } = await supabase
        .from('err_projects')
        .select('grant_serial_id, file_key, workplan_number, funding_cycle_id, cycle_state_allocation_id, state, donor_id')
        .eq('id', f1Id)
        .single()

      if (fetchError || !currentProject) {
        throw new Error('Failed to fetch current project data')
      }

      const oldGrantSerialId = currentProject.grant_serial_id
      const oldFileKey = currentProject.file_key
      const oldWorkplanNumber = currentProject.workplan_number

      // Decrement workplan sequence for old grant serial
      if (oldGrantSerialId && oldWorkplanNumber) {
        const { data: oldSeqData } = await supabase
          .from('grant_workplan_seq')
          .select('last_workplan_number')
          .eq('grant_serial', oldGrantSerialId)
          .single()

        if (oldSeqData && oldSeqData.last_workplan_number > 0) {
          await supabase
            .from('grant_workplan_seq')
            .update({ last_workplan_number: oldSeqData.last_workplan_number - 1 })
            .eq('grant_serial', oldGrantSerialId)
        }
      }

      // Get new grant call details
      const { data: newGrantCall, error: grantCallError } = await supabase
        .from('grant_calls')
        .select('id, name, donor_id, shortname')
        .eq('id', newGrantCallId)
        .single()

      if (grantCallError || !newGrantCall) {
        throw new Error('Failed to fetch new grant call details')
      }

      // Get donor short name
      const { data: donorData, error: donorError } = await supabase
        .from('donors')
        .select('short_name')
        .eq('id', newGrantCall.donor_id)
        .single()

      if (donorError || !donorData) {
        throw new Error('Failed to fetch donor details')
      }

      // Get state short name
      const { data: stateData, error: stateError } = await supabase
        .from('states')
        .select('state_short')
        .eq('state_name', f1.state)
        .limit(1)
        .single()

      if (stateError || !stateData) {
        throw new Error('Failed to fetch state details')
      }

      // Use MMYY from modal
      const mmyy = selectedMMYY
      
      // Use grant serial from modal (or create new if "new" was selected)
      let newGrantSerialId: string | null = null
      
      if (selectedGrantSerial === 'new') {
        // Create new grant serial
        const createResp = await fetch('/api/fsystem/grant-serials/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_call_id: newGrantCallId,
            state_name: f1.state,
            yymm: mmyy
          })
        })

        if (!createResp.ok) {
          throw new Error('Failed to create grant serial')
        }

        const created = await createResp.json()
        newGrantSerialId = created?.grant_serial || null
      } else {
        // Use selected existing grant serial
        newGrantSerialId = selectedGrantSerial
      }

      if (!newGrantSerialId) {
        throw new Error('Failed to get or create grant serial')
      }

      // Get all existing workplan numbers for this grant serial to find the next available
      const { data: existingProjects, error: projectsError } = await supabase
        .from('err_projects')
        .select('workplan_number')
        .eq('grant_serial_id', newGrantSerialId)
        .not('workplan_number', 'is', null)

      if (projectsError) {
        console.error('Error fetching existing workplans:', projectsError)
      }

      // Find the highest workplan number in use
      const existingWorkplanNumbers = (existingProjects || [])
        .map((p: any) => p.workplan_number)
        .filter((n: number) => typeof n === 'number' && n > 0)
        .sort((a: number, b: number) => b - a)

      // Get the next available workplan number
      let newWorkplanNumber = 1
      if (existingWorkplanNumbers.length > 0) {
        newWorkplanNumber = existingWorkplanNumbers[0] + 1
      }

      // Update workplan sequence to reflect the new highest number
      const { data: newSeqData } = await supabase
        .from('grant_workplan_seq')
        .select('last_workplan_number')
        .eq('grant_serial', newGrantSerialId)
        .single()

      if (newSeqData) {
        // Update if the new number is higher than what's in the sequence table
        if (newWorkplanNumber > newSeqData.last_workplan_number) {
          await supabase
            .from('grant_workplan_seq')
            .update({ last_workplan_number: newWorkplanNumber })
            .eq('grant_serial', newGrantSerialId)
        }
      } else {
        // Create sequence entry if it doesn't exist
        await supabase
          .from('grant_workplan_seq')
          .insert({ grant_serial: newGrantSerialId, last_workplan_number: newWorkplanNumber })
      }

      // Construct new grant ID and file path
      const newGrantId = `${newGrantSerialId}-${String(newWorkplanNumber).padStart(3, '0')}`
      const ext = oldFileKey ? oldFileKey.split('.').pop() : 'pdf'
      const newFileKey = `f1-forms/${donorData.short_name}/${stateData.state_short}/${mmyy}/${newGrantId}.${ext}`

      // Move file from old location to new location
      if (oldFileKey && oldFileKey !== newFileKey) {
        const { error: moveError } = await supabase.storage
          .from('images')
          .move(oldFileKey, newFileKey)

        if (moveError) {
          console.error('Move failed, trying copy:', moveError)
          // Fallback: copy then remove
          const { error: copyErr } = await supabase.storage.from('images').copy(oldFileKey, newFileKey)
          if (copyErr) {
            throw new Error(`Failed to move file: ${copyErr.message}`)
          }
          const { error: rmErr } = await supabase.storage.from('images').remove([oldFileKey])
          if (rmErr) {
            console.warn('Failed to remove old file:', rmErr)
          }
        }
      }

      // Update project metadata
      const updateResponse = await fetch('/api/f2/uncommitted', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: f1Id,
          grant_call_id: newGrantCallId,
          donor_id: newGrantCall.donor_id,
          grant_serial_id: newGrantSerialId,
          workplan_number: newWorkplanNumber,
          grant_id: newGrantId,
          file_key: newFileKey
        })
      })

      if (!updateResponse.ok) {
        throw new Error('Failed to update project metadata')
      }

      alert('Project reassigned successfully!')
      
      // Refresh data and update dashboard overlays
      await fetchUncommittedF1s()
      try { window.dispatchEvent(new CustomEvent('pool-refresh')) } catch {}
      try { window.dispatchEvent(new CustomEvent('f1-proposal', { detail: { state: undefined, grant_call_id: undefined, amount: 0 } })) } catch {}
      setEditingGrantCall(prev => ({ ...prev, [f1Id]: false }))
      delete tempGrantCall[f1Id]
    } catch (error) {
      console.error('Error reassigning grant call:', error)
      alert(`Failed to reassign grant call: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleSaveMetadata = async (f1Id: string) => {
    try {
      const f1 = f1s.find(f => f.id === f1Id)
      if (!f1) {
        alert('F1 project not found')
        return
      }

      // Get metadata from form (common for both ERR App and Direct Upload)
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
        // Create a new grant serial via API
        try {
          const createResp = await fetch('/api/fsystem/grant-serials/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              funding_cycle_id: fundingCycleId,
              cycle_state_allocation_id: cycleStateAllocationId,
              grant_call_id: grantCallId,
              state_name: f1.state,
              yymm: mmyy
            })
          })
          if (!createResp.ok) throw new Error('Failed to create grant serial')
          const created = await createResp.json()
          grantSerialId = created?.grant_serial || null
        } catch (e) {
          console.error('Create serial error:', e)
          alert('Failed to create grant serial')
          return
        }
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

      // If a new serial was created above, initialize workplan number
      if (grantSerial === 'new' && grantSerialId) {
        // First workplan number for a new serial is 1
        workplanNumber = 1
        // Update the workplan sequence to reflect first use
        try {
          await supabase
            .from('grant_workplan_seq')
            .update({ last_workplan_number: workplanNumber, last_used: new Date().toISOString() })
            .eq('grant_serial', grantSerialId)
        } catch {}
      }

      // Construct final workplan ID
      const grantId = grantSerialId ? `${grantSerialId}-${String(workplanNumber).padStart(3, '0')}` : `TEMP-${f1Id}`

      // Only move file if temp_file_key exists (Direct Upload F1s)
      if (f1.temp_file_key) {
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
      }

      // Update F1 metadata in database (for both ERR App and Direct Upload)
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
          cycle_state_allocation_id: cycleStateAllocationId,
          grant_id: grantId
        })
      })

      if (!updateResponse.ok) {
        throw new Error('Failed to update metadata')
      }

      alert(f1.temp_file_key ? 'Metadata assigned and file moved successfully!' : 'Metadata assigned successfully!')
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

  const handleDeleteClick = (f1Id: string) => {
    setDeletingF1Id(f1Id)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!deletingF1Id) return

    setIsDeleting(true)
    try {
      const response = await fetch('/api/f2/uncommitted', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deletingF1Id })
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to delete F1' }))
        alert(error.error || t('f2:delete_failed'))
        return
      }

      // Remove from selected if it was selected
      setSelectedF1s(prev => prev.filter(id => id !== deletingF1Id))
      await fetchUncommittedF1s()
      setDeleteDialogOpen(false)
      setDeletingF1Id(null)
    } catch (error) {
      console.error('Error deleting F1:', error)
      alert(t('f2:delete_failed'))
    } finally {
      setIsDeleting(false)
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
                <TableHead>Assignment</TableHead>
                <TableHead>{t('f2:community_approval')}</TableHead>
                <TableHead>{t('f2:actions') || 'Actions'}</TableHead>
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
                      <div className="font-medium">{calculateTotalAmount(f1.expenses).toLocaleString()}</div>
                    )}
                  </TableCell>
                  {/* Assignment Column */}
                  <TableCell>
                    {!f1.grant_call_id ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setAssigningF1Id(f1.id)
                          setAssignModalOpen(true)
                        }}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        {t('f2:assign_work_plan_button')}
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col">
                          <div className="text-sm font-medium">{f1.grant_call_name || 'Unknown Grant Call'}</div>
                          {f1.donor_name && (
                            <div className="text-xs text-muted-foreground">{f1.donor_name}</div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setAssigningF1Id(f1.id)
                            setAssignModalOpen(true)
                            // Pre-populate with current values
                            const f1Data = f1s.find(f => f.id === f1.id)
                            if (f1Data?.grant_call_id) {
                              setTempGrantCall(prev => ({ ...prev, [f1.id]: f1Data.grant_call_id! }))
                            }
                          }}
                          className="ml-auto"
                        >
                          <Edit2 className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                  {/* Community Approval - only after assignment */}
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
                              // Build final path mirroring F1 storage logic, but under f2-approvals
                              // Expect grant_id like: LCC-DKH-WK-1025-0001-002
                              const grantId: string | undefined = (f1 as any).grant_id || (f1 as any).grant_serial_id && (f1 as any).workplan_number ? `${(f1 as any).grant_serial_id}-${String((f1 as any).workplan_number).padStart(3,'0')}` : undefined
                              let key = `f2-approvals/${f1.id}/${Date.now()}-${file.name.replace(/\s+/g,'_')}`
                              if (grantId) {
                                const m = /^LCC-([A-Z0-9]+)-([A-Z]+)-(\d{4})-/.exec(grantId)
                                if (m) {
                                  const donorShort = m[1]
                                  const stateShort = m[2]
                                  const mmyy = m[3]
                                  const ext = (file.name.split('.').pop() || 'pdf').toLowerCase()
                                  key = `f2-approvals/${donorShort}/${stateShort}/${mmyy}/${grantId}-approval.${ext}`
                                }
                              }
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
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => document.getElementById(`approval-file-${f1.id}`)?.click()}
                          disabled={!!f1.temp_file_key}
                          title={f1.temp_file_key ? t('f2:assign_work_plan') : undefined}
                        >
                          {t('f2:upload')}
                        </Button>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setEditorProjectId(f1.id); setEditorOpen(true) }}
                        title={t('projects:edit_project') as string}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeleteClick(f1.id)}
                        title={t('f2:delete_project') as string}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
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
            <DialogTitle>
              {assigningF1Id && f1s.find(f => f.id === assigningF1Id)?.grant_call_id 
                ? t('f2:reassign_work_plan') || 'Reassign Work Plan'
                : t('f2:assign_work_plan')}
            </DialogTitle>
          </DialogHeader>
          {assigningF1Id && (() => {
            const f1 = f1s.find(f => f.id === assigningF1Id)
            if (!f1) return null

            return (
              <div className="space-y-4 mt-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-4">
                    {f1.grant_call_id 
                      ? `Reassign work plan ${f1.err_id} to a different grant call`
                      : `${t('f2:assign_metadata_description')} ${f1.err_id}`}
                  </p>
                  {f1.grant_call_id && f1.grant_call_name && (
                    <div className="mb-4 p-3 bg-muted rounded-md">
                      <p className="text-sm font-medium">Current Assignment:</p>
                      <p className="text-sm">{f1.grant_call_name}</p>
                      {f1.donor_name && (
                        <p className="text-xs text-muted-foreground">{f1.donor_name}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Row 1: Funding Cycle, Grant Call, Donor */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>{t('f2:funding_cycle')} *</Label>
                    <Select 
                      value={tempFundingCycle[f1.id] || ''} 
                      onValueChange={(value) => {
                        setTempFundingCycle(prev => ({ ...prev, [f1.id]: value }))
                        fetchGrantCallsForCycle(value)
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t('f2:select')} />
                      </SelectTrigger>
                      <SelectContent>
                        {fundingCycles.map(fc => (
                          <SelectItem key={fc.id} value={fc.id}>{fc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>{t('f2:grant_call')} *</Label>
                    <Select 
                      value={tempGrantCall[f1.id] || ''} 
                      onValueChange={(value) => {
                        setTempGrantCall(prev => ({ ...prev, [f1.id]: value }))
                        // Clear grant serial and grant serials when grant call changes
                        setTempGrantSerial(prev => ({ ...prev, [f1.id]: '' }))
                        setGrantSerials(prev => ({ ...prev, [f1.id]: [] }))
                        setLastWorkplanNums(prev => ({ ...prev, [f1.id]: 0 }))
                        // Load grant serials if MMYY is already set
                        if (value && tempMMYY[f1.id] && tempMMYY[f1.id].length === 4) {
                          fetchGrantSerials(f1.id, value, f1.state, tempMMYY[f1.id])
                        }
                      }}
                      disabled={!tempFundingCycle[f1.id]}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t('f2:select')} />
                      </SelectTrigger>
                      <SelectContent>
                        {(grantCallsForCycle[tempFundingCycle[f1.id]] || []).map((gc: any) => (
                          <SelectItem key={gc.id} value={gc.id}>{gc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>{t('f2:donor')}</Label>
                    <Input
                      value={tempGrantCall[f1.id] && grantCallsForCycle[tempFundingCycle[f1.id]]?.find((gc: any) => gc.id === tempGrantCall[f1.id])?.donor_name || ''}
                      disabled
                      className="bg-muted w-full"
                    />
                  </div>
                </div>

                {/* Row 2: MMYY and Grant Serial */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('f2:mmyy')} *</Label>
                    <Input
                      value={tempMMYY[f1.id] || ''}
                      onChange={(e) => {
                        const newMMYY = e.target.value.replace(/[^0-9]/g, '').slice(0, 4)
                        setTempMMYY(prev => ({ ...prev, [f1.id]: newMMYY }))
                        // Clear grant serial and grant serials when MMYY changes
                        if (newMMYY.length !== 4) {
                          setTempGrantSerial(prev => ({ ...prev, [f1.id]: '' }))
                          setGrantSerials(prev => ({ ...prev, [f1.id]: [] }))
                          setLastWorkplanNums(prev => ({ ...prev, [f1.id]: 0 }))
                        }
                        // Load grant serials when MMYY is complete and grant call is selected
                        if (newMMYY.length === 4 && tempGrantCall[f1.id]) {
                          fetchGrantSerials(f1.id, tempGrantCall[f1.id], f1.state, newMMYY)
                        }
                      }}
                      placeholder="0825"
                      maxLength={4}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <Label>{t('f2:grant_serial')} *</Label>
                    <Select 
                      value={tempGrantSerial[f1.id] || ''} 
                      onValueChange={(value) => {
                        setTempGrantSerial(prev => ({ ...prev, [f1.id]: value }))
                        // Clear workplan number when serial changes so it recalculates
                        if (value === 'new') {
                          setLastWorkplanNums(prev => ({ ...prev, [f1.id]: 0 }))
                        }
                      }}
                      disabled={!tempGrantCall[f1.id] || !tempMMYY[f1.id]}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t('f2:select_or_create')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">{t('f2:create_new_serial')}</SelectItem>
                        {(() => {
                          const serials = grantSerials[f1.id] || []
                          return serials.map(gs => (
                            <SelectItem key={gs.grant_serial} value={gs.grant_serial}>{gs.grant_serial}</SelectItem>
                          ))
                        })()}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Generated Serial ID Preview */}
                <div>
                  <Label>{t('f2:generated_workplan_serial')}</Label>
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
                      
                      // Otherwise, build new serial from components (for new serial)
                      if (grantSerial === 'new' && donorShort && stateShort && mmyy) {
                        // For new serial, first workplan is always 001
                        const serialNum = '0001'
                        return `LCC-${donorShort}-${stateShort}-${mmyy}-${serialNum}-001`
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
                    {t('common:cancel')}
                  </Button>
                  <Button
                    onClick={async () => {
                      // If already assigned and grant call changed, use reassignment
                      if (f1.grant_call_id && tempGrantCall[f1.id] && tempGrantCall[f1.id] !== f1.grant_call_id) {
                        await handleReassignGrantCall(f1.id)
                      } else {
                        await handleSaveMetadata(f1.id)
                      }
                      setAssignModalOpen(false)
                      setAssigningF1Id(null)
                    }}
                    disabled={!tempGrantCall[f1.id] || !tempMMYY[f1.id] || !tempGrantSerial[f1.id] || !tempFundingCycle[f1.id]}
                  >
                    {t('f2:save_assign')}
                  </Button>
                </div>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('f2:delete_project') || 'Delete Project'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('f2:delete_confirmation') || 'Are you sure you want to delete this F1 project submission? This action cannot be undone.'}
            </p>
            {deletingF1Id && (() => {
              const f1 = f1s.find(f => f.id === deletingF1Id)
              if (!f1) return null
              return (
                <div className="p-3 bg-muted rounded-md">
                  <div className="font-medium">{f1.err_id}</div>
                  <div className="text-sm text-muted-foreground">
                    {f1.state} - {f1.locality}
                  </div>
                </div>
              )
            })()}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteDialogOpen(false)
                  setDeletingF1Id(null)
                }}
                disabled={isDeleting}
              >
                {t('common:cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
              >
                {isDeleting ? t('f2:deleting') || 'Deleting...' : t('f2:delete') || 'Delete'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
