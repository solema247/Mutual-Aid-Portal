'use client'

import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Calendar, Save, X } from 'lucide-react'

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const formSchema = z.object({
  year: z.number().min(2020, "Year must be at least 2020"),
  month: z.number().min(1).max(12, "Month must be between 1 and 12"),
  week: z.number().min(1).max(5, "Week must be between 1 and 5"),
  name: z.string().min(1, "Cycle name is required"),
})

type FormData = z.infer<typeof formSchema>

interface CycleCreationFormProps {
  onSuccess: () => void
}

export default function CycleCreationForm({ onSuccess }: CycleCreationFormProps) {
  const { t } = useTranslation(['err', 'common'])
  const [isLoading, setIsLoading] = useState(false)
  const [nextCycleNumber, setNextCycleNumber] = useState(1)
  const [lastCycleName, setLastCycleName] = useState('')

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
      week: 1,
      name: '',
    },
  })

  // Fetch next cycle number and last cycle name when year changes
  useEffect(() => {
    const fetchCycleInfo = async () => {
      const year = form.getValues('year')
      try {
        const response = await fetch(`/api/cycles?year=${year}`)
        if (response.ok) {
          const cycles = await response.json()
          const maxCycleNumber = cycles.length > 0 
            ? Math.max(...cycles.map((c: any) => c.cycle_number)) 
            : 0
          setNextCycleNumber(maxCycleNumber + 1)
          
          // Get the last cycle name for the tip
          const lastCycle = cycles.length > 0 
            ? cycles.find((c: any) => c.cycle_number === maxCycleNumber)
            : null
          setLastCycleName(lastCycle?.name || '')
        }
      } catch (error) {
        console.error('Error fetching cycle info:', error)
        setNextCycleNumber(1)
        setLastCycleName('')
      }
    }

    fetchCycleInfo()
  }, [form])

  // Reset week when year or month changes to ensure valid selection
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === 'year' || name === 'month') {
        // Reset week to 1 when year or month changes
        form.setValue('week', 1)
      }
    })
    return () => subscription.unsubscribe()
  }, [form])

  // Get weeks for the selected month and year
  const getWeeksForMonth = (year: number, month: number) => {
    const firstDay = new Date(year, month - 1, 1)
    const lastDay = new Date(year, month, 0)
    
    const weeks = []
    for (let week = 1; week <= 5; week++) {
      const weekStart = new Date(year, month - 1, (week - 1) * 7 + 1)
      const weekEnd = new Date(year, month - 1, Math.min(week * 7, lastDay.getDate()))
      
      // Only include weeks that actually exist in this month
      if (weekStart <= lastDay) {
        const monthName = weekStart.toLocaleString('default', { month: 'short' })
        weeks.push({
          weekNumber: week,
          startDate: weekStart,
          endDate: weekEnd,
          label: `${weekStart.getDate()}-${weekEnd.getDate()} ${monthName}`
        })
      }
    }
    
    return weeks
  }

  const onSubmit = async (values: FormData) => {
    try {
      setIsLoading(true)

      // Calculate start and end dates from week selection
      const weeks = getWeeksForMonth(values.year, values.month)
      const selectedWeek = weeks.find(w => w.weekNumber === values.week)
      
      if (!selectedWeek) {
        throw new Error('Invalid week selection')
      }

      // Prepare data with auto-generated values
      const cycleData = {
        cycle_number: nextCycleNumber,
        year: values.year,
        name: values.name,
        start_date: selectedWeek.startDate.toISOString().split('T')[0],
        end_date: selectedWeek.endDate.toISOString().split('T')[0],
      }

      const response = await fetch('/api/cycles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cycleData),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create cycle')
      }

      onSuccess()
    } catch (error) {
      console.error('Error creating cycle:', error)
      alert('Failed to create cycle. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* Auto-generated Cycle Number Display */}
        <div className="p-4 bg-muted/20 rounded-lg">
          <label className="text-sm font-medium text-muted-foreground">Cycle Number</label>
          <div className="text-lg font-semibold">{nextCycleNumber}</div>
          <div className="text-xs text-muted-foreground">Auto-generated</div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="year"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Year</FormLabel>
                <Select
                  value={field.value?.toString()}
                  onValueChange={(value) => field.onChange(parseInt(value))}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select year" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Array.from({ length: 10 }, (_, i) => {
                      const year = new Date().getFullYear() + i
                      return (
                        <SelectItem key={year} value={year.toString()}>
                          {year}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="month"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Month</FormLabel>
                <Select
                  value={field.value?.toString()}
                  onValueChange={(value) => field.onChange(parseInt(value))}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select month" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => {
                      const month = i + 1
                      const monthName = new Date(2024, i).toLocaleString('default', { month: 'long' })
                      return (
                        <SelectItem key={month} value={month.toString()}>
                          {monthName} ({month})
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="week"
            render={({ field }) => {
              const selectedYear = form.getValues('year')
              const selectedMonth = form.getValues('month')
              const availableWeeks = (selectedYear && selectedMonth) 
                ? getWeeksForMonth(selectedYear, selectedMonth) 
                : []
              
              return (
                <FormItem>
                  <FormLabel>Week</FormLabel>
                  <Select
                    value={field.value?.toString()}
                    onValueChange={(value) => field.onChange(parseInt(value))}
                    disabled={!selectedYear || !selectedMonth}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={
                          !selectedYear ? "Select year first" : 
                          !selectedMonth ? "Select month first" : 
                          "Select week"
                        } />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableWeeks.map((week) => (
                        <SelectItem key={week.weekNumber} value={week.weekNumber.toString()}>
                          {week.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
            <FormMessage />
                </FormItem>
              )
            }}
          />
        </div>

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cycle Name</FormLabel>
              <FormControl>
                <Input 
                  placeholder="e.g., WK38" 
                  {...field} 
                />
              </FormControl>
              <FormMessage />
              {lastCycleName && (
                <div className="text-xs text-muted-foreground">
                  💡 Last cycle was named: "{lastCycleName}"
                </div>
              )}
            </FormItem>
          )}
        />


        <div className="flex justify-end gap-3 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => form.reset()}
            disabled={isLoading}
          >
            <X className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <Button
            type="submit"
            disabled={isLoading}
            className="bg-[#007229] hover:bg-[#007229]/90 text-white"
          >
            <Save className="h-4 w-4 mr-2" />
            {isLoading ? 'Creating...' : 'Create Cycle'}
          </Button>
        </div>
      </form>
    </Form>
  )
}
