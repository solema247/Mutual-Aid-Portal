'use client'

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { FileUp } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import type { F1FormData, EmergencyRoom, State } from '@/app/api/fsystem/types/fsystem'
import type { RoomWithState } from '@/app/api/rooms/types/rooms'

// Extended type that includes state and all room properties
type EmergencyRoomWithState = RoomWithState & {
  err_code: string | null
  state_reference: string
}
import ExtractedDataReview from './ExtractedDataReview'
import { cn } from '@/lib/utils'
import { X, Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

export default function DirectUpload() {
  const { t } = useTranslation(['common', 'fsystem'])
  const [rooms, setRooms] = useState<EmergencyRoomWithState[]>([])
  const [states, setStates] = useState<State[]>([])
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  

  const [formData, setFormData] = useState<F1FormData>({
    donor_id: '',
    state_id: '',
    date: '',
    project_id: '',
    emergency_room_id: '',
    file: null,
    primary_sectors: [],
    secondary_sectors: [],
    funding_cycle_id: '',
    cycle_state_allocation_id: '',
    grant_serial_id: '',
    currency: 'USD',
    exchange_rate: 2700,
    grant_segment: undefined
  })
  
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [processedData, setProcessedData] = useState<any>(null)
  const [isReviewing, setIsReviewing] = useState(false)
  const [showCreateRoomDialog, setShowCreateRoomDialog] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')
  const [newRoomNameAr, setNewRoomNameAr] = useState('')
  const [isCreatingRoom, setIsCreatingRoom] = useState(false)
  const [selectedLocality, setSelectedLocality] = useState<string>('')
  const [availableLocalities, setAvailableLocalities] = useState<Array<{id: string, locality: string | null, locality_ar: string | null}>>([])
  const [showCreateLocality, setShowCreateLocality] = useState(false)
  const [newLocalityName, setNewLocalityName] = useState('')
  const [newLocalityNameAr, setNewLocalityNameAr] = useState('')
  const [isCreatingLocality, setIsCreatingLocality] = useState(false)
  

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch states with distinct state names
        const { data: statesData, error: statesError } = await supabase
          .from('states')
          .select('id, state_name, state_name_ar, state_short, locality, locality_ar')
          .not('state_name', 'is', null)
          .order('state_name')

        if (statesError) throw statesError

        const uniqueStates = (statesData || []).filter((state, index, self) =>
          index === self.findIndex((s: any) => s.state_name === (state as any).state_name)
        ) as any
        setStates(uniqueStates as unknown as State[])
      } catch (error) {
        console.error('Error fetching data:', error)
      }
    }

    fetchData()
  }, [])

  // Fetch rooms when state changes
  useEffect(() => {
    const fetchRoomsForState = async () => {
      try {
        if (!formData.state_id) {
          setRooms([])
          return
        }
        const selectedState = states.find(s => s.id === formData.state_id)
        if (!selectedState) {
          setRooms([])
          return
        }
        // Include ALL state rows with the same state_name (rooms may reference any of them)
        const { data: allStateIds, error: stateError } = await supabase
          .from('states')
          .select('id')
          .eq('state_name', selectedState.state_name)
        if (stateError) throw stateError
        const stateIds = (allStateIds || []).map((s: any) => s.id)
        const { data: roomsData, error: roomsError } = await supabase
          .from('emergency_rooms')
          .select(`
            *,
            state:states!emergency_rooms_state_reference_fkey(
              id,
              state_name,
              locality,
              state_name_ar,
              locality_ar
            )
          `)
          .in('state_reference', stateIds)
          .eq('status', 'active')
        if (roomsError) throw roomsError
        setRooms((roomsData as any) || [])
      } catch (error) {
        console.error('Error fetching rooms:', error)
        setRooms([])
      }
    }
    fetchRoomsForState()
  }, [formData.state_id, states])

  // Fetch localities for the selected state when modal opens or state changes
  useEffect(() => {
    const fetchLocalities = async () => {
      if (!formData.state_id || !showCreateRoomDialog) {
        setAvailableLocalities([])
        setSelectedLocality('')
        return
      }

      try {
        const selectedState = states.find(s => s.id === formData.state_id)
        if (!selectedState) {
          setAvailableLocalities([])
          setSelectedLocality('')
          return
        }

        // Fetch all state rows with the same state_name to get all localities
        const { data: stateRows, error } = await supabase
          .from('states')
          .select('id, locality, locality_ar')
          .eq('state_name', selectedState.state_name)
          .order('locality')

        if (error) throw error

        // Create unique localities list (group by locality value, keep first id)
        const localityMap = new Map<string, {id: string, locality: string | null, locality_ar: string | null}>()
        stateRows?.forEach((row: any) => {
          const localityKey = row.locality || 'null'
          if (!localityMap.has(localityKey)) {
            localityMap.set(localityKey, {
              id: row.id,
              locality: row.locality,
              locality_ar: row.locality_ar
            })
          }
        })

        const localities = Array.from(localityMap.values())
        setAvailableLocalities(localities)
        
        // If only one locality, auto-select it
        if (localities.length === 1) {
          setSelectedLocality(localities[0].id)
        } else {
          setSelectedLocality('')
        }
      } catch (error) {
        console.error('Error fetching localities:', error)
        setAvailableLocalities([])
        setSelectedLocality('')
      }
    }

    fetchLocalities()
  }, [formData.state_id, showCreateRoomDialog, states])

  // Removed cycle/serial preview logic in upload-first flow

  const hasRequiredFields = () => !!(selectedFile && formData.state_id && formData.emergency_room_id)

  // No allocation selection in upload-first flow

  const handleInputChange = (field: keyof F1FormData, value: string | string[] | number | undefined) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleCreateRoom = async () => {
    if (!newRoomName.trim()) {
      alert('Please enter a room name')
      return
    }

    if (!formData.state_id) {
      alert('Please select a state first')
      return
    }

    if (!selectedLocality) {
      alert('Please select a locality')
      return
    }

    setIsCreatingRoom(true)
    try {
      const selectedState = states.find(s => s.id === formData.state_id)
      if (!selectedState) {
        alert('State not found')
        return
      }

      // Find the state row that matches both state_name and the selected locality
      const selectedLocalityData = availableLocalities.find(l => l.id === selectedLocality)
      if (!selectedLocalityData) {
        alert('Locality not found')
        return
      }

      // Query for the state row with matching state_name and locality
      const { data: stateRow, error: stateRowError } = await supabase
        .from('states')
        .select('id, state_short')
        .eq('state_name', selectedState.state_name)
        .eq('locality', selectedLocalityData.locality)
        .single()

      if (stateRowError || !stateRow) {
        // Fallback: if exact match not found, use the selected locality's state_reference id
        console.warn('Exact state row not found, using selected locality state_reference')
      }

      const correctStateReference = stateRow?.id || selectedLocality
      const stateShort = stateRow?.state_short?.toUpperCase() || selectedState.state_short?.toUpperCase() || 'XX'

      // Get existing rooms for this state to determine the next number
      // Query across all state rows with the same state_name
      const { data: allStateIds, error: allStateIdsError } = await supabase
        .from('states')
        .select('id')
        .eq('state_name', selectedState.state_name)
      
      if (allStateIdsError) throw allStateIdsError
      
      const stateIds = (allStateIds || []).map((s: any) => s.id)
      const { data: existingRooms, error: existingError } = await supabase
        .from('emergency_rooms')
        .select('err_code')
        .in('state_reference', stateIds)
        .not('err_code', 'is', null)

      let roomNumber = '01' // Default to 01
      if (!existingError && existingRooms && existingRooms.length > 0) {
        // Find the highest room number
        const numbers = existingRooms
          .map((room: any) => {
            const match = room.err_code?.match(/ERR-[A-Z]+-(\d+)-(\d+)/)
            return match ? parseInt(match[1]) : 0
          })
          .filter((n: number) => !isNaN(n))
        
        if (numbers.length > 0) {
          roomNumber = String(Math.max(...numbers) + 1).padStart(2, '0')
        }
      }

      // Generate a unique 3-digit identifier
      const uniqueId = String(Math.floor(Math.random() * 1000)).padStart(3, '0')

      // Construct the err_code: ERR-{StateShort}-{RoomNumber}-{UniqueID}
      const errCode = `ERR-${stateShort}-${roomNumber}-${uniqueId}`

      // Create the new room with the correct state_reference
      const { data: newRoom, error: createError } = await supabase
        .from('emergency_rooms')
        .insert({
          name: newRoomName.trim(),
          name_ar: newRoomNameAr.trim() || null,
          state_reference: correctStateReference,
          type: 'base',
          status: 'active',
          err_code: errCode
        })
        .select()
        .single()

      if (createError) {
        throw createError
      }

      // Add the new room to the list and select it
      setRooms(prev => [...prev, newRoom as EmergencyRoomWithState])
      handleInputChange('emergency_room_id', newRoom.id)
      
      // Close dialog and reset form
      setShowCreateRoomDialog(false)
      setNewRoomName('')
      setNewRoomNameAr('')
      setSelectedLocality('')
    } catch (error: any) {
      console.error('Error creating room:', error)
      alert('Failed to create room: ' + (error.message || 'Unknown error'))
    } finally {
      setIsCreatingRoom(false)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      if (file.type === 'application/pdf' || file.type === 'application/msword' || 
          file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        // Upload to temp immediately and keep handle for OCR
        const ext = file.name.split('.').pop()
        const tempKey = `f1-forms/_incoming/${crypto.randomUUID()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('images')
          .upload(tempKey, file, { cacheControl: '3600', upsert: false })
        if (uploadError) {
          console.error('Temp upload failed:', uploadError)
          alert('Failed to upload file')
          return
        }
        setSelectedFile(file)
        setFormData(prev => ({ ...prev, file }))
        // Stash temp key for finalize
        ;(window as any).__f1_temp_key__ = tempKey
      } else {
        alert('Please select a PDF or Word document')
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedFile) {
      alert('Please select a file')
      return
    }

    setIsLoading(true)
    try {
      const selectedRoom = rooms.find((r: any) => r.id === formData.emergency_room_id)

      if (!selectedRoom) {
        alert('Please select a room')
        setIsLoading(false)
        return
      }

      // Process the file first
      const processFormData = new FormData()
      processFormData.append('file', selectedFile)

      // Add minimal metadata for initial processing
      const selectedState = states.find(s => s.id === formData.state_id)
      
      // Get the state from the emergency room's state_reference (this has the correct locality)
      let roomState = Array.isArray(selectedRoom?.state) 
        ? selectedRoom?.state[0] 
        : selectedRoom?.state
      
      // If roomState is not available from the join, fetch it directly using the room's state_reference
      if (!roomState && selectedRoom.state_reference) {
        const { data: stateData, error: stateError } = await supabase
          .from('states')
          .select('id, state_name, locality, state_name_ar, locality_ar')
          .eq('id', selectedRoom.state_reference)
          .single()
        
        if (!stateError && stateData) {
          roomState = stateData
        }
      }
      
      // Always use locality from the room's state_reference (never fallback to selectedState.locality)
      // The room's state_reference is the source of truth for locality
      const locality = roomState?.locality || null
      const locality_ar = roomState?.locality_ar || null
      
      // Use roomState for state info if available, otherwise use selectedState
      const finalStateName = roomState?.state_name || selectedState?.state_name || null
      const finalStateNameAr = roomState?.state_name_ar || selectedState?.state_name_ar || null
      const finalStateId = roomState?.id || selectedState?.id || null
      
      const metadata = {
        err_code: selectedRoom?.err_code,
        err_name: selectedRoom?.name_ar || selectedRoom?.name,
        donor_name: null,
        state_name: finalStateName,
        state_name_ar: finalStateNameAr,
        state_id: finalStateId,
        locality: locality,
        locality_ar: locality_ar,
        currency: formData.currency,
        exchange_rate: formData.exchange_rate
      }
      processFormData.append('metadata', JSON.stringify(metadata))

      const response = await fetch('/api/fsystem/process', {
        method: 'POST',
        body: processFormData
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.details || 'Failed to process document')
      }

      const extractedData = await response.json()
      setProcessedData(extractedData)
      setIsReviewing(true)
      setIsLoading(false)

    } catch (error) {
      console.error('Error processing form:', error)
      alert('Upload failed. Please try again in a minute.')
      setIsLoading(false)
    }
  }

  const handleConfirmUpload = async (editedData: any) => {
    setIsLoading(true)
    try {
      // Only require state selection - other metadata will be set in F2
      const stateName: string = editedData._selected_state_name || formData.state_id

      if (!stateName) {
        throw new Error('State selection is required')
      }

      // Detect language and translate if needed
      const sourceLanguage = editedData.language || 'en'
      console.log('Detected source language:', sourceLanguage)
      
      const { translatedData, originalText } = await translateFields(editedData, sourceLanguage)
      console.log('Translation completed. Original text preserved:', Object.keys(originalText).length > 0)

      // Get temp file key - file stays in temp folder until F2 assignment
      const tempKey = (window as any).__f1_temp_key__ as string
      if (!tempKey) throw new Error('Temp file key missing')

      // Convert expenses to DB format (USD only, preserve category and planned_activity tags)
      const expensesForDB = (translatedData.expenses || []).map((e: any) => ({ 
        activity: e.activity, 
        total_cost: e.total_cost_usd || 0,
        category: e.category || null,
        planned_activity: e.planned_activity || null,
        planned_activity_other: e.planned_activity_other || null
      }))

      // Normalize planned_activities to new format and ensure it's an array of objects
      const plannedActivitiesForDB = normalizePlannedActivities(translatedData.planned_activities || [])

      // ERR room
      const selectedRoom = (rooms as any[]).find(r => r.id === formData.emergency_room_id)

      // Prepare data for DB - remove metadata fields that will be set in F2
      const { form_currency, exchange_rate, raw_ocr, _selected_state_name, _selected_grant_call_id, _yymm, _existing_serial, _selected_funding_cycle_id, _cycle_state_allocation_id, ...dataForDB } = translatedData

      // Generate project_name from locality only (sectors are now set per activity)
      const locality = dataForDB.locality || ''
      const projectName = locality || null

      // Normalize date for DB (MMYY -> YYYY-MM-01)
      let dbDate: string | null = null
      if (typeof dataForDB.date === 'string') {
        const val = dataForDB.date
        if (/^\d{4}$/.test(val)) {
          const mm = val.slice(0, 2)
          const yy = val.slice(2, 4)
          dbDate = `20${yy}-${mm}-01`
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
          dbDate = val
        }
      }

      // Insert into database with temp file path - NO FINAL FILE MOVE
      const { error: insertError } = await supabase
        .from('err_projects')
        .insert([{
          ...dataForDB,
          date: dbDate,
          expenses: expensesForDB,
          planned_activities: plannedActivitiesForDB, // Save as array of objects with category, individuals, families, cost
          emergency_room_id: formData.emergency_room_id,
          err_id: selectedRoom?.err_code || null,
          status: 'pending', // Status for files awaiting F2 approval
          source: 'mutual_aid_portal',
          state: stateName,
          // Primary and Secondary categories removed - will be set per activity in planned_activities
          project_name: projectName,
          temp_file_key: tempKey, // Store temp file path
          original_text: originalText,
          language: sourceLanguage,
          grant_segment: formData.grant_segment ? String(formData.grant_segment) : null,
          // Remove these fields - will be set in F2:
          // donor_id: null,
          // grant_call_id: null,
          // funding_cycle_id: null,
          // grant_id: null,
          // grant_serial: null,
          // workplan_number: null
        }])
      if (insertError) {
        console.error('Database insert error:', insertError)
        console.error('Insert data:', {
          grant_segment: formData.grant_segment,
          grant_segment_type: typeof formData.grant_segment
        })
        throw insertError
      }

      alert('F1 workplan uploaded successfully!')
      // Reset form
      setFormData({
        donor_id: '',
        state_id: '',
        date: '',
        project_id: '',
        emergency_room_id: '',
        file: null,
        primary_sectors: [],
        secondary_sectors: [],
        funding_cycle_id: '',
        cycle_state_allocation_id: '',
        grant_serial_id: '',
        currency: 'USD',
        exchange_rate: 2700,
        grant_segment: undefined
      })
      setSelectedFile(null)
      ;(window as any).__f1_temp_key__ = null
      setProcessedData(null)
      setIsReviewing(false)
    } catch (e: any) {
      console.error('Upload error:', e)
      alert('Upload failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancelReview = () => {
    setProcessedData(null)
    setIsReviewing(false)
  }

  // Normalize planned_activities to new format if needed
  const normalizePlannedActivities = (activities: any[]): any[] => {
    if (!Array.isArray(activities)) return []
    if (activities.length === 0) return []
    
    // Check if already in new format
    if (typeof activities[0] === 'object' && activities[0] !== null && 'activity' in activities[0]) {
      return activities
    }
    
    // Convert old format (string[]) to new format
    return (activities as string[]).map(activity => ({
      activity: activity || '',
      category: null,
      individuals: null,
      families: null,
      planned_activity_cost: null
    }))
  }

  // Translation helper function
  const translateFields = async (data: any, sourceLanguage: string) => {
    if (sourceLanguage !== 'ar') {
      // If not Arabic, return data as-is with empty original_text
      return {
        translatedData: data,
        originalText: {
          source_language: sourceLanguage,
          project_objectives: null,
          intended_beneficiaries: null,
          estimated_timeframe: null,
          additional_support: null,
          banking_details: null,
          program_officer_name: null,
          reporting_officer_name: null,
          finance_officer_name: null,
          planned_activities: [],
          expenses: []
        }
      }
    }

    const translateText = async (text: string | null): Promise<string | null> => {
      if (!text || text.trim() === '') return text
      
      try {
        const response = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: text, source: 'ar', target: 'en' })
        })
        
        if (!response.ok) {
          console.warn('Translation failed for text:', text.substring(0, 50))
          return text // Fallback to original
        }
        
        const result = await response.json()
        return result.translatedText || text
      } catch (error) {
        console.warn('Translation error:', error)
        return text // Fallback to original
      }
    }

    const translateArray = async (items: string[]): Promise<string[]> => {
      if (!Array.isArray(items) || items.length === 0) return []
      
      const translatedItems = []
      for (const item of items) {
        const translated = await translateText(item)
        translatedItems.push(translated || item)
      }
      return translatedItems
    }

    const translatePlannedActivities = async (activities: any[]): Promise<any[]> => {
      if (!Array.isArray(activities) || activities.length === 0) return []
      
      const translatedActivities = []
      for (const activity of activities) {
        // Handle both old format (string) and new format (object)
        if (typeof activity === 'string') {
          const translated = await translateText(activity)
          translatedActivities.push({
            activity: translated || activity,
            category_id: null,
            individuals: null,
            families: null,
            planned_activity_cost: null
          })
        } else if (typeof activity === 'object' && activity !== null) {
          // New format: object with activity, category, etc.
          const translatedActivity = await translateText(activity.activity)
          translatedActivities.push({
            ...activity,
            activity: translatedActivity || activity.activity
          })
        }
      }
      return translatedActivities
    }

    const translateExpenses = async (expenses: any[]): Promise<any[]> => {
      if (!Array.isArray(expenses) || expenses.length === 0) return []
      
      const translatedExpenses = []
      for (const expense of expenses) {
        const translatedActivity = await translateText(expense.activity)
        const translatedPlannedActivity = expense.planned_activity 
          ? await translateText(expense.planned_activity) 
          : expense.planned_activity
        const translatedPlannedActivityOther = expense.planned_activity_other 
          ? await translateText(expense.planned_activity_other) 
          : expense.planned_activity_other
        translatedExpenses.push({
          ...expense,
          activity: translatedActivity || expense.activity,
          planned_activity: translatedPlannedActivity || expense.planned_activity,
          planned_activity_other: translatedPlannedActivityOther || expense.planned_activity_other
        })
      }
      return translatedExpenses
    }

    // Build original text object
    const originalText = {
      source_language: sourceLanguage,
      project_objectives: data.project_objectives,
      intended_beneficiaries: data.intended_beneficiaries,
      estimated_timeframe: data.estimated_timeframe,
      additional_support: data.additional_support,
      banking_details: data.banking_details,
      program_officer_name: data.program_officer_name,
      reporting_officer_name: data.reporting_officer_name,
      finance_officer_name: data.finance_officer_name,
      planned_activities: Array.isArray(data.planned_activities) 
        ? data.planned_activities.map((a: any) => 
            typeof a === 'string' ? a : { activity: a.activity }
          ) 
        : [],
      expenses: Array.isArray(data.expenses) ? data.expenses.map((e: any) => ({ 
        activity: e.activity,
        planned_activity: e.planned_activity || null,
        planned_activity_other: e.planned_activity_other || null
      })) : []
    }

    // Translate all text fields
    const translatedData = { ...data }
    
    translatedData.project_objectives = await translateText(data.project_objectives)
    translatedData.intended_beneficiaries = await translateText(data.intended_beneficiaries)
    translatedData.estimated_timeframe = await translateText(data.estimated_timeframe)
    translatedData.additional_support = await translateText(data.additional_support)
    translatedData.banking_details = await translateText(data.banking_details)
    translatedData.program_officer_name = await translateText(data.program_officer_name)
    translatedData.reporting_officer_name = await translateText(data.reporting_officer_name)
    translatedData.finance_officer_name = await translateText(data.finance_officer_name)
    translatedData.planned_activities = await translatePlannedActivities(data.planned_activities)
    translatedData.expenses = await translateExpenses(data.expenses)

    return { translatedData, originalText }
  }

  // No allocation info in upload-first step

  return (
    <div className="space-y-6">
      {!isReviewing && (
        <div className="space-y-6"></div>
      )}

      {!isReviewing ? (
            <div className="space-y-4">
              {/* File Upload */}
          <div className="mb-4">
            <Label className="mb-1">{t('fsystem:f1.upload_label')}</Label>
                <Input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={handleFileChange}
                  className="mt-1"
                />
              </div>

              {/* Currency Selection */}
              <div className="mb-4 grid grid-cols-2 gap-4">
                <div>
                  <Label className="mb-2">Form Currency</Label>
                  <Select
                    value={formData.currency}
                    onValueChange={(value) => handleInputChange('currency', value as 'USD' | 'SDG')}
                  >
                    <SelectTrigger className="h-[38px] w-full">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD (US Dollar)</SelectItem>
                      <SelectItem value="SDG">SDG (Sudanese Pound)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {formData.currency === 'SDG' && (
                  <div>
                    <Label className="mb-2">Exchange Rate (USD to SDG)</Label>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      value={formData.exchange_rate || ''}
                      onChange={(e) => handleInputChange('exchange_rate', parseFloat(e.target.value) || 0)}
                      placeholder="2700"
                      className="h-[38px] w-full"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Enter the current exchange rate (e.g., 2700 means 1 USD = 2700 SDG)
                    </p>
                  </div>
                )}
              </div>

                    {/* Main Form Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="col-span-1">
                  <Label className="mb-2">{t('fsystem:f1.state')}</Label>
                  <Select
                    value={formData.state_id}
                    onValueChange={(value) => {
                      handleInputChange('state_id', value)
                      handleInputChange('emergency_room_id', '')
                    }}
                  >
                                <SelectTrigger className="h-[38px] w-full">
                      <SelectValue placeholder={t('fsystem:f1.state')} />
                    </SelectTrigger>
                    <SelectContent>
                      {states.map((state) => (
                        <SelectItem key={state.id} value={state.id}>
                          {state.state_name || '-'}{state.state_name_ar ? ` (${state.state_name_ar})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
              </div>

            <div className="col-span-1">
                  <Label className="mb-2">{t('fsystem:f1.emergency_response_room')}</Label>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Select
                        value={formData.emergency_room_id}
                        onValueChange={(value) => handleInputChange('emergency_room_id', value)}
                        disabled={rooms.length === 0}
                      >
                        <SelectTrigger className="h-[38px] w-full">
                        <SelectValue placeholder={t('fsystem:f1.select_emergency_room')} />
                      </SelectTrigger>
                      <SelectContent>
                        {rooms.map((room) => (
                          <SelectItem key={room.id} value={room.id}>
                            {room.name_ar || room.name} {room.err_code ? `(${room.err_code})` : ''}
                          </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setShowCreateRoomDialog(true)}
                      disabled={!formData.state_id}
                      className="h-[38px] w-[38px]"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
              </div>
            
            {/* No date/serial selection in upload-first step */}
              </div>

          {/* Grant Segment */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="mb-2">{t('fsystem:f1.grant_segment')}</Label>
              <Select
                value={formData.grant_segment || ''}
                onValueChange={(value) => handleInputChange('grant_segment', value ? (value as 'Flexible' | 'Sustainability' | 'WRR' | 'Capacity Building') : undefined)}
              >
                <SelectTrigger className="h-[38px] w-full">
                  <SelectValue placeholder={t('fsystem:f1.select_grant_segment')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Flexible">Flexible</SelectItem>
                  <SelectItem value="Sustainability">Sustainability</SelectItem>
                  <SelectItem value="WRR">WRR</SelectItem>
                  <SelectItem value="Capacity Building">Capacity Building</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
            </div>
      ) : (
        <ExtractedDataReview
          data={processedData}
          onConfirm={handleConfirmUpload}
          onCancel={handleCancelReview}
          onValidationError={(message) => {
            // Don't close the form on validation error - let user fix the issue
            // Error message is already displayed in the ExtractedDataReview component
          }}
          selectedState={formData.state_id}
          selectedFile={selectedFile}
          tempFileKey={(window as any).__f1_temp_key__}
        />
      )}

      {!isReviewing && (
        <Button type="button" onClick={handleSubmit} disabled={isLoading || !hasRequiredFields()} className="w-full bg-green-700 hover:bg-green-800 text-white font-bold">
          <FileUp className="w-4 h-4 mr-2" />
          {isLoading ? t('fsystem:f1.uploading') : t('fsystem:f1.upload_button')}
        </Button>
      )}

      {/* Create Room Dialog */}
      <Dialog open={showCreateRoomDialog} onOpenChange={setShowCreateRoomDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Emergency Response Room</DialogTitle>
            <DialogDescription>
              Add a new emergency response room for {states.find(s => s.id === formData.state_id)?.state_name || 'the selected state'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="room-locality">Locality *</Label>
                {!showCreateLocality && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setShowCreateLocality(true)}
                    className="h-7 text-xs bg-green-700 hover:bg-green-800 text-white font-bold"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add New Locality
                  </Button>
                )}
              </div>
              {showCreateLocality ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Locality name (English)"
                      value={newLocalityName}
                      onChange={(e) => setNewLocalityName(e.target.value)}
                      disabled={isCreatingLocality}
                      className="flex-1"
                    />
                    <Input
                      placeholder="Locality name (Arabic)"
                      value={newLocalityNameAr}
                      onChange={(e) => setNewLocalityNameAr(e.target.value)}
                      disabled={isCreatingLocality}
                      className="flex-1"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowCreateLocality(false)
                        setNewLocalityName('')
                        setNewLocalityNameAr('')
                      }}
                      disabled={isCreatingLocality}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={async () => {
                        if (!newLocalityName.trim()) {
                          alert('Please enter a locality name')
                          return
                        }
                        if (!formData.state_id) {
                          alert('Please select a state first')
                          return
                        }
                        
                        setIsCreatingLocality(true)
                        try {
                          const selectedState = states.find(s => s.id === formData.state_id)
                          if (!selectedState) {
                            alert('State not found')
                            return
                          }

                          // Create new state row with the new locality
                          const { data: newState, error: createError } = await supabase
                            .from('states')
                            .insert({
                              state_name: selectedState.state_name,
                              state_name_ar: selectedState.state_name_ar,
                              locality: newLocalityName.trim(),
                              locality_ar: newLocalityNameAr.trim() || null,
                              state_short: selectedState.state_short
                            })
                            .select()
                            .single()

                          if (createError) throw createError

                          // Add to available localities and select it
                          const newLocality = {
                            id: newState.id,
                            locality: newState.locality,
                            locality_ar: newState.locality_ar
                          }
                          setAvailableLocalities(prev => [...prev, newLocality])
                          setSelectedLocality(newState.id)
                          setShowCreateLocality(false)
                          setNewLocalityName('')
                          setNewLocalityNameAr('')
                        } catch (error: any) {
                          console.error('Error creating locality:', error)
                          alert('Failed to create locality: ' + (error.message || 'Unknown error'))
                        } finally {
                          setIsCreatingLocality(false)
                        }
                      }}
                      disabled={isCreatingLocality || !newLocalityName.trim()}
                      className="flex-1 bg-green-700 hover:bg-green-800 text-white font-bold"
                    >
                      {isCreatingLocality ? 'Creating...' : 'Create Locality'}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <Select
                    value={selectedLocality}
                    onValueChange={setSelectedLocality}
                    disabled={isCreatingRoom || availableLocalities.length === 0}
                  >
                    <SelectTrigger className="h-[38px] w-full">
                      <SelectValue placeholder={availableLocalities.length === 0 ? "Loading localities..." : "Select locality"} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableLocalities.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id}>
                          {loc.locality || '(No locality)'} {loc.locality_ar ? `(${loc.locality_ar})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {availableLocalities.length === 0 && formData.state_id && (
                    <p className="text-xs text-muted-foreground mt-1">
                      No localities found for this state
                    </p>
                  )}
                </>
              )}
            </div>
            <div>
              <Label htmlFor="room-name">Room Name (English) *</Label>
              <Input
                id="room-name"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder="e.g., North Adila"
                disabled={isCreatingRoom}
              />
            </div>
            <div>
              <Label htmlFor="room-name-ar">Room Name (Arabic)</Label>
              <Input
                id="room-name-ar"
                value={newRoomNameAr}
                onChange={(e) => setNewRoomNameAr(e.target.value)}
                placeholder="e.g., شمال عديلة"
                disabled={isCreatingRoom}
              />
            </div>
            <div>
              <Label>Generated ERR Code</Label>
              <div className="p-3 bg-muted rounded-md font-mono">
                {(() => {
                  const selectedState = states.find(s => s.id === formData.state_id)
                  const stateShort = selectedState?.state_short?.toUpperCase() || 'XX'
                  // This would be calculated when saving, shown as preview
                  return `ERR-${stateShort}-XX-XXX`
                })()}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateRoomDialog(false)
                  setNewRoomName('')
                  setNewRoomNameAr('')
                  setSelectedLocality('')
                  setShowCreateLocality(false)
                  setNewLocalityName('')
                  setNewLocalityNameAr('')
                }}
                disabled={isCreatingRoom}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateRoom}
                disabled={isCreatingRoom || !newRoomName.trim() || !selectedLocality}
              >
                {isCreatingRoom ? 'Creating...' : 'Create Room'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}