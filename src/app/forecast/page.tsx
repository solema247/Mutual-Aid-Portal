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

export default function ForecastPage() {
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
        Month: 'Jan-25',
        State: 'Kassala',
        Amount: '$ 20,000',
        Localities: '',
        'Org Name': 'P2H',
        Intermediary: 'LoHub',
        'Transfer Method': 'Hawala',
        Source: 'Private',
        'Receiving MAG': 'ERR'
      },
      {
        Month: 'Jan-25',
        State: 'North Darfur',
        Amount: '$ 5,961',
        Localities: '',
        'Org Name': 'P2H',
        Intermediary: 'LoHub',
        'Transfer Method': 'Hawala',
        Source: 'Private',
        'Receiving MAG': 'ERR'
      },
      {
        Month: 'Feb-25',
        State: 'Khartoum',
        Amount: '$ 51,500',
        Localities: '',
        'Org Name': 'P2H',
        Intermediary: 'LoHub',
        'Transfer Method': 'Hawala',
        Source: 'Private',
        'Receiving MAG': 'ERR'
      },
      {
        Month: 'Mar-25',
        State: 'Sinar',
        Amount: '$ 43,000',
        Localities: '',
        'Org Name': 'P2H',
        Intermediary: 'LoHub',
        'Transfer Method': 'Hawala',
        Source: 'Private',
        'Receiving MAG': 'ERR'
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
        'Receiving MAG'
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
                  let dateObj: Date;
                  
                  // Check if the date is already in YYYY-MM-DD format
                  if (row.Month.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    dateObj = new Date(row.Month);
                  } else {
                    // Parse MMM-YY format
                    const [month, year] = row.Month.split('-')
                    
                    // Validate year format
                    if (!year || year.length !== 2) {
                      console.error('Invalid year format:', row.Month)
                      return null
                    }

                    // Map month names to numbers
                    const monthMap: { [key: string]: string } = {
                      'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
                      'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
                      'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
                    }

                    const monthNum = monthMap[month.substring(0, 3)]
                    if (!monthNum) {
                      console.error('Invalid month:', month)
                      return null
                    }

                    const fullYear = `20${year}`
                    const isoDate = `${fullYear}-${monthNum}-01`
                    dateObj = new Date(isoDate)
                  }

                  // Validate the date is valid
                  if (isNaN(dateObj.getTime())) {
                    console.error('Invalid date:', row.Month)
                    return null
                  }

                  // Try to find matching state using fuzzy matching
                  const matchingState = states.find(s => 
                    s.state_name.toLowerCase() === row.State.toLowerCase()
                  )

                  // Clean and parse amount
                  const cleanedAmount = parseFloat(row.Amount.replace(/[^0-9.-]/g, ''))

                  console.log('Row Status:', row.Status)
                  console.log('Processed Status:', row.Status?.toLowerCase().trim() === 'completed' || 
                                 row.Status?.toLowerCase().trim() === 'complete' ? 'complete' : 'planned')

                  return {
                    donor_id: donors[0].id,
                    cluster_id: selectedCluster || null,
                    state_id: matchingState?.id || null,
                    state_name: row.State,
                    month: dateObj.toISOString(),
                    amount: cleanedAmount,
                    localities: row.Localities,
                    org_name: row['Org Name'],
                    intermediary: row.Intermediary,
                    transfer_method: row['Transfer Method'],
                    source: row.Source,
                    receiving_mag: row['Receiving MAG'],
                    status: row.Status?.toLowerCase().trim() === 'completed' || 
                           row.Status?.toLowerCase().trim() === 'complete' ? 'complete' : 'planned'
                  }
                } catch (err) {
                  console.error('Error processing row:', row, err)
                  return null
                }
              })
              .filter(forecast => forecast !== null)

            if (forecasts.length === 0) {
              setError('No valid forecast data found in CSV')
              return
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

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Forecast Tool</h2>
        <Button variant="outline" onClick={() => window.history.back()}>
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
