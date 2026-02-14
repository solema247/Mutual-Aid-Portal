'use client'

import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Calendar, Save, X } from 'lucide-react'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'

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
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  name: z.string().min(1, "Cycle name is required"),
  type: z.enum(['one_off','tranches','emergency']),
  tranche_count: z.number().min(1).optional(),
})

type FormData = z.infer<typeof formSchema>

interface CycleCreationFormProps {
  onSuccess: () => void
}

export default function CycleCreationForm({ onSuccess }: CycleCreationFormProps) {
  const { t } = useTranslation(['err', 'common'])
  const { can } = useAllowedFunctions()
  const [isLoading, setIsLoading] = useState(false)
  const [nextCycleNumber, setNextCycleNumber] = useState(1)
  const [lastCycleName, setLastCycleName] = useState('')
  const [startDisplay, setStartDisplay] = useState('')
  const [endDisplay, setEndDisplay] = useState('')

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      year: new Date().getFullYear(),
      start_date: null,
      end_date: null,
      name: '',
      type: 'one_off',
      tranche_count: undefined,
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

  // No weekly logic needed anymore

  const onSubmit = async (values: FormData) => {
    try {
      setIsLoading(true)

      // Prepare data with auto-generated values
      const cycleData = {
        cycle_number: nextCycleNumber,
        year: values.year,
        name: values.name,
        start_date: values.start_date || null,
        end_date: values.end_date || null,
        type: values.type,
        tranche_count: values.type === 'tranches' ? values.tranche_count : null,
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

  const formatDateShort = (iso: string | null | undefined) => {
    if (!iso) return ''
    const [y, m, d] = iso.split('-')
    if (!y || !m || !d) return ''
    return `${d}/${m}/${y.slice(2)}`
  }

  useEffect(() => {
    const subscription = form.watch((value) => {
      setStartDisplay(formatDateShort(value.start_date as any))
      setEndDisplay(formatDateShort(value.end_date as any))
    })
    return () => subscription.unsubscribe()
  }, [form])

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* Auto-generated Cycle Number Display */}
        <div className="p-4 bg-muted/20 rounded-lg">
          <label className="text-sm font-medium text-muted-foreground">{t('err:cycles.create.cycle_number')}</label>
          <div className="text-lg font-semibold">{nextCycleNumber}</div>
          <div className="text-xs text-muted-foreground">{t('err:cycles.create.auto_generated')}</div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <FormField
            control={form.control}
            name="year"
            render={({ field }) => (
              <FormItem className="min-w-0">
                <FormLabel>{t('err:cycles.create.year')}</FormLabel>
                <Select
                  value={field.value?.toString()}
                  onValueChange={(value) => field.onChange(parseInt(value))}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t('err:cycles.create.select_year')} />
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
            name="start_date"
            render={({ field }) => (
              <FormItem className="min-w-0">
                <FormLabel>{t('err:cycles.create.start_date') || 'Start Date'}</FormLabel>
                <FormControl>
                  <div className="relative w-full">
                    <input
                      type="date"
                      value={field.value ?? ''}
                      onChange={(e) => {
                        const v = e.target.value || null
                        field.onChange(v)
                        setStartDisplay(formatDateShort(v))
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      aria-label="Hidden date picker"
                    />
                    <Input
                      type="text"
                      readOnly
                      value={startDisplay}
                      placeholder="dd/mm/yy"
                      className="w-full pr-10"
                    />
                    <Calendar className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="end_date"
            render={({ field }) => (
              <FormItem className="min-w-0">
                <FormLabel>{t('err:cycles.create.end_date_optional') || 'End Date (optional)'}</FormLabel>
                <FormControl>
                  <div className="relative w-full">
                    <input
                      type="date"
                      value={field.value ?? ''}
                      onChange={(e) => {
                        const v = e.target.value || null
                        field.onChange(v)
                        setEndDisplay(formatDateShort(v))
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      aria-label="Hidden date picker"
                    />
                    <Input
                      type="text"
                      readOnly
                      value={endDisplay}
                      placeholder="dd/mm/yy"
                      className="w-full pr-10"
                    />
                    <Calendar className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Cycle Type moved into this row */}
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem className="min-w-0">
                <FormLabel>Cycle Type</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={(value) => field.onChange(value as 'one_off' | 'tranches' | 'emergency')}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="one_off">One-off</SelectItem>
                    <SelectItem value="tranches">Tranches</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('err:cycles.create.cycle_name')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
              {/* Removed WKxx naming tip */}
            </FormItem>
          )}
        />

        {/* Tranche fields */}
        <div className="grid grid-cols-3 gap-4">
          

          {form.watch('type') === 'tranches' && (
            <FormField
              control={form.control}
              name="tranche_count"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Number of Tranches</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                      placeholder="e.g. 3"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* Pool amount removed; pool derived from grant inclusions after creation */}
        </div>


        <div className="flex justify-end gap-3 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => form.reset()}
            disabled={isLoading}
          >
            <X className="h-4 w-4 mr-2" />
            {t('err:cycles.create.reset')}
          </Button>
          <Button
            type="submit"
            disabled={isLoading || !can('grant_create_cycle')}
            className="bg-[#007229] hover:bg-[#007229]/90 text-white"
            title={!can('grant_create_cycle') ? t('common:no_permission') : undefined}
          >
            <Save className="h-4 w-4 mr-2" />
            {isLoading ? t('err:cycles.create.creating') : t('err:cycles.create.create_button')}
          </Button>
        </div>
      </form>
    </Form>
  )
}
