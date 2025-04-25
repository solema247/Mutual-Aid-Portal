'use client'

import React, { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { CollapsibleRow } from '@/components/ui/collapsible'
import Papa from 'papaparse'
import { FileInput } from '@/components/ui/file-input'
import { ViewForecasts } from './components/ViewForecasts'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Plus, Trash2 } from 'lucide-react'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June', 
  'July', 'August', 'September', 'October', 'November', 'December'
]
const YEAR = '2025'

type ForecastData = {
  country: {
    [month: string]: string
  }
  states: {
    [stateId: string]: {
      [month: string]: string
    }
  }
}

type CSVRow = {
  Month: string
  State: string
  Amount: string
  Localities: string
  'Org Name': string
  Intermediary: string
  'Transfer Method': string
  Source: string
  'Receiving MAG': string
  Status: string
  [key: string]: string
}

// Add new type for form entries
type ForecastEntry = {
  id: string
  month: string
  state: string
  amount: string
  localities: string
  org_name: string
  intermediary: string
  transfer_method: string
  source: string
  receiving_mag: string
  status: 'planned' | 'complete'
}

// Update DonorData type to include user_id
type DonorData = {
  donor_id: string
  user_id: string  // Add this field
  donors: {
    id: string
    name: string
    org_type: string
  }
}

const parseDate = (dateStr: string): Date | null => {
  try {
    // Case 1: Already in YYYY-MM-DD format
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const date = new Date(dateStr)
      return new Date(date.getFullYear(), date.getMonth(), 1)
    }

    // Case 2: MMM-YY format (e.g., "Jan-25")
    if (dateStr.match(/^[A-Za-z]{3}-\d{2}$/)) {
      const [month, year] = dateStr.split('-')
      const monthMap: { [key: string]: string } = {
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
        'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
        'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
      }
      const monthNum = monthMap[month.toLowerCase()]
      if (!monthNum) return null
      return new Date(`20${year}-${monthNum}-01`)
    }

    // Case 3: MM/DD/YY or MM/DD/YYYY
    if (dateStr.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}$/)) {
      const [month, _, year] = dateStr.split('/')
      const fullYear = year.length === 2 ? `20${year}` : year
      return new Date(`${fullYear}-${month.padStart(2, '0')}-01`)
    }

    // Case 4: DD-MMM-YYYY or DD-MMM-YY
    if (dateStr.match(/^\d{1,2}-[A-Za-z]{3}-\d{2,4}$/)) {
      const [_, month, year] = dateStr.split('-')
      const monthMap: { [key: string]: string } = {
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
        'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
        'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
      }
      const monthNum = monthMap[month.toLowerCase()]
      if (!monthNum) return null
      const fullYear = year.length === 2 ? `20${year}` : year
      return new Date(`${fullYear}-${monthNum}-01`)
    }

    return null
  } catch (err) {
    return null
  }
}

// Create a new component for the form row
const EntryFormRow = ({ 
  entry, 
  onChange, 
  onDelete,
  onAdd,
  states, 
  months
}: { 
  entry: ForecastEntry
  onChange: (entry: ForecastEntry) => void
  onDelete: () => void
  onAdd: () => void
  states: { id: string; state_name: string }[]
  months: string[]
}) => {
  const [localEntry, setLocalEntry] = useState(entry)

  // Separate handlers for text inputs and select inputs
  const handleTextChange = (field: keyof ForecastEntry, value: string) => {
    const updatedEntry = {
      ...localEntry,
      [field]: value
    }
    setLocalEntry(updatedEntry)
  }

  const handleSelectChange = (field: keyof ForecastEntry, value: string) => {
    const updatedEntry = {
      ...localEntry,
      [field]: value
    }
    setLocalEntry(updatedEntry)
    onChange(updatedEntry) // Update parent immediately for select inputs
  }

  // Update parent when text input loses focus
  const handleBlur = () => {
    onChange(localEntry)
  }

  return (
    <tr className="border-t">
      <td className="p-2">
        <Select 
          value={localEntry.month} 
          onValueChange={(value) => handleSelectChange('month', value)}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            {months.map((month) => (
              <SelectItem 
                key={month} 
                value={`${YEAR}-${String(months.indexOf(month) + 1).padStart(2, '0')}`}
              >
                {month} {YEAR}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="p-2">
        <Select 
          value={localEntry.state}
          onValueChange={(value) => handleSelectChange('state', value)}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder="State" />
          </SelectTrigger>
          <SelectContent>
            {states.map((state) => (
              <SelectItem key={state.id} value={state.state_name}>
                {state.state_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="p-2">
        <Input
          type="text"
          inputMode="numeric"
          value={localEntry.amount}
          onChange={(e) => handleTextChange('amount', e.target.value.replace(/[^\d.]/g, ''))}
          onBlur={handleBlur}
          className="h-8"
        />
      </td>
      <td className="p-2">
        <Input
          value={localEntry.localities}
          onChange={(e) => handleTextChange('localities', e.target.value)}
          onBlur={handleBlur}
          className="h-8"
        />
      </td>
      <td className="p-2">
        <Input
          value={localEntry.intermediary}
          onChange={(e) => handleTextChange('intermediary', e.target.value)}
          onBlur={handleBlur}
          className="h-8"
        />
      </td>
      <td className="p-2">
        <Input
          value={localEntry.transfer_method}
          onChange={(e) => handleTextChange('transfer_method', e.target.value)}
          onBlur={handleBlur}
          className="h-8"
        />
      </td>
      <td className="p-2">
        <Select 
          value={localEntry.source}
          onValueChange={(value) => handleSelectChange('source', value)}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Private">Private</SelectItem>
            <SelectItem value="UN">UN</SelectItem>
            <SelectItem value="Governmental">Governmental</SelectItem>
          </SelectContent>
        </Select>
      </td>
      <td className="p-2">
        <Input
          value={localEntry.receiving_mag}
          onChange={(e) => handleTextChange('receiving_mag', e.target.value)}
          onBlur={handleBlur}
          className="h-8"
        />
      </td>
      <td className="p-2">
        <Select 
          value={localEntry.status}
          onValueChange={(value: 'planned' | 'complete') => handleSelectChange('status', value)}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="planned">Planned</SelectItem>
            <SelectItem value="complete">Complete</SelectItem>
          </SelectContent>
        </Select>
      </td>
      <td className="p-2">
        <div className="flex items-center gap-1 justify-center">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={onDelete}
            className="h-8 w-8 text-destructive hover:text-destructive/80"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={onAdd}
            className="h-8 w-8"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  )
}

export default function ForecastPage() {
  const router = useRouter()
  const [donors, setDonors] = useState<{ id: string; name: string }[]>([])
  const [clusters, setClusters] = useState<{ id: string; name: string }[]>([])
  const [states, setStates] = useState<{ id: string; state_name: string }[]>([])
  const [selectedDonor, setSelectedDonor] = useState<string>('')
  const [selectedCluster, setSelectedCluster] = useState<string>('')
  const [forecastData, setForecastData] = useState<ForecastData>({
    country: {},
    states: {}
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [rows, setRows] = useState<ForecastEntry[]>(() => 
    Array(5).fill(null).map(() => ({
      id: crypto.randomUUID(),
      month: '',
      state: '',
      amount: '',
      localities: '',
      org_name: '', 
      intermediary: '',
      transfer_method: '',
      source: '',
      receiving_mag: '',
      status: 'planned'
    }))
  )
  const [currentEntry, setCurrentEntry] = useState<ForecastEntry>({
    id: crypto.randomUUID(),
    month: '',
    state: '',
    amount: '',
    localities: '',
    org_name: '', // Will be pre-filled from user data
    intermediary: '',
    transfer_method: '',
    source: '',
    receiving_mag: '',
    status: 'planned'
  })
  const [donorOrgType, setDonorOrgType] = useState<string>('')
  const [userId, setUserId] = useState<string>('')

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Get logged in donor from localStorage
        const loggedInDonor = JSON.parse(localStorage.getItem('donor') || '{}') as DonorData
        if (!loggedInDonor?.donor_id) {
          throw new Error('No donor information found')
        }

        // Set user ID from localStorage
        if (loggedInDonor.user_id) {
          setUserId(loggedInDonor.user_id)
        }

        // Fetch donor details including org_type
        const { data: donorData, error: donorError } = await supabase
          .from('donors')
          .select('org_type')
          .eq('id', loggedInDonor.donor_id)
          .single()

        if (donorError) throw donorError
        if (donorData?.org_type) {
          setDonorOrgType(donorData.org_type)
        }

        const [clustersRes, statesRes] = await Promise.all([
          supabase.from('aid_clusters').select('id, name'),
          supabase.from('states')
            .select('id, state_name')
            .order('state_name')
        ])

        if (clustersRes.error) throw clustersRes.error
        if (statesRes.error) throw statesRes.error

        // Get unique states
        const uniqueStates = Array.from(
          new Map(statesRes.data.map(state => [state.state_name, state]))
          .values()
        )

        // Set donor directly from localStorage
        setDonors([{ id: loggedInDonor.donor_id, name: loggedInDonor.donors.name }])
        setSelectedDonor(loggedInDonor.donor_id)
        setClusters(clustersRes.data)
        setStates(uniqueStates)

        // Initialize forecast data
        const initialData: ForecastData = {
          country: {},
          states: {}
        }
        
        // Initialize country level data
        MONTHS.forEach(month => {
          const monthKey = `${YEAR}-${String(MONTHS.indexOf(month) + 1).padStart(2, '0')}`
          initialData.country[monthKey] = ''
        })

        // Initialize state level data
        uniqueStates.forEach(state => {
          initialData.states[state.id] = {}
          MONTHS.forEach(month => {
            const monthKey = `${YEAR}-${String(MONTHS.indexOf(month) + 1).padStart(2, '0')}`
            initialData.states[state.id][monthKey] = ''
          })
        })

        setForecastData(initialData)
      } catch (err) {
        console.error('Error fetching data:', err)
        setError('Failed to load data. Please try again later.')
      }
    }

    fetchData()
  }, [])

  const handleCountryAmountChange = (month: string, value: string) => {
    setForecastData(prev => ({
      ...prev,
      country: {
        ...prev.country,
        [month]: value
      }
    }))
  }

  const handleStateAmountChange = (stateId: string, month: string, value: string) => {
    setForecastData(prev => ({
      ...prev,
      states: {
        ...prev.states,
        [stateId]: {
          ...prev.states[stateId],
          [month]: value
        }
      }
    }))
  }

  const handleAddRow = () => {
    setRows([...rows, {
      id: crypto.randomUUID(),
      month: '',
      state: '',
      amount: '',
      localities: '',
      org_name: '', 
      intermediary: '',
      transfer_method: '',
      source: '',
      receiving_mag: '',
      status: 'planned'
    }])
  }

  const handleDeleteRow = (id: string) => {
    setRows(prev => prev.filter(row => row.id !== id))
  }

  const handleRowChange = (id: string, updatedEntry: ForecastEntry) => {
    setRows(rows.map(row => 
      row.id === id ? { ...updatedEntry, id } : row
    ))
  }

  const handleSubmit = async () => {
    try {
      // Validate donor ID first
      if (!donors[0]?.id) {
        setError('No donor ID found')
        console.error('Missing donor ID:', donors)
        return
      }

      // Get the rows data directly from the rows state
      const validRows = rows.filter(row => 
        row.month && row.state && row.amount // Only submit rows with required fields
      )

      if (validRows.length === 0) {
        setError('No valid entries to submit. Please fill in at least Month, State and Amount.')
        return
      }

      // Log the data being sent
      const submissionData = validRows.map(entry => {
        // Find state ID
        const stateId = states.find(s => s.state_name === entry.state)?.id
        if (!stateId) {
          console.error('Could not find state ID for:', entry.state)
        }

        const data = {
          donor_id: donors[0].id,
          state_id: stateId || null, // Make sure we don't send empty string
          state_name: entry.state,
          month: new Date(entry.month).toISOString(),
          amount: parseFloat(entry.amount),
          localities: entry.localities || null, // Convert empty string to null
          org_name: entry.org_name || donors[0].name,
          intermediary: entry.intermediary || null,
          transfer_method: entry.transfer_method || null,
          source: entry.source || null,
          receiving_mag: entry.receiving_mag || null,
          status: entry.status || 'planned',
          org_type: donorOrgType || null,
          created_by: userId || null
        }

        console.log('Preparing submission row:', data)
        return data
      })

      console.log('Full submission data:', submissionData)

      const { data, error } = await supabase
        .from('donor_forecasts')
        .upsert(submissionData, {
          onConflict: 'org_name,state_name,month',
          ignoreDuplicates: false
        })

      if (error) {
        console.error('Supabase error:', error)
        throw new Error(error.message)
      }

      console.log('Submission response:', data)
      alert('Forecasts submitted successfully!')
      
      // Reset form rows to initial state
      setRows(Array(5).fill(null).map(() => ({
        id: crypto.randomUUID(),
        month: '',
        state: '',
        amount: '',
        localities: '',
        org_name: '', 
        intermediary: '',
        transfer_method: '',
        source: '',
        receiving_mag: '',
        status: 'planned'
      })))
      
    } catch (err) {
      console.error('Submission error:', err)
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    }
  }

  const handleDownloadTemplate = () => {
    // Sample data rows with realistic values
    const sampleRows = [
      {
        Month: 'Jan-25',  // Use MMM-YY format
        State: 'Kassala',
        Amount: '$ 20,000',
        Localities: 'El Girba, Kassala City',
        'Org Name': 'P2H',
        Intermediary: 'LoHub',
        'Transfer Method': 'Hawala',
        Source: 'Private',
        'Receiving MAG': 'ERR',
        Status: 'complete'
      }
    ]

    const csvContent = Papa.unparse({
      fields: [
        'Month',
        'State',
        'Amount',
        'Localities',
        'Org Name',
        'Intermediary',
        'Transfer Method',
        'Source',
        'Receiving MAG',
        'Status'
      ],
      data: sampleRows
    })

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', 'forecast_template.csv')
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setError(null)
    }
  }

  const handleFileUpload = async () => {
    if (!selectedFile) {
      setError('Please select a file first')
      return
    }

    try {
      setIsSubmitting(true)
      setError(null)

      Papa.parse<CSVRow>(selectedFile, {
        header: true,
        complete: async (results) => {
          try {
            // Validate required columns
            const requiredColumns = [
              'Month', 'State', 'Amount', 'Localities', 'Org Name', 
              'Intermediary', 'Transfer Method', 'Source', 'Receiving MAG',
              'Status'
            ]
            const headers = Object.keys(results.data[0] || {})
            const missingColumns = requiredColumns.filter(col => !headers.includes(col))

            if (missingColumns.length > 0) {
              setError(`Missing required columns: ${missingColumns.join(', ')}`)
              return
            }

            // Parse and validate each row
            const forecasts = results.data
              .filter(row => row.Month && row.State && row.Amount)
              .map(row => {
                try {
                  const parsedDate = parseDate(row.Month)
                  if (!parsedDate) {
                    console.error('Invalid date format:', row.Month)
                    return null
                  }

                  const matchingState = states.find(s => 
                    s.state_name.toLowerCase() === row.State.toLowerCase()
                  )

                  const cleanedAmount = parseFloat(row.Amount.replace(/[^0-9.-]/g, ''))
                  if (isNaN(cleanedAmount)) {
                    console.error('Invalid amount:', row.Amount)
                    return null
                  }

                  return {
                    donor_id: donors[0].id,
                    state_id: matchingState?.id || null,
                    state_name: row.State,
                    month: parsedDate.toISOString(),
                    amount: cleanedAmount,
                    localities: row.Localities || null,
                    org_name: donors[0].name,
                    intermediary: row.Intermediary || null,
                    transfer_method: row['Transfer Method'] || null,
                    source: row.Source || null,
                    receiving_mag: row['Receiving MAG'] || null,
                    status: row.Status?.toLowerCase().trim() === 'complete' ? 'complete' : 'planned',
                    org_type: donorOrgType || null,
                    created_by: userId || null
                  }
                } catch (err) {
                  console.error('Error processing row:', row, err)
                  return null
                }
              })
              .filter((forecast): forecast is NonNullable<typeof forecast> => forecast !== null)

            if (forecasts.length === 0) {
              throw new Error('No valid forecast data found in CSV. Please check date formats (YYYY-MM-DD, MMM-YY, MM/DD/YY, DD-MMM-YY) and other required fields.')
            }

            // Submit forecasts
            const response = await fetch('/api/forecasts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(forecasts)
            })

            if (!response.ok) throw new Error('Failed to submit forecasts')

            alert('Forecasts uploaded successfully!')
            setSelectedFile(null)
          } catch (err) {
            setError(err instanceof Error ? err.message : 'An unexpected error occurred')
          } finally {
            setIsSubmitting(false)
          }
        },
        error: (error) => {
          setError(`Error parsing CSV: ${error.message}`)
          setIsSubmitting(false)
        }
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
      setIsSubmitting(false)
    }
  }

  // Update the guide component to be collapsible
  const UploadGuide = () => {
    // Keep existing states from the parent component
    const statesList = states.map(s => s.state_name).sort()

    return (
      <CollapsibleRow title="📝 CSV Upload Guide" variant="default">
        <div className="pt-2">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {/* Left Column */}
            <div className="space-y-2">
              <div className="space-y-1">
                <div className="font-medium flex items-center gap-2">
                  <span>📅</span> Month Format
                </div>
                <p className="text-xs text-muted-foreground">
                  Use MMM-YY format (e.g., Jan-25). Month when disbursement is made/intended to MAG
                </p>
              </div>

              <div className="space-y-1">
                <div className="font-medium flex items-center gap-2">
                  <span>🌍</span> State
                  <Dialog>
                    <DialogTrigger asChild>
                      <button className="text-xs text-blue-500 hover:underline ml-2">
                        View States List
                      </button>
                    </DialogTrigger>
                    <DialogContent className="bg-white">
                      <DialogHeader>
                        <DialogTitle>Available States</DialogTitle>
                      </DialogHeader>
                      <div className="grid grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto">
                        {statesList.map((state) => (
                          <div key={state} className="text-sm p-2 bg-gray-50 rounded border border-gray-100">
                            {state}
                          </div>
                        ))}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
                <p className="text-xs text-muted-foreground">
                  Must match our state list exactly. State where MAG is operational
                </p>
              </div>

              <div className="space-y-1">
                <div className="font-medium flex items-center gap-2">
                  <span>💰</span> Amount
                </div>
                <p className="text-xs text-muted-foreground">
                  Numbers only or with currency symbol (e.g., 20000 or $20,000)
                </p>
              </div>

              <div className="space-y-1">
                <div className="font-medium flex items-center gap-2">
                  <span>📍</span> Localities
                </div>
                <p className="text-xs text-muted-foreground">
                  Optional free text. List of specific localities if applicable
                </p>
              </div>

              <div className="space-y-1">
                <div className="font-medium flex items-center gap-2">
                  <span>🏢</span> Org Name
                </div>
                <p className="text-xs text-muted-foreground">
                  Your organization name
                </p>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-2">
              <div className="space-y-1">
                <div className="font-medium flex items-center gap-2">
                  <span>🤝</span> Intermediary
                </div>
                <p className="text-xs text-muted-foreground">
                  Organization directing final disbursement. Entity collecting banking/transfer details
                </p>
              </div>

              <div className="space-y-1">
                <div className="font-medium flex items-center gap-2">
                  <span>💳</span> Transfer Method
                </div>
                <p className="text-xs text-muted-foreground">
                  How funds are transferred internationally (e.g., Bankak, Hawala)
                </p>
              </div>

              <div className="space-y-1">
                <div className="font-medium flex items-center gap-2">
                  <span>📊</span> Source
                </div>
                <p className="text-xs text-muted-foreground">
                  Private, UN, or Governmental. General category of funding source
                </p>
              </div>

              <div className="space-y-1">
                <div className="font-medium flex items-center gap-2">
                  <span>👥</span> Receiving MAG
                </div>
                <p className="text-xs text-muted-foreground">
                  MAG identifier or type. Use grouping/type if name cannot be shared
                </p>
              </div>

              <div className="space-y-1">
                <div className="font-medium flex items-center gap-2">
                  <span>📊</span> Status
                </div>
                <p className="text-xs text-muted-foreground">
                  'planned' or 'complete'. Use planned for future, complete for past months
                </p>
              </div>
            </div>
          </div>
        </div>
      </CollapsibleRow>
    )
  }

  // Modify FormSection to be simpler
  const FormSection = () => {
    return (
      <CollapsibleRow 
        title="Submit Forecast (Form)" 
        variant="primary"
        defaultOpen={false}
      >
        <div className="space-y-6 pt-4">
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-2 text-left">Month <span className="text-red-500">*</span></th>
                  <th className="p-2 text-left">State <span className="text-red-500">*</span></th>
                  <th className="p-2 text-left">Amount <span className="text-red-500">*</span></th>
                  <th className="p-2 text-left">Localities</th>
                  <th className="p-2 text-left">Intermediary <span className="text-red-500">*</span></th>
                  <th className="p-2 text-left">Transfer Method <span className="text-red-500">*</span></th>
                  <th className="p-2 text-left">Source <span className="text-red-500">*</span></th>
                  <th className="p-2 text-left">Receiving MAG <span className="text-red-500">*</span></th>
                  <th className="p-2 text-left">Status <span className="text-red-500">*</span></th>
                  <th className="p-2 w-20 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <EntryFormRow
                    key={row.id}
                    entry={row}
                    onChange={(updated) => handleRowChange(row.id, updated)}
                    onDelete={() => handleDeleteRow(row.id)}
                    onAdd={handleAddRow}
                    states={states}
                    months={MONTHS}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <Button 
            onClick={handleSubmit} 
            className="w-full bg-[#007229] hover:bg-[#007229]/90 text-white"
            disabled={rows.length === 0}
          >
            Submit All Entries
          </Button>
        </div>
      </CollapsibleRow>
    )
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Forecast Tool</h2>
        <Button 
          variant="outline" 
          onClick={() => router.push('/')}
        >
          Back
        </Button>
      </div>

      {error && (
        <div className="bg-destructive/15 text-destructive px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {/* Donor Display - Always visible */}
      <div className="space-y-2">
        <Label htmlFor="donor">Partner</Label>
        <div className="h-9 px-3 py-1 rounded-md border bg-muted/50 flex items-center">
          {donors[0]?.name}
        </div>
      </div>

      {/* Submit Options Section */}
      <div className="space-y-4">
        {/* Manual Input Tool - renamed */}
        <FormSection />

        {/* CSV Upload - renamed */}
        <CollapsibleRow 
          title="Submit Forecast (CSV Upload)" 
          variant="primary"
          defaultOpen={false}
        >
          <div className="space-y-4 pt-4">
            <UploadGuide />
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                onClick={handleDownloadTemplate}
                className="whitespace-nowrap"
              >
                Download Template
              </Button>
              <div className="flex-1">
                <FileInput
                  accept=".csv"
                  onChange={handleFileSelect}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <Button 
              className="w-full bg-[#007229] hover:bg-[#007229]/90 text-white disabled:bg-[#007229] disabled:opacity-100" 
              onClick={handleFileUpload}
              disabled={isSubmitting || !selectedFile}
            >
              {isSubmitting ? 'Uploading...' : 'Upload CSV'}
            </Button>
          </div>
        </CollapsibleRow>
      </div>

      {/* View Forecasts Section */}
      <ViewForecasts />
    </div>
  )
}
