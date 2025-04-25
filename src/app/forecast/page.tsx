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

const MONTHS = ['May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
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

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Get logged in donor from localStorage
        const loggedInDonor = JSON.parse(localStorage.getItem('donor') || '{}')
        if (!loggedInDonor?.donor_id) {
          throw new Error('No donor information found')
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
          const monthKey = `${YEAR}-${String(MONTHS.indexOf(month) + 5).padStart(2, '0')}`
          initialData.country[monthKey] = ''
        })

        // Initialize state level data
        uniqueStates.forEach(state => {
          initialData.states[state.id] = {}
          MONTHS.forEach(month => {
            const monthKey = `${YEAR}-${String(MONTHS.indexOf(month) + 5).padStart(2, '0')}`
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

  const handleSubmit = async () => {
    try {
      if (!selectedDonor) throw new Error('Please select a donor')
      if (!selectedCluster) throw new Error('Please select a cluster')

      setError(null)
      setIsSubmitting(true)

      const forecasts = [
        // Country level forecasts
        ...Object.entries(forecastData.country)
          .filter(([_, amount]) => amount !== '')
          .map(([month, amount]) => ({
            donor_id: selectedDonor,
            cluster_id: selectedCluster,
            state_id: null, // null for country level
            month: new Date(`${month}-01`).toISOString(),
            amount: parseFloat(amount)
          })),
        // State level forecasts
        ...Object.entries(forecastData.states).flatMap(([stateId, months]) =>
          Object.entries(months)
            .filter(([_, amount]) => amount !== '')
            .map(([month, amount]) => ({
              donor_id: selectedDonor,
              cluster_id: selectedCluster,
              state_id: stateId,
              month: new Date(`${month}-01`).toISOString(),
              amount: parseFloat(amount)
            }))
        )
      ]

      if (forecasts.length === 0) {
        throw new Error('Please enter at least one forecast amount')
      }

      const response = await fetch('/api/forecasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(forecasts)
      })

      if (!response.ok) throw new Error('Failed to submit forecasts')

      alert('Forecasts submitted successfully!')
      setSelectedDonor('')
      setSelectedCluster('')
      setForecastData({ country: {}, states: {} })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
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

                  // Try to find matching state using fuzzy matching
                  const matchingState = states.find(s => 
                    s.state_name.toLowerCase() === row.State.toLowerCase()
                  )

                  // Clean and parse amount
                  const cleanedAmount = parseFloat(row.Amount.replace(/[^0-9.-]/g, ''))
                  if (isNaN(cleanedAmount)) {
                    console.error('Invalid amount:', row.Amount)
                    return null
                  }

                  return {
                    donor_id: donors[0].id,
                    cluster_id: selectedCluster || null,
                    state_id: matchingState?.id || null,
                    state_name: row.State,
                    month: parsedDate.toISOString(),
                    amount: cleanedAmount,
                    localities: row.Localities,
                    org_name: row['Org Name'],
                    intermediary: row.Intermediary,
                    transfer_method: row['Transfer Method'],
                    source: row.Source,
                    receiving_mag: row['Receiving MAG'],
                    status: row.Status ? (
                      row.Status?.toLowerCase().trim() === 'completed' || 
                      row.Status?.toLowerCase().trim() === 'complete' ? 'complete' : 'planned'
                    ) : 'planned'
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
        <CollapsibleRow title="Submit Forecast (Form)" variant="primary">
          <div className="space-y-6 pt-4">
            <div className="space-y-2">
              <Label htmlFor="cluster">Cluster</Label>
              <Select value={selectedCluster} onValueChange={setSelectedCluster}>
                <SelectTrigger id="cluster">
                  <SelectValue placeholder="Select a cluster" />
                </SelectTrigger>
                <SelectContent>
                  {clusters.map((cluster) => (
                    <SelectItem key={cluster.id} value={cluster.id}>
                      {cluster.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4">
              <Label>Monthly Forecasts for {YEAR}</Label>
              
              {/* Country Level Forecasts */}
              <CollapsibleRow title="Country Level" variant="default">
                <div className="grid grid-cols-4 gap-4 pt-2">
                  {MONTHS.map((month) => {
                    const monthKey = `${YEAR}-${String(MONTHS.indexOf(month) + 5).padStart(2, '0')}`
                    return (
                      <div key={month} className="space-y-2">
                        <Label className="text-sm text-center block">
                          {month}
                        </Label>
                        <Input
                          type="number"
                          value={forecastData.country[monthKey] || ''}
                          onChange={(e) => handleCountryAmountChange(monthKey, e.target.value)}
                          placeholder="0"
                          min="0"
                          step="0.01"
                          className="text-right"
                        />
                      </div>
                    )}
                  )}
                </div>
              </CollapsibleRow>

              {/* State Level Forecasts */}
              <CollapsibleRow title="State Level" variant="default">
                <div className="space-y-2">
                  {states.map((state) => (
                    <CollapsibleRow key={state.id} title={state.state_name}>
                      <div className="grid grid-cols-4 gap-4 pt-2">
                        {MONTHS.map((month) => {
                          const monthKey = `${YEAR}-${String(MONTHS.indexOf(month) + 5).padStart(2, '0')}`
                          return (
                            <div key={month} className="space-y-2">
                              <Label className="text-sm text-center block">
                                {month}
                              </Label>
                              <Input
                                type="number"
                                value={forecastData.states[state.id]?.[monthKey] || ''}
                                onChange={(e) => handleStateAmountChange(state.id, monthKey, e.target.value)}
                                placeholder="0"
                                min="0"
                                step="0.01"
                                className="text-right"
                              />
                            </div>
                          )}
                        )}
                      </div>
                    </CollapsibleRow>
                  ))}
                </div>
              </CollapsibleRow>
            </div>

            <Button 
              className="w-full" 
              onClick={handleSubmit} 
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Manual Forecast'}
            </Button>
          </div>
        </CollapsibleRow>

        {/* CSV Upload - renamed */}
        <CollapsibleRow title="Submit Forecast (CSV Upload)" variant="primary">
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
              className="w-full" 
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
