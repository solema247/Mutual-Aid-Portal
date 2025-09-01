'use client'

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { FileUp, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import type { Donor, State, F1FormData, EmergencyRoom, Sector, GrantCall, StateAllocation } from '@/app/api/fsystem/types/fsystem'
import ExtractedDataReview from './ExtractedDataReview'
import { cn } from '@/lib/utils'
import StateAllocationTable from './StateAllocationTable'
import { X } from 'lucide-react'

export default function DirectUpload() {
  const { t } = useTranslation(['common', 'fsystem'])
  const [donors, setDonors] = useState<Donor[]>([])
  const [states, setStates] = useState<State[]>([])
  const [rooms, setRooms] = useState<EmergencyRoom[]>([])
  const [sectors, setSectors] = useState<Sector[]>([])
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [grantCalls, setGrantCalls] = useState<GrantCall[]>([])
  const [selectedGrantCall, setSelectedGrantCall] = useState<string>('')
  const [stateAllocations, setStateAllocations] = useState<StateAllocation[]>([])

  interface GrantSerial {
    grant_serial: string;
    grant_call_id: string;
    state_name: string;
    yymm: string;
  }

  const [formData, setFormData] = useState<F1FormData>({
    donor_id: '',
    state_id: '',
    date: '',
    project_id: '',
    emergency_room_id: '',
    file: null,
    primary_sectors: [],
    secondary_sectors: [],
    grant_call_id: '',
    grant_call_state_allocation_id: '',
    grant_serial_id: ''
  })
  
  const [grantSerials, setGrantSerials] = useState<GrantSerial[]>([])
  const [nextWorkplanNumber, setNextWorkplanNumber] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [previewId, setPreviewId] = useState('')
  const [previewSerial, setPreviewSerial] = useState<string>('')
  const [processedData, setProcessedData] = useState<any>(null)
  const [isReviewing, setIsReviewing] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch active grant calls with donor info
        const { data: grantCallsData, error: grantCallsError } = await supabase
          .from('grant_calls')
          .select(`
            id,
            name,
            shortname,
            amount,
            donor:donors!inner (
              id,
              name
            )
          `)
          .eq('status', 'open')
          .order('created_at', { ascending: false })

        if (grantCallsError) throw grantCallsError
        
        // Transform the data to match the GrantCall type
        const transformedGrantCalls: GrantCall[] = grantCallsData.map((grant: any) => ({
          id: grant.id,
          name: grant.name,
          shortname: grant.shortname,
          amount: grant.amount,
          donor: {
            id: grant.donor.id,
            name: grant.donor.name
          }
        }))
        setGrantCalls(transformedGrantCalls)

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
          .not('state_name', 'is', null)
          .order('state_name')

        if (statesError) throw statesError

        // Deduplicate states by state_name
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

  // Fetch state allocations when grant call changes
  useEffect(() => {
    fetchStateAllocations()
  }, [selectedGrantCall])

  const fetchStateAllocations = async () => {
    if (!selectedGrantCall) {
      setStateAllocations([])
      return
    }

    setIsRefreshing(true)
    try {
      // Fetch all allocations for this grant call
      const { data: allocationsData, error: allocationsError } = await supabase
        .from('grant_call_state_allocations')
        .select('*')
        .eq('grant_call_id', selectedGrantCall)
        .order('decision_no', { ascending: false })
        .order('state_name')

      if (allocationsError) throw allocationsError

      // Group by state and get latest decision for each
      const latestByState = allocationsData.reduce((acc, curr) => {
        if (!acc[curr.state_name] || acc[curr.state_name].decision_no < curr.decision_no) {
          acc[curr.state_name] = curr
        }
        return acc
      }, {} as Record<string, any>)

      // Convert back to array and type as StateAllocation[]
      const latestAllocations = Object.values(latestByState) as StateAllocation[]

      // Fetch committed amounts for each allocation
      const allocationsWithAmounts = await Promise.all(
        latestAllocations.map(async (allocation: StateAllocation) => {
          try {
            const response = await fetch(`/api/fsystem/state-allocations/committed?allocation_id=${allocation.id}`)
            if (!response.ok) throw new Error('Failed to fetch committed amounts')
            const { committed, allocated, total_used } = await response.json()
            
            console.log(`Allocation ${allocation.state_name}:`, {
              total_allocation: allocation.amount,
              committed,
              allocated,
              total_used,
              available: allocation.amount - total_used
            })
            
            return {
              ...allocation,
              amount_committed: committed || 0,
              amount_allocated: allocated || 0,
              amount_used: total_used || 0
            } as StateAllocation
          } catch (error) {
            console.error(`Error fetching amounts for ${allocation.state_name}:`, error)
            return {
              ...allocation,
              amount_committed: 0,
              amount_allocated: 0,
              amount_used: 0
            } as StateAllocation
          }
        })
      )

      setStateAllocations(allocationsWithAmounts)
    } catch (error) {
      console.error('Error fetching state allocations:', error)
      setStateAllocations([])
    } finally {
      setIsRefreshing(false)
    }
  }

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

  const fetchGrantSerials = async () => {
    const selectedAlloc = getSelectedAllocation()
    if (!formData.grant_call_id || !formData.date || !selectedAlloc?.state_name) return;

    try {
      const response = await fetch(`/api/fsystem/grant-serials?grant_call_id=${formData.grant_call_id}&state_name=${selectedAlloc.state_name}&yymm=${formData.date}`)
      
      if (!response.ok) throw new Error('Failed to fetch grant serials')
      
      const data = await response.json()
      setGrantSerials(data || [])
    } catch (error) {
      console.error('Error fetching grant serials:', error)
      setGrantSerials([])
    }
  }

  const generateSerialPreview = async () => {
    const selectedAlloc = getSelectedAllocation()
    if (!formData.grant_call_id || !formData.date || !selectedAlloc?.state_name) return;

    try {
      // Get the grant call details to build the serial
      interface DonorWithShortName {
        short_name: string;
      }

      interface GrantCallWithDonor {
        shortname: string;
        donor: DonorWithShortName;
      }

      const { data: grantCall, error: grantError } = await supabase
        .from('grant_calls')
        .select(`
          shortname,
          donor:donors!inner (
            short_name
          )
        `)
        .eq('id', formData.grant_call_id)
        .single<GrantCallWithDonor>()

      if (grantError) throw grantError
      if (!grantCall?.donor?.short_name) throw new Error('Donor short name missing')

      // Get the state details
      const { data: states, error: stateError } = await supabase
        .from('states')
        .select('state_short')
        .eq('state_name', selectedAlloc.state_name)
        .limit(1)

      if (stateError) throw stateError
      if (!states?.length) throw new Error('State not found')

      const state = states[0]
      if (!state.state_short) throw new Error('State short code missing')

      // Get the next serial number (count + 1)
      const { count, error: countError } = await supabase
        .from('grant_serials')
        .select('*', { count: 'exact', head: true })
        .eq('grant_call_id', formData.grant_call_id)
        .eq('state_name', selectedAlloc.state_name)
        .eq('yymm', formData.date)

      if (countError) throw countError

      const nextNumber = (count || 0) + 1
      const paddedSerial = nextNumber.toString().padStart(4, '0')

      // Build the serial string
      const serial = `LCC-${grantCall.donor.short_name}-${state.state_short.toUpperCase()}-${formData.date}-${paddedSerial}`
      
      setPreviewSerial(serial)
      handleInputChange('grant_serial_id', 'new')
    } catch (error) {
      console.error('Error generating serial preview:', error)
      alert(t('fsystem:f1.errors.create_serial_failed'))
    }
  }

  const previewNextWorkplanNumber = async () => {
    if (!formData.grant_serial_id) {
      setNextWorkplanNumber(null)
      setPreviewId('')
      return
    }

    try {
      const response = await fetch(`/api/fsystem/workplans/preview?grant_serial_id=${formData.grant_serial_id}`)
      
      if (!response.ok) throw new Error('Failed to get workplan preview')
      
      const { next_number, preview_id } = await response.json()
      setNextWorkplanNumber(next_number)
      setPreviewId(preview_id)
    } catch (error) {
      console.error('Error getting workplan preview:', error)
      setNextWorkplanNumber(null)
      setPreviewId('')
    }
  }

  // Effect to fetch grant serials when dependencies change
  useEffect(() => {
    fetchGrantSerials()
  }, [formData.grant_call_id, formData.date, formData.grant_call_state_allocation_id])

  // Effect to preview next workplan number when grant serial changes
  useEffect(() => {
    previewNextWorkplanNumber()
  }, [formData.grant_serial_id])

  const hasRequiredFields = () => {
    return (
      formData.donor_id &&
      formData.state_id &&
      formData.date &&
      formData.emergency_room_id &&
      formData.grant_call_state_allocation_id &&
      formData.grant_serial_id
    )
  }

  // Get selected allocation
  const getSelectedAllocation = () => stateAllocations.find(
    alloc => alloc.id === formData.grant_call_state_allocation_id
  )

  const handleInputChange = (field: keyof F1FormData, value: string | string[]) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedFile) {
      alert('Please select a file')
      return
    }

    if (!formData.grant_call_state_allocation_id) {
      alert(t('fsystem:f1.select_allocation_first'))
      return
    }

    // Get the selected allocation
    const allocation = stateAllocations.find(a => a.id === formData.grant_call_state_allocation_id)
    if (!allocation) {
      alert(t('fsystem:f1.allocation_not_found'))
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
        grant_id: previewId,
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
      let grantSerialId = formData.grant_serial_id;

      // If this is a new serial, create it first
      if (grantSerialId === 'new') {
        const selectedAlloc = getSelectedAllocation()
        if (!selectedAlloc) throw new Error('Missing allocation')

        const response = await fetch('/api/fsystem/grant-serials/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            grant_call_id: formData.grant_call_id,
            state_name: selectedAlloc.state_name,
            yymm: formData.date
          })
        })

        if (!response.ok) throw new Error('Failed to create grant serial')
        const newSerial = await response.json()
        grantSerialId = newSerial.grant_serial
      }

      // Get and commit the workplan number
      const response = await fetch('/api/fsystem/workplans/commit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          grant_serial: grantSerialId
        })
      })

      if (!response.ok) {
        throw new Error('Failed to commit workplan number')
      }

      const { workplan_number, grant_id } = await response.json()

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
      const filePath = `f1-forms/${selectedDonor.short_name}/${selectedState.state_short}/${formData.date}/${grant_id}.${fileExtension}`
      
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

          project_id: formData.project_id,
          emergency_room_id: formData.emergency_room_id,
          err_id: selectedRoom.err_code,
          grant_id: grant_id,
          grant_serial_id: formData.grant_serial_id,
          workplan_number: parseInt(workplan_number),
          status: 'pending',
          source: 'mutual_aid_portal',
          state: selectedState.state_name,
          "Sector (Primary)": primarySectorNames,
          "Sector (Secondary)": secondarySectorNames,
          grant_call_id: formData.grant_call_id,
          grant_call_state_allocation_id: formData.grant_call_state_allocation_id,
          funding_status: 'allocated'  // Since we're linking it to an allocation
        }])

      if (insertError) {
        throw insertError
      }

      // Update Google Sheet with final grant ID and sectors
      const sheetData = {
        ...editedData,
            grant_id: grant_id,
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
        project_id: '',
        emergency_room_id: '',
        file: null,
        primary_sectors: [],
        secondary_sectors: [],
        grant_call_id: '',
        grant_call_state_allocation_id: '',
        grant_serial_id: ''
      })
      setSelectedFile(null)
      setPreviewId('')
      setPreviewSerial('')
      setProcessedData(null)
      setIsReviewing(false)
      
      // Refresh state allocations to show updated amounts
      await fetchStateAllocations()

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

  // Get selected allocation info
  const selectedAllocation = stateAllocations.find(
    alloc => alloc.id === formData.grant_call_state_allocation_id
  )

  return (
    <div className="space-y-6">
      {!isReviewing && (
        <div className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label className="mb-2">{t('fsystem:f1.select_grant')}</Label>
                <Select
                  value={selectedGrantCall}
                  onValueChange={(value) => {
                    setSelectedGrantCall(value)
                    setFormData(prev => ({
                      ...prev,
                      grant_call_id: value,
                      grant_call_state_allocation_id: '',
                      state_id: '',
                      donor_id: grantCalls.find(g => g.id === value)?.donor?.id || ''
                    }))
                    // Clear form ID when grant call changes
                    setPreviewId('')
                    setPreviewSerial('')
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('fsystem:f1.select_grant_placeholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {grantCalls.map((grant) => (
                      <SelectItem key={grant.id} value={grant.id}>
                        {grant.name} ({grant.donor.name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedGrantCall && (
              <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm text-muted-foreground">{t('fsystem:f1.grant_amount')}</Label>
                      <div className="text-lg font-semibold">
                        {grantCalls.find(g => g.id === selectedGrantCall)?.amount.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">{t('fsystem:f1.donor')}</Label>
                      <div className="text-lg font-semibold">
                        {grantCalls.find(g => g.id === selectedGrantCall)?.donor.name}
                      </div>
                    </div>
                  </div>

                  {stateAllocations.length > 0 && (
                    <StateAllocationTable
                      allocations={stateAllocations}
                      selectedAllocationId={formData.grant_call_state_allocation_id}
                      onSelectAllocation={(id) => {
                        setFormData(prev => ({
                          ...prev,
                          grant_call_state_allocation_id: id,
                          state_id: states.find(s => s.state_name === stateAllocations.find(a => a.id === id)?.state_name)?.id || ''
                        }))
                        // Clear form ID when allocation changes
                        setPreviewId('')
                        setPreviewSerial('')
                      }}
                      onRefresh={fetchStateAllocations}
                      isRefreshing={isRefreshing}
                    />
                  )}
                </div>
              )}
            </div>
        </div>
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

                    {/* Main Form Grid */}
          <div className="grid grid-cols-3 gap-4">
            {/* First Row: Donor, State, ERR */}
            <div className="col-span-1">
                  <Label className="mb-2">{t('fsystem:f1.donor')}</Label>
                  <Select
                    value={formData.donor_id}
                    onValueChange={(value) => handleInputChange('donor_id', value)}
                  >
                                <SelectTrigger className="h-[38px] w-full">
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

            <div className="col-span-1">
                  <Label className="mb-2">{t('fsystem:f1.state')}</Label>
              <div className="relative">
                <Input
                  value={states.find(s => s.id === formData.state_id)?.state_name || ''}
                  readOnly
                  className="bg-muted h-[38px] w-full"
                />
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-muted-foreground">
                  <span className="text-[10px]">{t('fsystem:f1.auto_from_allocation')}</span>
                </div>
              </div>
                </div>

            <div className="col-span-1">
                  <Label className="mb-2">{t('fsystem:f1.emergency_response_room')}</Label>
                  <Select
                    value={formData.emergency_room_id}
                    onValueChange={(value) => handleInputChange('emergency_room_id', value)}
                    disabled={!formData.state_id || rooms.length === 0}
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

                        {/* Second Row: Primary and Secondary Sectors */}
                        <div className="col-span-3/2">
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

                <div className="col-span-3/2">
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

            {/* Third Row: Date and Grant Serial */}
                <div className="col-span-3 md:col-span-1">
                  <Label className="mb-2">{t('fsystem:f1.date')}</Label>
                  <Input
                    placeholder={t('fsystem:f1.date_placeholder')}
                    value={formData.date}
                    onChange={(e) => handleInputChange('date', e.target.value)}
                    maxLength={4}
                    pattern="[0-9]{4}"
                className="font-mono h-[38px] w-full"
                  />
                </div>

            <div className="col-span-3/2">
                  <Label className="mb-2">{t('fsystem:f1.grant_serial')}</Label>
              <Select
                value={formData.grant_serial_id}
                onValueChange={(value) => {
                  if (value === 'new') {
                    generateSerialPreview()
                  } else {
                    setPreviewSerial('')
                    handleInputChange('grant_serial_id', value)
                  }
                }}
                disabled={!formData.date || !selectedAllocation}
              >
                <SelectTrigger className="h-[38px] w-full">
                  <SelectValue placeholder={t('fsystem:f1.select_grant_serial')} />
                </SelectTrigger>
                <SelectContent>
                  {grantSerials.map((serial) => (
                    <SelectItem key={serial.grant_serial} value={serial.grant_serial}>
                      {serial.grant_serial}
                    </SelectItem>
                  ))}
                  {formData.date && selectedAllocation && (
                    <SelectItem key="new" value="new">
                      {t('fsystem:f1.create_new_serial')}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
                </div>
              </div>

              {/* Generated Form ID */}
          <div className="mt-3">
            <Label className="mb-1">{t('fsystem:f1.generated_id')}</Label>
            <div className="mt-1 p-2 bg-muted rounded-md font-mono min-h-[2.5rem] flex items-center">
              {previewSerial || previewId || (
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
      ) : (
        <ExtractedDataReview
          data={processedData}
          onConfirm={handleConfirmUpload}
          onCancel={handleCancelReview}
          allocationInfo={{
            amount: selectedAllocation?.amount || 0,
            amountUsed: selectedAllocation?.amount_used || 0,
            stateName: selectedAllocation?.state_name || '',
            grantName: grantCalls.find(g => g.id === selectedGrantCall)?.name || ''
          }}
          onValidationError={(message) => {
            alert(message)
            setIsReviewing(false)
          }}
        />
      )}

      {!isReviewing && (
        <Button type="button" onClick={handleSubmit} disabled={isLoading} className="w-full">
          <FileUp className="w-4 h-4 mr-2" />
          {isLoading ? t('fsystem:f1.uploading') : t('fsystem:f1.upload_button')}
        </Button>
      )}
    </div>
  )
}