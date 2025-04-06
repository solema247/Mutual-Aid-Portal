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
  donor_name: string
  cluster_name: string
  state_name: string
  month: string
  amount: string
  [key: string]: string // All fields are strings in CSV
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
    // Get logged in donor name
    const loggedInDonor = JSON.parse(localStorage.getItem('donor') || '{}')
    const donorName = loggedInDonor.donors?.name || ''

    // Create rows for all months for Sudan (country-level)
    const countryRows = MONTHS.map(month => [
      donorName,                                                         // donor_name
      'All',                                                            // cluster_name
      'All',                                                            // state_name (All for country-level)
      `${YEAR}-${String(MONTHS.indexOf(month) + 5).padStart(2, '0')}-01`, // month
      '0.00'                                                            // amount
    ])

    // Create rows for all months for each state
    const stateRows = states.flatMap(state => 
      MONTHS.map(month => [
        donorName,                                                         // donor_name
        'All',                                                            // cluster_name
        state.state_name,                                                 // state_name
        `${YEAR}-${String(MONTHS.indexOf(month) + 5).padStart(2, '0')}-01`, // month
        '0.00'                                                            // amount
      ])
    )

    // Combine country and state rows
    const sampleRows = [...countryRows, ...stateRows]
    
    const csvContent = Papa.unparse({
      fields: ['donor_name', 'cluster_name', 'state_name', 'month', 'amount'],
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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = event.target.files?.[0]
      if (!file) return

      Papa.parse<CSVRow>(file, {
        header: true,
        complete: async (results) => {
          // Validate required columns
          const requiredColumns = ['donor_name', 'cluster_name', 'state_name', 'month', 'amount']
          const headers = Object.keys(results.data[0] || {})
          const missingColumns = requiredColumns.filter(col => !headers.includes(col))

          if (missingColumns.length > 0) {
            setError(`Missing required columns: ${missingColumns.join(', ')}`)
            return
          }

          // Convert names to IDs and validate
          const forecasts = results.data
            .filter(row => row.donor_name && row.cluster_name && row.state_name && row.month && row.amount)
            .map(row => {
              // Find matching IDs
              const donor = donors.find(d => d.name.toLowerCase() === row.donor_name.toLowerCase())
              const cluster = clusters.find(c => c.name.toLowerCase() === row.cluster_name.toLowerCase())
              const state = row.state_name.toLowerCase() === 'all' 
                ? null 
                : states.find(s => s.state_name.toLowerCase() === row.state_name.toLowerCase())

              // Validation errors
              if (!donor) throw new Error(`Unknown donor: ${row.donor_name}`)
              if (!cluster) throw new Error(`Unknown cluster: ${row.cluster_name}`)
              if (row.state_name.toLowerCase() !== 'all' && !state) {
                throw new Error(`Unknown state: ${row.state_name}`)
              }

              return {
                donor_id: donor.id,
                cluster_id: cluster.id,
                state_id: state?.id || null,
                month: new Date(row.month).toISOString(),
                amount: parseFloat(row.amount)
              }
            })

          if (forecasts.length === 0) {
            setError('No valid forecast data found in CSV')
            return
          }

          // Submit using existing API endpoint
          setIsSubmitting(true)
          setError(null)

          const response = await fetch('/api/forecasts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(forecasts)
          })

          if (!response.ok) throw new Error('Failed to submit forecasts')

          alert('Forecasts uploaded successfully!')
          event.target.value = '' // Reset file input
        },
        error: (error) => {
          setError(`Error parsing CSV: ${error.message}`)
        }
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
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
        <Label htmlFor="donor">Donor</Label>
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
                  onChange={handleFileUpload}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <Button 
              className="w-full" 
              onClick={() => document.querySelector<HTMLInputElement>('input[type="file"]')?.click()}
              disabled={isSubmitting}
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
