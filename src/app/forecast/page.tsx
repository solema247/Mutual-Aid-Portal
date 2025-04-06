'use client'

import React from 'react'
import { useState, useEffect } from 'react'
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

type MonthlyAmount = {
  month: string
  amount: string
}

const MONTHS = [
  'January', 'February', 'March', 'April', 
  'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'
]

export default function ForecastPage() {
  const [donors, setDonors] = useState<{ id: string; name: string }[]>([])
  const [selectedDonor, setSelectedDonor] = useState<string | null>(null)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString())
  const [monthlyAmounts, setMonthlyAmounts] = useState<MonthlyAmount[]>(
    MONTHS.map((_, index) => ({
      month: `${selectedYear}-${String(index + 1).padStart(2, '0')}`,
      amount: ''
    }))
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchDonors = async () => {
      try {
        const { data, error } = await supabase.from('donors').select('id, name')
        if (error) throw error
        setDonors(data)
      } catch (err) {
        console.error('Error fetching donors:', err)
        setError('Failed to load donors. Please try again later.')
      }
    }
    fetchDonors()
  }, [])

  const handleAmountChange = (monthIndex: number, value: string) => {
    setMonthlyAmounts(prev => prev.map((item, index) => 
      index === monthIndex ? { ...item, amount: value } : item
    ))
  }

  const handleSubmit = async () => {
    try {
      setError(null)
      setIsSubmitting(true)

      if (!selectedDonor) throw new Error('Please select a donor')
      
      const forecasts = monthlyAmounts
        .filter(({ amount }) => amount !== '')
        .map(({ month, amount }) => ({
          donor_id: selectedDonor,
          month: new Date(`${month}-01`).toISOString(),
          amount: parseFloat(amount)
        }))

      if (forecasts.length === 0) {
        throw new Error('Please enter at least one forecast amount')
      }

      const response = await fetch('/api/forecasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(forecasts)
      })

      if (!response.ok) throw new Error('Failed to submit forecasts')

      setSelectedDonor(null)
      setMonthlyAmounts(MONTHS.map((_, index) => ({
        month: `${selectedYear}-${String(index + 1).padStart(2, '0')}`,
        amount: ''
      })))
      alert('Forecasts submitted successfully!')
      
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
        <div className="space-y-2">
          <Label htmlFor="donor">Donor</Label>
          <Select value={selectedDonor || undefined} onValueChange={setSelectedDonor}>
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

        <div className="space-y-4">
          <Label>Monthly Forecasts for {selectedYear}</Label>
          <div className="w-full space-y-4">
            {[0, 1, 2].map((row) => (
              <div key={row} className="grid grid-cols-4 gap-4">
                {MONTHS.slice(row * 4, (row + 1) * 4).map((month, idx) => (
                  <div key={month} className="space-y-2">
                    <Label className="text-sm text-center block">
                      {month.substring(0, 3)}
                    </Label>
                    <Input
                      id={`amount-${row * 4 + idx}`}
                      type="number"
                      value={monthlyAmounts[row * 4 + idx].amount}
                      onChange={(e) => handleAmountChange(row * 4 + idx, e.target.value)}
                      placeholder="0"
                      min="0"
                      step="0.01"
                      className="w-full text-right"
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
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
