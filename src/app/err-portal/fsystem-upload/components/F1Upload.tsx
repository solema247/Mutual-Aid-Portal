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
import type { Donor, State, F1FormData, EmergencyRoom, Sector } from '@/app/api/fsystem/types/fsystem'
import ExtractedDataReview from './ExtractedDataReview'
import { cn } from '@/lib/utils'
import { MultiSelect, MultiSelectContent, MultiSelectItem, MultiSelectTrigger, MultiSelectValue } from "@/components/ui/multi-select"
import { X } from 'lucide-react'

export default function F1Upload() {
  const { t } = useTranslation(['common', 'fsystem'])
  const [donors, setDonors] = useState<Donor[]>([])
  const [states, setStates] = useState<State[]>([])
  const [rooms, setRooms] = useState<EmergencyRoom[]>([])
  const [sectors, setSectors] = useState<Sector[]>([])
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [formData, setFormData] = useState<F1FormData>({
    donor_id: '',
    state_id: '',
    date: '',
    grant_serial: '',
    project_id: '',
    emergency_room_id: '',
    file: null,
    primary_sectors: [],
    secondary_sectors: []
  })
  const [isLoading, setIsLoading] = useState(false)
  const [previewId, setPreviewId] = useState('')
  const [processedData, setProcessedData] = useState<any>(null)
  const [isReviewing, setIsReviewing] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch donors
        const { data: donorsData, error: donorsError } = await supabase
          .from('donors')
          .select('*')
          .eq('status', 'active')
        
        if (donorsError) throw donorsError
        setDonors(donorsData)

        // Fetch states with distinct state names
        const { data: statesData, error: statesError } = await supabase
          .from('states')
          .select('id, state_name, state_name_ar, state_short')
          .not('state_name', 'is', null)  // Ensure state_name is not null
          .order('state_name')

        if (statesError) throw statesError

        // Deduplicate states by state_name, keeping the first occurrence
        const uniqueStates = statesData.filter((state, index, self) =>
          index === self.findIndex((s) => s.state_name === state.state_name)
        )
        
        setStates(uniqueStates)

        // Fetch sectors
        const { data: sectorsData, error: sectorsError } = await supabase
          .from('sectors')
          .select('*')
          .order('sector_name_en')

        if (sectorsError) throw sectorsError
        setSectors(sectorsData)
      } catch (error) {
        console.error('Error fetching data:', error)
      }
    }

    fetchData()
  }, [])

  // Fetch rooms when state changes
  useEffect(() => {
    const fetchRooms = async () => {
      if (!formData.state_id) {
        setRooms([])
        return
      }

      try {
        // Get all states with the same state_name as the selected state
        const selectedState = states.find(s => s.id === formData.state_id)
        if (!selectedState) return

        const { data: allStateIds, error: stateError } = await supabase
          .from('states')
          .select('id')
          .eq('state_name', selectedState.state_name)

        if (stateError) throw stateError

        // Get rooms for all localities of the selected state
        const stateIds = allStateIds.map(s => s.id)
        const { data: roomsData, error: roomsError } = await supabase
          .from('emergency_rooms')
          .select('*')
          .in('state_reference', stateIds)
          .eq('status', 'active')

        if (roomsError) throw roomsError
        setRooms(roomsData)

        // Clear selected room if state changes
        setFormData(prev => ({ ...prev, emergency_room_id: '' }))
      } catch (error) {
        console.error('Error fetching rooms:', error)
      }
    }

    fetchRooms()
  }, [formData.state_id, states])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      if (file.type === 'application/pdf' || file.type === 'application/msword' || 
          file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        setSelectedFile(file)
        setFormData(prev => ({ ...prev, file }))
      } else {
        alert('Please select a PDF or Word document')
      }
    }
  }

  const hasRequiredFields = () => {
    return (
      formData.donor_id &&
      formData.state_id &&
      formData.date &&
      formData.grant_serial?.length === 4 &&  // Only when grant serial is complete
      formData.emergency_room_id
    )
  }

  const generateBasePattern = () => {
    const selectedDonor = donors.find(d => d.id === formData.donor_id)
    const selectedState = states.find(s => s.id === formData.state_id)
    const selectedRoom = rooms.find(r => r.id === formData.emergency_room_id)
    
    if (!selectedDonor?.short_name || !selectedState?.state_short || !selectedRoom?.err_code) return ''
    if (!hasRequiredFields()) return ''

    // Use state_short instead of first 2 letters
    const stateCode = selectedState.state_short.toUpperCase()
    
    // Format date (MMYY)
    const dateStr = formData.date

    // Create base pattern
    return `LCC-${selectedDonor.short_name}-${stateCode}-${dateStr}-${formData.grant_serial}`
  }

  const getNextSequenceNumber = async (basePattern: string, previewOnly: boolean = true) => {
    try {
      const response = await fetch('/api/fsystem/next-sequence', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          base_pattern: basePattern,
          preview_only: previewOnly
        })
      })

      if (!response.ok) {
        throw new Error('Failed to get next sequence number')
      }

      const { padded_number } = await response.json()
      return padded_number
    } catch (error) {
      console.error('Error getting sequence number:', error)
      throw error
    }
  }

  const generatePreviewPattern = async () => {
    const selectedDonor = donors.find(d => d.id === formData.donor_id)
    const selectedState = states.find(s => s.id === formData.state_id)
    
    let pattern = 'LCC'

    if (selectedDonor?.short_name) {
      pattern += `-${selectedDonor.short_name}`
    } else {
      pattern += '-___' // Placeholder for donor
    }

    if (selectedState?.state_short) {
      pattern += `-${selectedState.state_short.toUpperCase()}`
    } else {
      pattern += '-__' // Placeholder for state
    }

    if (formData.date) {
      pattern += `-${formData.date}`
    } else {
      pattern += '-____' // Placeholder for date
    }

    if (formData.grant_serial) {
      pattern += `-${formData.grant_serial}`
      
      // If we have all required fields, try to get the next sequence number
      if (selectedDonor?.short_name && selectedState?.state_short && formData.date) {
        try {
          const basePattern = `LCC-${selectedDonor.short_name}-${selectedState.state_short.toUpperCase()}-${formData.date}-${formData.grant_serial}`
          const response = await fetch('/api/fsystem/next-sequence', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
              base_pattern: basePattern,
              preview_only: true
            })
          })

          if (response.ok) {
            const { padded_number } = await response.json()
            return `${pattern}-${padded_number}`
          }
        } catch (error) {
          console.error('Error previewing sequence:', error)
        }
      }
      pattern += '-XXX' // Fallback to placeholder
    } else {
      pattern += '-____-XXX' // Placeholder for grant serial and sequence
    }

    return pattern
  }

  useEffect(() => {
    // Update preview pattern whenever form data changes
    const updatePattern = async () => {
      const pattern = await generatePreviewPattern()
      setPreviewId(pattern)
    }
    updatePattern()
  }, [formData.donor_id, formData.state_id, formData.date, formData.grant_serial])

  const handleInputChange = (field: keyof F1FormData, value: string | string[]) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedFile) {
      alert('Please select a file')
      return
    }

    setIsLoading(true)
    try {
      const selectedDonor = donors.find(d => d.id === formData.donor_id)
      const selectedState = states.find(s => s.id === formData.state_id)
      const selectedRoom = rooms.find(r => r.id === formData.emergency_room_id)

      // Process the file first
      const processFormData = new FormData()
      processFormData.append('file', selectedFile)

      // Add metadata for initial processing - use preview ID
      const metadata = {
        grant_id: previewId, // Use preview pattern
        err_code: selectedRoom?.err_code,
        err_name: selectedRoom?.name_ar || selectedRoom?.name,
        donor_name: selectedDonor?.name,
        state_name: selectedState?.state_name,
        state_name_ar: selectedState?.state_name_ar,
        state_id: selectedState?.id
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
      alert('Error processing form. Please try again.')
      setIsLoading(false)
    }
  }

  const handleConfirmUpload = async (editedData: any) => {
    setIsLoading(true)
    try {
      const basePattern = generateBasePattern()
      if (!basePattern) {
        throw new Error('Missing required information')
      }

      // Get and commit the sequence number after user confirms
      const finalSequenceNumber = await getNextSequenceNumber(basePattern, false)
      const finalGrantId = `${basePattern}-${finalSequenceNumber}`

      const selectedDonor = donors.find(d => d.id === formData.donor_id)
      const selectedState = states.find(s => s.id === formData.state_id)
      const selectedRoom = rooms.find(r => r.id === formData.emergency_room_id)

      if (!selectedFile || !selectedDonor?.short_name || !selectedState?.state_name || !selectedRoom?.err_code) {
        throw new Error('Missing required information')
      }

      // Get sector names for selected IDs
      const { data: primarySectorData, error: primaryError } = await supabase
        .from('sectors')
        .select('sector_name_en')
        .in('id', formData.primary_sectors)

      if (primaryError) throw primaryError

      const { data: secondarySectorData, error: secondaryError } = await supabase
        .from('sectors')
        .select('sector_name_en')
        .in('id', formData.secondary_sectors)

      if (secondaryError) throw secondaryError

      const primarySectorNames = primarySectorData.map(s => s.sector_name_en).join(', ')
      const secondarySectorNames = secondarySectorData.map(s => s.sector_name_en).join(', ')

      // Get file extension and generate path
      const fileExtension = selectedFile.name.split('.').pop()
      const filePath = `f1-forms/${selectedDonor.short_name}/${selectedState.state_short}/${formData.date}/${finalGrantId}.${fileExtension}`
      
      // Upload file to Supabase storage
      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(filePath, selectedFile, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) {
        throw uploadError
      }

      // Insert into Supabase with final grant ID and sectors
      const { error: insertError } = await supabase
        .from('err_projects')
        .insert([{
          ...editedData,
          donor_id: formData.donor_id,
          grant_serial: formData.grant_serial,
          project_id: formData.project_id,
          emergency_room_id: formData.emergency_room_id,
          err_id: selectedRoom.err_code,
          grant_id: finalGrantId,
          status: 'pending',
          source: 'mutual_aid_portal',
          state: selectedState.state_name,
          "Sector (Primary)": primarySectorNames,
          "Sector (Secondary)": secondarySectorNames
        }])

      if (insertError) {
        throw insertError
      }

      // Update Google Sheet with final grant ID and sectors
      const sheetData = {
        ...editedData,
        grant_id: finalGrantId,
        err_id: selectedRoom.err_code,
        err_name: selectedRoom.name_ar || selectedRoom.name,
        donor_name: selectedDonor.name,
        emergency_room_id: formData.emergency_room_id,
        state_name: selectedState.state_name,
        primary_sectors: primarySectorNames,
        secondary_sectors: secondarySectorNames
      }

      const sheetResponse = await fetch('/api/sheets/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sheetData)
      })

      if (!sheetResponse.ok) {
        console.error('Failed to update Google Sheet:', await sheetResponse.json())
      }

      alert('Form uploaded successfully!')
      setFormData({
        donor_id: '',
        state_id: '',
        date: '',
        grant_serial: '',
        project_id: '',
        emergency_room_id: '',
        file: null,
        primary_sectors: [],
        secondary_sectors: []
      })
      setSelectedFile(null)
      setPreviewId('')
      setProcessedData(null)
      setIsReviewing(false)

    } catch (error) {
      console.error('Error uploading form:', error)
      alert('Error uploading form. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancelReview = () => {
    setProcessedData(null)
    setIsReviewing(false)
  }

  if (isReviewing) {
    return (
      <ExtractedDataReview
        data={processedData}
        onConfirm={handleConfirmUpload}
        onCancel={handleCancelReview}
      />
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {/* File Upload */}
              <div>
                <Label className="mb-2">{t('fsystem:f1.upload_label')}</Label>
                <Input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={handleFileChange}
                  className="mt-1"
                />
              </div>

              {/* Main Selectors in One Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="mb-2">{t('fsystem:f1.donor')}</Label>
                  <Select
                    value={formData.donor_id}
                    onValueChange={(value) => handleInputChange('donor_id', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('fsystem:f1.select_donor')} />
                    </SelectTrigger>
                    <SelectContent>
                      {donors.map((donor) => (
                        <SelectItem key={donor.id} value={donor.id}>
                          {donor.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="mb-2">{t('fsystem:f1.state')}</Label>
                  <Select
                    value={formData.state_id}
                    onValueChange={(value) => handleInputChange('state_id', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('fsystem:f1.select_state')} />
                    </SelectTrigger>
                    <SelectContent>
                      {states.map((state) => (
                        <SelectItem key={state.id} value={state.id}>
                          {state.state_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="mb-2">{t('fsystem:f1.emergency_response_room')}</Label>
                  <Select
                    value={formData.emergency_room_id}
                    onValueChange={(value) => handleInputChange('emergency_room_id', value)}
                    disabled={!formData.state_id || rooms.length === 0}
                  >
                    <SelectTrigger>
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
              </div>

              {/* Sector Selection */}
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
                    <SelectTrigger>
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
                    <div className="flex flex-wrap gap-2 mt-2">
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
                    <SelectTrigger>
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
                    <div className="flex flex-wrap gap-2 mt-2">
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

              {/* Small Fields in 3 Columns */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="mb-2">{t('fsystem:f1.date')}</Label>
                  <Input
                    placeholder={t('fsystem:f1.date_placeholder')}
                    value={formData.date}
                    onChange={(e) => handleInputChange('date', e.target.value)}
                    maxLength={4}
                    pattern="[0-9]{4}"
                  />
                </div>

                <div>
                  <Label className="mb-2">{t('fsystem:f1.grant_serial')}</Label>
                  <Input
                    placeholder={t('fsystem:f1.grant_serial_placeholder')}
                    value={formData.grant_serial}
                    onChange={(e) => {
                      const value = e.target.value
                      // Only update if it's empty or matches the pattern
                      if (!value || /^\d{1,4}$/.test(value)) {
                        handleInputChange('grant_serial', value)
                      }
                    }}
                    maxLength={4}
                    pattern="[0-9]{4}"
                  />
                </div>
              </div>

              {/* Generated Form ID - Show as soon as we start entering data */}
              <div className="pt-4">
                <Label className="mb-2">{t('fsystem:f1.generated_id')}</Label>
                <div className="mt-1 p-3 bg-muted rounded-md font-mono min-h-[2.5rem] flex items-center">
                  {previewId || (
                    <span className="text-muted-foreground text-sm">
                      {hasRequiredFields() 
                        ? t('fsystem:f1.generating') 
                        : t('fsystem:f1.complete_fields')}
                    </span>
                  )}
                </div>
                {previewId && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('fsystem:f1.preview_note')}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Button type="submit" disabled={isLoading} className="w-full">
        <FileUp className="w-4 h-4 mr-2" />
        {isLoading ? t('fsystem:f1.uploading') : t('fsystem:f1.upload_button')}
      </Button>
    </form>
  )
} 