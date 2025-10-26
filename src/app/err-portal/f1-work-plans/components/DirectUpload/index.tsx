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
import type { F1FormData, EmergencyRoom, Sector, State } from '@/app/api/fsystem/types/fsystem'
import ExtractedDataReview from './ExtractedDataReview'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

export default function DirectUpload() {
  const { t } = useTranslation(['common', 'fsystem'])
  const [rooms, setRooms] = useState<EmergencyRoom[]>([])
  const [states, setStates] = useState<State[]>([])
  const [sectors, setSectors] = useState<Sector[]>([])
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
    exchange_rate: 2700
  })
  
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [processedData, setProcessedData] = useState<any>(null)
  const [isReviewing, setIsReviewing] = useState(false)
  

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch sectors
        const { data: sectorsData, error: sectorsError } = await supabase
          .from('sectors')
          .select('*')
          .order('sector_name_en')

        if (sectorsError) throw sectorsError
        setSectors(sectorsData)

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
          .select('*')
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

  // Removed cycle/serial preview logic in upload-first flow

  const hasRequiredFields = () => !!(selectedFile && formData.state_id && formData.emergency_room_id)

  // No allocation selection in upload-first flow

  const handleInputChange = (field: keyof F1FormData, value: string | string[] | number) => {
    setFormData(prev => ({ ...prev, [field]: value }))
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

      // Process the file first
      const processFormData = new FormData()
      processFormData.append('file', selectedFile)

      // Add minimal metadata for initial processing
      const selectedState = states.find(s => s.id === formData.state_id)
      const metadata = {
        err_code: selectedRoom?.err_code,
        err_name: selectedRoom?.name_ar || selectedRoom?.name,
        donor_name: null,
        state_name: selectedState?.state_name || null,
        state_name_ar: selectedState?.state_name_ar || null,
        state_id: selectedState?.id || null,
        locality: selectedState?.locality || null,
        locality_ar: selectedState?.locality_ar || null,
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

      // Convert expenses to DB format (USD only)
      const expensesForDB = (translatedData.expenses || []).map((e: any) => ({ activity: e.activity, total_cost: e.total_cost_usd || 0 }))

      // Sector names
      const primaryNames = sectors.filter(s => formData.primary_sectors.includes(s.id)).map(s => s.sector_name_en).join(', ')
      const secondaryNames = sectors.filter(s => formData.secondary_sectors.includes(s.id)).map(s => s.sector_name_en).join(', ')

      // ERR room
      const selectedRoom = (rooms as any[]).find(r => r.id === formData.emergency_room_id)

      // Prepare data for DB - remove metadata fields that will be set in F2
      const { form_currency, exchange_rate, raw_ocr, _selected_state_name, _selected_grant_call_id, _yymm, _existing_serial, _selected_funding_cycle_id, _cycle_state_allocation_id, ...dataForDB } = translatedData

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
          project_id: formData.project_id,
          emergency_room_id: formData.emergency_room_id,
          err_id: selectedRoom?.err_code || null,
          status: 'pending_metadata', // New status for files awaiting metadata
          source: 'mutual_aid_portal',
          state: stateName,
          "Sector (Primary)": primaryNames,
          "Sector (Secondary)": secondaryNames,
          temp_file_key: tempKey, // Store temp file path
          original_text: originalText,
          language: sourceLanguage,
          // Remove these fields - will be set in F2:
          // donor_id: null,
          // grant_call_id: null,
          // funding_cycle_id: null,
          // grant_id: null,
          // grant_serial: null,
          // workplan_number: null
        }])
      if (insertError) throw insertError

      alert('F1 workplan uploaded successfully! File will be moved to final location after F2 approval.')
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
        exchange_rate: 2700
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

    const translateExpenses = async (expenses: any[]): Promise<any[]> => {
      if (!Array.isArray(expenses) || expenses.length === 0) return []
      
      const translatedExpenses = []
      for (const expense of expenses) {
        const translatedActivity = await translateText(expense.activity)
        translatedExpenses.push({
          ...expense,
          activity: translatedActivity || expense.activity
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
      planned_activities: Array.isArray(data.planned_activities) ? [...data.planned_activities] : [],
      expenses: Array.isArray(data.expenses) ? data.expenses.map((e: any) => ({ activity: e.activity })) : []
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
    translatedData.planned_activities = await translateArray(data.planned_activities)
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
            
            {/* No date/serial selection in upload-first step */}
              </div>

          {/* Row 4: Primary and Secondary Sectors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="mb-2">{t('fsystem:f1.primary_sectors')}</Label>
              <Select
                value={formData.primary_sectors[0] || ''}
                onValueChange={(value) => {
                  if (!value) return
                  const newValues = [...formData.primary_sectors]
                  if (!newValues.includes(value)) {
                    newValues.push(value)
                    handleInputChange('primary_sectors', newValues)
                  }
                }}
              >
                <SelectTrigger className="h-[38px] w-full">
                  <SelectValue placeholder={t('fsystem:f1.select_primary_sectors')}>
                    {formData.primary_sectors.length > 0
                      ? `${formData.primary_sectors.length} selected`
                      : t('fsystem:f1.select_primary_sectors')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {sectors
                    .filter(sector => !formData.primary_sectors.includes(sector.id))
                    .map((sector) => (
                      <SelectItem key={sector.id} value={sector.id}>
                        {sector.sector_name_en} {sector.sector_name_ar && `(${sector.sector_name_ar})`}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {formData.primary_sectors.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {formData.primary_sectors.map(sectorId => {
                    const sector = sectors.find(s => s.id === sectorId)
                    if (!sector) return null
                    return (
                      <Button
                        key={sector.id}
                        variant="secondary"
                        size="sm"
                        className="bg-emerald-100 hover:bg-emerald-200 text-emerald-700 border-emerald-200"
                        onClick={() => {
                          const newValues = formData.primary_sectors.filter(id => id !== sector.id)
                          handleInputChange('primary_sectors', newValues)
                        }}
                      >
                        {sector.sector_name_en}
                        <X className="w-4 h-4 ml-2" />
                      </Button>
                    )
                  })}
                </div>
              )}
            </div>

            <div>
              <Label className="mb-2">{t('fsystem:f1.secondary_sectors')}</Label>
              <Select
                value={formData.secondary_sectors[0] || ''}
                onValueChange={(value) => {
                  if (!value) return
                  const newValues = [...formData.secondary_sectors]
                  if (!newValues.includes(value)) {
                    newValues.push(value)
                    handleInputChange('secondary_sectors', newValues)
                  }
                }}
              >
                <SelectTrigger className="h-[38px] w-full">
                  <SelectValue placeholder={t('fsystem:f1.select_secondary_sectors')}>
                    {formData.secondary_sectors.length > 0
                      ? `${formData.secondary_sectors.length} selected`
                      : t('fsystem:f1.select_secondary_sectors')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {sectors
                    .filter(sector => !formData.secondary_sectors.includes(sector.id))
                    .map((sector) => (
                      <SelectItem key={sector.id} value={sector.id}>
                        {sector.sector_name_en} {sector.sector_name_ar && `(${sector.sector_name_ar})`}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {formData.secondary_sectors.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {formData.secondary_sectors.map(sectorId => {
                    const sector = sectors.find(s => s.id === sectorId)
                    if (!sector) return null
                    return (
                      <Button
                        key={sector.id}
                        variant="secondary"
                        size="sm"
                        className="bg-emerald-100 hover:bg-emerald-200 text-emerald-700 border-emerald-200"
                        onClick={() => {
                          const newValues = formData.secondary_sectors.filter(id => id !== sector.id)
                          handleInputChange('secondary_sectors', newValues)
                        }}
                      >
                        {sector.sector_name_en}
                        <X className="w-4 h-4 ml-2" />
                      </Button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
            </div>
      ) : (
        <ExtractedDataReview
          data={processedData}
          onConfirm={handleConfirmUpload}
          onCancel={handleCancelReview}
          onValidationError={(message) => {
            alert(message)
            setIsReviewing(false)
          }}
          selectedState={formData.state_id}
          selectedFile={selectedFile}
          tempFileKey={(window as any).__f1_temp_key__}
        />
      )}

      {!isReviewing && (
        <Button type="button" onClick={handleSubmit} disabled={isLoading || !hasRequiredFields()} className="w-full">
          <FileUp className="w-4 h-4 mr-2" />
          {isLoading ? t('fsystem:f1.uploading') : t('fsystem:f1.upload_button')}
        </Button>
      )}
    </div>
  )
}