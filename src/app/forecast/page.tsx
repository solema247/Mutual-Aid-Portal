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
        const [donorsRes, clustersRes, statesRes] = await Promise.all([
          supabase.from('donors').select('id, name'),
          supabase.from('aid_clusters').select('id, name'),
          supabase.from('states')
            .select('id, state_name')
            .order('state_name')
        ])

        if (donorsRes.error) throw donorsRes.error
        if (clustersRes.error) throw clustersRes.error
        if (statesRes.error) throw statesRes.error

        // Get unique states
        const uniqueStates = Array.from(
          new Map(statesRes.data.map(state => [state.state_name, state]))
          .values()
        )

        setDonors(donorsRes.data)
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

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Submit Forecast</h2>
        <Button variant="outline" onClick={() => window.history.back()}>
          Back
        </Button>
      </div>

      {error && (
        <div className="bg-destructive/15 text-destructive px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="donor">Donor</Label>
            <Select value={selectedDonor} onValueChange={setSelectedDonor}>
              <SelectTrigger id="donor">
                <SelectValue placeholder="Select a donor" />
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
        </div>

        <div className="space-y-4">
          <Label>Monthly Forecasts for {YEAR}</Label>
          
          {/* Country Level Forecasts */}
          <CollapsibleRow title="Country Level" variant="primary">
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
          <CollapsibleRow title="State Level" variant="primary">
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
          {isSubmitting ? 'Submitting...' : 'Submit Forecasts'}
        </Button>
      </div>
    </div>
  )
}
