'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabaseClient'

type Expense = { 
  activity: string
  total_cost: number
  category?: string | null
  planned_activity?: string | null
  planned_activity_other?: string | null
}

interface ProjectEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string | null
  onSaved?: () => void
}

export default function ProjectEditor({ open, onOpenChange, projectId, onSaved }: ProjectEditorProps) {
  const { t } = useTranslation(['projects', 'common'])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState<any>({})
  const [expenses, setExpenses] = useState<Expense[]>([])
  // Planned activities as objects with individuals, families, etc.
  const [plannedActivities, setPlannedActivities] = useState<Array<{
    activity: string
    category: string | null
    individuals: number | null
    families: number | null
    planned_activity_cost: number | null
  }>>([])
  // Display-only strings for planned activities (for backward compatibility)
  const [activities, setActivities] = useState<string[]>([])
  // Raw planned_activities objects/strings from DB so we can preserve budgets & metadata
  const [rawPlannedActivities, setRawPlannedActivities] = useState<any[]>([])
  const [availableRooms, setAvailableRooms] = useState<Array<{id: string, name: string, name_ar: string | null, err_code: string | null, state_name: string, locality: string | null}>>([])
  const [selectedStateFilter, setSelectedStateFilter] = useState<string>('')
  const [availableStates, setAvailableStates] = useState<Array<{id: string, name: string, name_ar: string | null}>>([])
  const [availablePlannedActivities, setAvailablePlannedActivities] = useState<Array<{ id: string; activity_name: string; activity_name_ar: string | null; language: string | null }>>([])
  const [sectors, setSectors] = useState<Array<{ id: string; sector_name_en: string; sector_name_ar: string | null }>>([])

  // Fetch available states for filtering rooms
  useEffect(() => {
    const fetchStates = async () => {
      if (!open) return
      try {
        const { data: statesData, error } = await supabase
          .from('states')
          .select('id, state_name, state_name_ar')
          .not('state_name', 'is', null)
          .order('state_name')

        if (error) throw error

        // Get unique states by state_name
        const stateMap = new Map<string, {id: string, name: string, name_ar: string | null}>()
        statesData?.forEach((state: any) => {
          if (!stateMap.has(state.state_name)) {
            stateMap.set(state.state_name, {
              id: state.id,
              name: state.state_name,
              name_ar: state.state_name_ar
            })
          }
        })

        setAvailableStates(Array.from(stateMap.values()))
      } catch (error) {
        console.error('Error fetching states:', error)
      }
    }

    fetchStates()
  }, [open])

  // Load planned activities for dropdown
  useEffect(() => {
    const loadPlannedActivities = async () => {
      if (!open) return
      try {
        const { data: activitiesData, error } = await supabase
          .from('planned_activities')
          .select('id, activity_name, activity_name_ar, language')
          .order('activity_name')
        
        if (error) throw error
        setAvailablePlannedActivities(activitiesData || [])
      } catch (error) {
        console.error('Error loading planned activities:', error)
      }
    }
    loadPlannedActivities()
  }, [open])

  // Load sectors for sector dropdown
  useEffect(() => {
    const loadSectors = async () => {
      if (!open) return
      try {
        const { data: sectorsData, error } = await supabase
          .from('sectors')
          .select('id, sector_name_en, sector_name_ar')
          .order('sector_name_en')
        
        if (error) throw error
        setSectors(sectorsData || [])
      } catch (error) {
        console.error('Error loading sectors:', error)
      }
    }
    loadSectors()
  }, [open])

  // Set state filter when form loads with a state
  useEffect(() => {
    if (form.state && availableStates.length > 0 && !selectedStateFilter) {
      const matchingState = availableStates.find(s => s.name === form.state)
      if (matchingState) {
        setSelectedStateFilter(matchingState.id)
      }
    }
  }, [form.state, availableStates, selectedStateFilter])

  // Fetch rooms when state filter changes
  useEffect(() => {
    const fetchRooms = async () => {
      if (!open || !selectedStateFilter) {
        setAvailableRooms([])
        return
      }

      try {
        // Get state_name from selected state
        const selectedState = availableStates.find(s => s.id === selectedStateFilter)
        if (!selectedState) return

        // Get all state IDs with the same state_name
        const { data: allStateIds, error: stateError } = await supabase
          .from('states')
          .select('id')
          .eq('state_name', selectedState.name)

        if (stateError) throw stateError
        const stateIds = (allStateIds || []).map((s: any) => s.id)

        // Fetch all active rooms with these state references
        const { data: roomsData, error: roomsError } = await supabase
          .from('emergency_rooms')
          .select(`
            id,
            name,
            name_ar,
            err_code,
            state:states!emergency_rooms_state_reference_fkey(
              state_name,
              locality
            )
          `)
          .in('state_reference', stateIds)
          .eq('status', 'active')
          .order('name')

        if (roomsError) throw roomsError

        const rooms = (roomsData || []).map((room: any) => ({
          id: room.id,
          name: room.name,
          name_ar: room.name_ar,
          err_code: room.err_code,
          state_name: room.state?.state_name || '',
          locality: room.state?.locality || null
        }))

        setAvailableRooms(rooms)
      } catch (error) {
        console.error('Error fetching rooms:', error)
        setAvailableRooms([])
      }
    }

    fetchRooms()
  }, [open, selectedStateFilter, availableStates])

  useEffect(() => {
    const load = async () => {
      if (!open || !projectId) return
      setLoading(true)
      try {
        // Load project with emergency room and state information
        const { data, error } = await supabase
          .from('err_projects')
          .select(`
            id, date, state, locality, status, language, emergency_room_id,
            project_objectives, intended_beneficiaries, estimated_beneficiaries,
            estimated_timeframe, additional_support, banking_details,
            program_officer_name, program_officer_phone,
            reporting_officer_name, reporting_officer_phone,
            finance_officer_name, finance_officer_phone,
            planned_activities, expenses,
            emergency_rooms(
              id,
              state:states!emergency_rooms_state_reference_fkey(
                state_name,
                locality
              )
            )
          `)
          .eq('id', projectId)
          .single()
        
        if (error) throw error

        // Auto-sync: Check if state/locality match the room's actual state/locality
        const emergencyRoom = Array.isArray(data.emergency_rooms) 
          ? data.emergency_rooms[0] 
          : data.emergency_rooms

        if (emergencyRoom) {
          const roomState = Array.isArray(emergencyRoom.state) 
            ? emergencyRoom.state[0] 
            : emergencyRoom.state

          if (roomState && typeof roomState === 'object' && 'state_name' in roomState) {
            const needsUpdate = 
              data.state !== roomState.state_name || 
              data.locality !== roomState.locality
            
            if (needsUpdate) {
              // Silently update in background
              await supabase
                .from('err_projects')
                .update({
                  state: roomState.state_name,
                  locality: roomState.locality
                })
                .eq('id', projectId)
              
              // Update local form data with synced values
              data.state = roomState.state_name
              data.locality = roomState.locality
            }

            // Set state filter to current state for room selection
            const currentState = availableStates.find(s => s.name === roomState.state_name)
            if (currentState) {
              setSelectedStateFilter(currentState.id)
            }
          }
        }

        setForm(data)
        
        // Parse expenses - ensure they have planned_activity fields
        const parsedExpenses = Array.isArray(data?.expenses)
          ? data.expenses
          : (typeof data?.expenses === 'string' ? JSON.parse(data?.expenses || '[]') : [])
        
        // Ensure expenses have planned_activity fields
        const expensesWithTags = parsedExpenses.map((exp: any) => ({
          activity: exp.activity || '',
          total_cost: exp.total_cost || 0,
          category: exp.category || null,
          planned_activity: exp.planned_activity || null,
          planned_activity_other: exp.planned_activity_other || null
        }))
        
        setExpenses(expensesWithTags)

        // Normalize planned_activities for display while preserving original structure
        const paRaw = Array.isArray(data?.planned_activities)
          ? data.planned_activities
          : (typeof data?.planned_activities === 'string'
            ? JSON.parse(data?.planned_activities || '[]')
            : [])

        setRawPlannedActivities(Array.isArray(paRaw) ? paRaw : [])
        
        // Auto-populate planned activities from tagged expenses
        const activityMap = new Map<string, { activity: string; cost: number; category: string | null; individuals: number | null; families: number | null }>()
        
        expensesWithTags.forEach((expense: any) => {
          if (expense.planned_activity && expense.planned_activity.trim()) {
            const plannedActivityLower = expense.planned_activity.toLowerCase()
            const isOther = plannedActivityLower.includes('other') || expense.planned_activity.includes('أخرى')
            
            let activityName: string
            if (isOther && expense.planned_activity_other && expense.planned_activity_other.trim()) {
              activityName = expense.planned_activity_other.trim()
            } else {
              activityName = expense.planned_activity.trim()
            }
            
            if (activityName) {
              const existing = activityMap.get(activityName)
              if (existing) {
                existing.cost += expense.total_cost || 0
              } else {
                // Try to find existing data from raw planned activities
                const existingPa = Array.isArray(paRaw) ? paRaw.find((pa: any) => {
                  if (typeof pa === 'string') return pa === activityName
                  if (pa && typeof pa === 'object') {
                    return (pa.activity === activityName || pa.description === activityName)
                  }
                  return false
                }) : null
                
                activityMap.set(activityName, {
                  activity: activityName,
                  cost: expense.total_cost || 0,
                  category: (existingPa && typeof existingPa === 'object' && existingPa.category) ? existingPa.category : null,
                  individuals: (existingPa && typeof existingPa === 'object' && existingPa.individuals != null) ? existingPa.individuals : null,
                  families: (existingPa && typeof existingPa === 'object' && existingPa.families != null) ? existingPa.families : null
                })
              }
            }
          }
        })

        // Convert map to planned activities array
        const paObjects = Array.from(activityMap.values()).map(item => ({
          activity: item.activity,
          category: item.category,
          individuals: item.individuals,
          families: item.families,
          planned_activity_cost: item.cost
        }))

        setPlannedActivities(paObjects)
        
        // Also set activities for backward compatibility
        const paDisplay: string[] = paObjects.map(item => item.activity)
        setActivities(paDisplay)
      } catch (e) {
        console.error('Load project error', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [open, projectId, availableStates])

  const updateField = (key: string, value: any) => {
    setForm((prev: any) => ({ ...prev, [key]: value }))
  }

  const handleRoomChange = async (roomId: string) => {
    if (!roomId) return

    try {
      // Fetch the selected room with its state information
      const { data: roomData, error } = await supabase
        .from('emergency_rooms')
        .select(`
          id,
          state:states!emergency_rooms_state_reference_fkey(
            state_name,
            locality
          )
        `)
        .eq('id', roomId)
        .single()

      if (error) throw error

      if (roomData?.state) {
        const roomState = Array.isArray(roomData.state) 
          ? roomData.state[0] 
          : roomData.state

        if (roomState && typeof roomState === 'object' && 'state_name' in roomState) {
          // Auto-update state and locality from the room
          setForm((prev: any) => ({
            ...prev,
            emergency_room_id: roomId,
            state: roomState.state_name,
            locality: roomState.locality || ''
          }))

          // Update state filter to match the room's state
          const matchingState = availableStates.find(s => s.name === roomState.state_name)
          if (matchingState) {
            setSelectedStateFilter(matchingState.id)
          }
        }
      }
    } catch (error) {
      console.error('Error fetching room data:', error)
    }
  }

  // Auto-populate planned activities from tagged expenses
  const updatePlannedActivitiesFromExpenses = useCallback((expensesList: Expense[]) => {
    setPlannedActivities(prevPlannedActivities => {
      const activityMap = new Map<string, { activity: string; cost: number; category: string | null; individuals: number | null; families: number | null }>()
      
      expensesList.forEach((expense) => {
        if (expense.planned_activity && expense.planned_activity.trim()) {
          const plannedActivityLower = expense.planned_activity.toLowerCase()
          const isOther = plannedActivityLower.includes('other') || expense.planned_activity.includes('أخرى')
          
          let activityName: string
          if (isOther && expense.planned_activity_other && expense.planned_activity_other.trim()) {
            activityName = expense.planned_activity_other.trim()
          } else {
            activityName = expense.planned_activity.trim()
          }
          
          if (activityName) {
            const existing = activityMap.get(activityName)
            if (existing) {
              existing.cost += expense.total_cost || 0
            } else {
              // Preserve existing category, individuals, families from current planned activities
              const existingPa = prevPlannedActivities.find(pa => pa.activity === activityName)
              activityMap.set(activityName, {
                activity: activityName,
                cost: expense.total_cost || 0,
                category: existingPa?.category || null,
                individuals: existingPa?.individuals ?? null,
                families: existingPa?.families ?? null
              })
            }
          }
        }
      })

      // Convert map to planned activities array
      const newPlannedActivities = Array.from(activityMap.values()).map(item => ({
        activity: item.activity,
        category: item.category,
        individuals: item.individuals,
        families: item.families,
        planned_activity_cost: item.cost
      }))

      setActivities(newPlannedActivities.map(a => a.activity))
      return newPlannedActivities
    })
  }, [])

  // Auto-update planned activities when expenses change
  useEffect(() => {
    if (expenses.length > 0) {
      updatePlannedActivitiesFromExpenses(expenses)
    }
  }, [expenses, updatePlannedActivitiesFromExpenses])

  const updateExpense = (idx: number, key: keyof Expense, value: any) => {
    const newExpenses = expenses.map((e, i) => 
      i === idx 
        ? { ...e, [key]: key === 'total_cost' ? Number(value) || 0 : value } 
        : e
    )
    setExpenses(newExpenses)
  }

  const addExpense = () => {
    const newExpenses = [...expenses, { activity: '', total_cost: 0, category: null, planned_activity: null, planned_activity_other: null }]
    setExpenses(newExpenses)
  }
  
  const removeExpense = (idx: number) => {
    const newExpenses = expenses.filter((_, i) => i !== idx)
    setExpenses(newExpenses)
  }

  const total = expenses.reduce((s, e) => s + (e.total_cost || 0), 0)

  const save = async () => {
    if (!projectId) return
    setSaving(true)
    try {
      // If emergency_room_id is set, ensure state/locality are synced from the room
      let finalState = form.state
      let finalLocality = form.locality

      if (form.emergency_room_id) {
        const { data: roomData } = await supabase
          .from('emergency_rooms')
          .select(`
            state:states!emergency_rooms_state_reference_fkey(
              state_name,
              locality
            )
          `)
          .eq('id', form.emergency_room_id)
          .single()

        if (roomData?.state) {
          const roomState = Array.isArray(roomData.state) 
            ? roomData.state[0] 
            : roomData.state

          if (roomState && typeof roomState === 'object' && 'state_name' in roomState) {
            // Auto-sync: Always use the room's actual state and locality
            finalState = roomState.state_name
            finalLocality = roomState.locality || null
          }
        }
      }

      // Build planned_activities payload from the plannedActivities state
      const plannedActivitiesForSave = plannedActivities.map(pa => ({
        activity: pa.activity || '',
        category: pa.category || null,
        individuals: pa.individuals ?? null,
        families: pa.families ?? null,
        planned_activity_cost: pa.planned_activity_cost ?? null
      }))

      const payload: any = {
        project_objectives: form.project_objectives || null,
        intended_beneficiaries: form.intended_beneficiaries || null,
        estimated_beneficiaries: form.estimated_beneficiaries ?? null,
        estimated_timeframe: form.estimated_timeframe || null,
        additional_support: form.additional_support || null,
        banking_details: form.banking_details || null,
        program_officer_name: form.program_officer_name || null,
        program_officer_phone: form.program_officer_phone || null,
        reporting_officer_name: form.reporting_officer_name || null,
        reporting_officer_phone: form.reporting_officer_phone || null,
        finance_officer_name: form.finance_officer_name || null,
        finance_officer_phone: form.finance_officer_phone || null,
        planned_activities: plannedActivitiesForSave,
        expenses: expenses.map(e => ({
          activity: e.activity,
          total_cost: e.total_cost,
          category: e.category || null,
          planned_activity: e.planned_activity || null,
          planned_activity_other: e.planned_activity_other || null
        }))
      }

      // Include emergency_room_id, state, and locality if they exist
      if (form.emergency_room_id) {
        payload.emergency_room_id = form.emergency_room_id
      }
      if (finalState) {
        payload.state = finalState
      }
      if (finalLocality !== undefined) {
        payload.locality = finalLocality
      }

      const { error } = await supabase
        .from('err_projects')
        .update(payload)
        .eq('id', projectId)
      if (error) throw error
      onSaved?.()
      onOpenChange(false)
    } catch (e) {
      console.error('Save project error', e)
      alert('Failed to save project')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('projects:project_details')}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center text-muted-foreground">{t('common:loading')}</div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>{t('projects:date')}</Label>
                <Input value={form.date || ''} onChange={(e) => updateField('date', e.target.value)} />
              </div>
              <div>
                <Label>{t('projects:emergency_room') || 'Emergency Room'}</Label>
                <div className="space-y-2">
                  <Select
                    value={selectedStateFilter}
                    onValueChange={setSelectedStateFilter}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t('projects:select_state') || 'Select state to filter rooms'} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableStates.map((state) => (
                        <SelectItem key={state.id} value={state.id}>
                          {state.name} {state.name_ar ? `(${state.name_ar})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={form.emergency_room_id || ''}
                    onValueChange={handleRoomChange}
                    disabled={!selectedStateFilter || availableRooms.length === 0}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={availableRooms.length === 0 ? (selectedStateFilter ? t('projects:no_rooms_found') || 'No rooms found' : t('projects:select_state_first') || 'Select state first') : t('projects:select_room') || 'Select emergency room'} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableRooms.map((room) => (
                        <SelectItem key={room.id} value={room.id}>
                          {room.name_ar || room.name} {room.err_code ? `(${room.err_code})` : ''} - {room.locality || ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>{t('projects:state') || 'State'}</Label>
                <Input value={form.state || ''} readOnly className="bg-muted" />
                <p className="text-xs text-muted-foreground mt-1">
                  {t('projects:auto_synced_from_room') || 'Auto-synced from emergency room'}
                </p>
              </div>
              <div>
                <Label>{t('projects:location')}</Label>
                <Input value={form.locality || ''} readOnly className="bg-muted" />
                <p className="text-xs text-muted-foreground mt-1">
                  {t('projects:auto_synced_from_room') || 'Auto-synced from emergency room'}
                </p>
              </div>
            </div>

            <div>
              <Label>{t('projects:objectives')}</Label>
              <Textarea value={form.project_objectives || ''} onChange={(e) => updateField('project_objectives', e.target.value)} className="min-h-[100px]" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>{t('projects:intended_beneficiaries')}</Label>
                <Textarea value={form.intended_beneficiaries || ''} onChange={(e) => updateField('intended_beneficiaries', e.target.value)} />
              </div>
              <div>
                <Label>{t('projects:estimated_number')}</Label>
                <Input type="number" value={form.estimated_beneficiaries || ''} onChange={(e) => updateField('estimated_beneficiaries', parseInt(e.target.value))} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>{t('projects:estimated_timeframe')}</Label>
                <Input value={form.estimated_timeframe || ''} onChange={(e) => updateField('estimated_timeframe', e.target.value)} />
              </div>
              <div>
                <Label>{t('projects:additional_support')}</Label>
                <Input value={form.additional_support || ''} onChange={(e) => updateField('additional_support', e.target.value)} />
              </div>
            </div>

            <div>
              <Label>{t('projects:banking_details')}</Label>
              <Textarea value={form.banking_details || ''} onChange={(e) => updateField('banking_details', e.target.value)} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>{t('projects:officer')}</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder={t('common:name') || 'Name'} value={form.program_officer_name || ''} onChange={(e) => updateField('program_officer_name', e.target.value)} />
                  <Input placeholder={t('common:phone') || 'Phone'} value={form.program_officer_phone || ''} onChange={(e) => updateField('program_officer_phone', e.target.value)} />
                </div>
              </div>
              <div>
                <Label>{t('projects:reporting_officer', { defaultValue: 'Reporting Officer' })}</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder={t('common:name') || 'Name'} value={form.reporting_officer_name || ''} onChange={(e) => updateField('reporting_officer_name', e.target.value)} />
                  <Input placeholder={t('projects:phone', { defaultValue: t('common:phone') || 'Phone' })} value={form.reporting_officer_phone || ''} onChange={(e) => updateField('reporting_officer_phone', e.target.value)} />
                </div>
              </div>
              <div>
                <Label>{t('projects:finance_officer', { defaultValue: 'Finance Officer' })}</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder={t('common:name') || 'Name'} value={form.finance_officer_name || ''} onChange={(e) => updateField('finance_officer_name', e.target.value)} />
                  <Input placeholder={t('projects:phone', { defaultValue: t('common:phone') || 'Phone' })} value={form.finance_officer_phone || ''} onChange={(e) => updateField('finance_officer_phone', e.target.value)} />
                </div>
              </div>
            </div>

            <div>
              <Label className="text-lg font-semibold mb-2">{t('projects:planned_activities')}</Label>
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-4 py-2 text-left min-w-[200px]">{t('projects:activity') || 'Activity'}</th>
                        <th className="px-4 py-2 text-left min-w-[180px]">Sector</th>
                        <th className="px-4 py-2 text-left min-w-[120px]">Individuals</th>
                        <th className="px-4 py-2 text-left min-w-[120px]">Families</th>
                        <th className="px-4 py-2 text-left min-w-[150px]">Planned Activity Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plannedActivities.map((pa, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-4 py-2">
                            <div className="p-2 bg-muted rounded-md text-sm h-8 flex items-center">
                              {pa.activity || '-'}
                            </div>
                          </td>
                          <td className="px-4 py-2">
                            <Select
                              value={sectors.find(s => s.sector_name_en === pa.category)?.id || undefined}
                              onValueChange={(value) => {
                                const selectedSector = sectors.find(s => s.id === value)
                                const newActivities = [...plannedActivities]
                                newActivities[i] = { 
                                  ...newActivities[i], 
                                  category: selectedSector ? selectedSector.sector_name_en : null 
                                }
                                setPlannedActivities(newActivities)
                              }}
                            >
                              <SelectTrigger className="h-8 w-full">
                                <SelectValue placeholder="Select sector" />
                              </SelectTrigger>
                              <SelectContent>
                                {sectors.map((sector) => (
                                  <SelectItem key={sector.id} value={sector.id}>
                                    {sector.sector_name_en} {sector.sector_name_ar && `(${sector.sector_name_ar})`}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-4 py-2">
                            <Input
                              type="number"
                              value={pa.individuals || ''}
                              onChange={(e) => {
                                const newActivities = [...plannedActivities]
                                newActivities[i] = {
                                  ...newActivities[i],
                                  individuals: e.target.value ? parseInt(e.target.value) : null
                                }
                                setPlannedActivities(newActivities)
                              }}
                              className="h-8"
                              placeholder="0"
                              min="0"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <Input
                              type="number"
                              value={pa.families || ''}
                              onChange={(e) => {
                                const newActivities = [...plannedActivities]
                                newActivities[i] = {
                                  ...newActivities[i],
                                  families: e.target.value ? parseInt(e.target.value) : null
                                }
                                setPlannedActivities(newActivities)
                              }}
                              className="h-8"
                              placeholder="0"
                              min="0"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <div className="p-2 bg-muted rounded-md text-sm h-8 flex items-center justify-end font-medium">
                              {pa.planned_activity_cost?.toLocaleString() || '0.00'}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="p-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Planned activities are automatically populated from tagged expenses. Select Sector and add Individuals and Families for each activity.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <Label className="text-lg font-semibold mb-2">{t('projects:expenses')}</Label>
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-4 py-2 text-left">Expenses</th>
                        <th className="px-4 py-2 text-left min-w-[200px]">Planned Activity</th>
                        <th className="px-4 py-2 text-right">USD</th>
                        <th className="w-16 px-4 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenses.map((expense, index) => (
                        <tr key={index} className="border-t">
                          <td className="px-4 py-2">
                            <Input
                              value={expense.activity}
                              onChange={(e) => updateExpense(index, 'activity', e.target.value)}
                              className="border-0 focus-visible:ring-0 px-0 py-0 h-8"
                              placeholder="Expense description"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <div className="space-y-2">
                              <Select
                                value={availablePlannedActivities.find(pa => pa.activity_name === expense.planned_activity)?.id || undefined}
                                onValueChange={(value) => {
                                  const selectedActivity = availablePlannedActivities.find(pa => pa.id === value)
                                  const activityName = selectedActivity ? selectedActivity.activity_name : null
                                  
                                  const isOther = activityName && (activityName.toLowerCase().includes('other') || activityName.includes('أخرى'))
                                  
                                  // Update both fields in a single state update
                                  const newExpenses = expenses.map((e, i) => 
                                    i === index 
                                      ? { 
                                          ...e, 
                                          planned_activity: activityName,
                                          planned_activity_other: isOther ? e.planned_activity_other : null
                                        } 
                                      : e
                                  )
                                  setExpenses(newExpenses)
                                }}
                              >
                                <SelectTrigger className="h-8 w-full">
                                  <SelectValue placeholder="Select planned activity" />
                                </SelectTrigger>
                                <SelectContent>
                                  {availablePlannedActivities.map((activity) => (
                                    <SelectItem key={activity.id} value={activity.id}>
                                      {activity.activity_name} {activity.activity_name_ar && `(${activity.activity_name_ar})`}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {expense.planned_activity && (expense.planned_activity.toLowerCase().includes('other') || expense.planned_activity.includes('أخرى')) && (
                                <Input
                                  value={expense.planned_activity_other || ''}
                                  onChange={(e) => updateExpense(index, 'planned_activity_other', e.target.value)}
                                  className="h-8"
                                  placeholder="Specify other activity"
                                />
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2">
                            <Input
                              type="number"
                              value={expense.total_cost}
                              onChange={(e) => updateExpense(index, 'total_cost', e.target.value)}
                              className="border-0 focus-visible:ring-0 px-0 py-0 h-8 text-right"
                              placeholder="0"
                              min="0"
                              step="0.01"
                            />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => removeExpense(index)}
                              className="h-8 w-8 p-0"
                            >
                              ×
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="p-4 border-t">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Tag expenses with planned activities to automatically populate the planned activities table above.
                    </p>
                    <div className="text-sm font-medium">
                      {t('projects:total')}: {total.toLocaleString()}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={addExpense} className="mt-2">{t('projects:add_expense')}</Button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => onOpenChange(false)}>{t('projects:cancel', { defaultValue: t('common:cancel') || 'Cancel' })}</Button>
              <Button onClick={save} disabled={saving}>{saving ? (t('common:saving') || 'Saving…') : t('projects:save_changes')}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}


