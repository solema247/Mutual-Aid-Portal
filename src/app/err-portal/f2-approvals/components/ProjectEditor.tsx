'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabaseClient'

type Expense = { activity: string; total_cost: number }

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
  const [activities, setActivities] = useState<string[]>([])
  const [availableRooms, setAvailableRooms] = useState<Array<{id: string, name: string, name_ar: string | null, err_code: string | null, state_name: string, locality: string | null}>>([])
  const [selectedStateFilter, setSelectedStateFilter] = useState<string>('')
  const [availableStates, setAvailableStates] = useState<Array<{id: string, name: string, name_ar: string | null}>>([])

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
        if (data.emergency_rooms && Array.isArray(data.emergency_rooms) && data.emergency_rooms.length > 0) {
          const room = data.emergency_rooms[0]
          if (room?.state) {
            const roomState = room.state
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
        } else if (data.emergency_rooms && !Array.isArray(data.emergency_rooms)) {
          // Handle single object (non-array) response
          const room = data.emergency_rooms as any
          if (room?.state) {
            const roomState = room.state
            const needsUpdate = 
              data.state !== roomState.state_name || 
              data.locality !== roomState.locality
            
            if (needsUpdate) {
              await supabase
                .from('err_projects')
                .update({
                  state: roomState.state_name,
                  locality: roomState.locality
                })
                .eq('id', projectId)
              
              data.state = roomState.state_name
              data.locality = roomState.locality
            }

            const currentState = availableStates.find(s => s.name === roomState.state_name)
            if (currentState) {
              setSelectedStateFilter(currentState.id)
            }
          }
        }

        setForm(data)
        setExpenses(Array.isArray(data?.expenses) ? data.expenses : (typeof data?.expenses === 'string' ? JSON.parse(data?.expenses || '[]') : []))
        const pa = Array.isArray(data?.planned_activities) ? data.planned_activities : (typeof data?.planned_activities === 'string' ? JSON.parse(data?.planned_activities || '[]') : [])
        setActivities(pa)
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
        // Auto-update state and locality from the room
        setForm((prev: any) => ({
          ...prev,
          emergency_room_id: roomId,
          state: roomData.state.state_name,
          locality: roomData.state.locality || ''
        }))

        // Update state filter to match the room's state
        const roomState = availableStates.find(s => s.name === roomData.state.state_name)
        if (roomState) {
          setSelectedStateFilter(roomState.id)
        }
      }
    } catch (error) {
      console.error('Error fetching room data:', error)
    }
  }

  const updateExpense = (idx: number, key: keyof Expense, value: any) => {
    setExpenses(prev => prev.map((e, i) => i === idx ? { ...e, [key]: key === 'total_cost' ? Number(value) || 0 : value } : e))
  }

  const addExpense = () => setExpenses(prev => [...prev, { activity: '', total_cost: 0 }])
  const removeExpense = (idx: number) => setExpenses(prev => prev.filter((_, i) => i !== idx))

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
          // Auto-sync: Always use the room's actual state and locality
          finalState = roomData.state.state_name
          finalLocality = roomData.state.locality || null
        }
      }

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
        planned_activities: activities,
        expenses
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
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
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
              <div className="flex items-center justify-between">
                <Label>{t('projects:planned_activities')}</Label>
                <Button variant="outline" size="sm" onClick={() => setActivities(prev => [...prev, ''])}>{t('projects:add_activity')}</Button>
              </div>
              <div className="mt-2 space-y-2">
                {activities.map((a, i) => (
                  <div key={i} className="flex gap-2">
                    <Input value={a} onChange={(e) => setActivities(prev => prev.map((v, idx) => idx === i ? e.target.value : v))} />
                    <Button variant="outline" size="sm" onClick={() => setActivities(prev => prev.filter((_, idx) => idx !== i))}>{t('projects:remove_activity')}</Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label>{t('projects:expenses')}</Label>
                <div className="text-sm text-muted-foreground">{t('projects:total')}: {total.toLocaleString()}</div>
              </div>
              <div className="mt-2 space-y-2">
                {expenses.map((e, i) => (
                  <div key={i} className="grid grid-cols-3 gap-2">
                    <Input placeholder={t('projects:activity') || 'Activity'} value={e.activity} onChange={(ev) => updateExpense(i, 'activity', ev.target.value)} />
                    <Input type="number" placeholder={t('projects:amount') || 'Amount'} value={e.total_cost} onChange={(ev) => updateExpense(i, 'total_cost', ev.target.value)} />
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => removeExpense(i)}>{t('projects:remove_expense')}</Button>
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addExpense}>{t('projects:add_expense')}</Button>
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


