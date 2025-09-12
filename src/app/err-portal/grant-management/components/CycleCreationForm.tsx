'use client'

import React, { useState } from 'react'
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
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const formSchema = z.object({
  cycle_number: z.number().min(1, "Cycle number must be at least 1"),
  year: z.number().min(2020, "Year must be at least 2020"),
  name: z.string().min(1, "Name is required"),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
})

type FormData = z.infer<typeof formSchema>

interface CycleCreationFormProps {
  onSuccess: () => void
}

export default function CycleCreationForm({ onSuccess }: CycleCreationFormProps) {
  const { t } = useTranslation(['err', 'common'])
  const [isLoading, setIsLoading] = useState(false)

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      cycle_number: 1,
      year: new Date().getFullYear(),
      name: '',
      start_date: '',
      end_date: '',
    },
  })

  const onSubmit = async (values: FormData) => {
    try {
      setIsLoading(true)

      const response = await fetch('/api/cycles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
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
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="cycle_number"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cycle Number</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="year"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Year</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value) || new Date().getFullYear())}
                  />
                </FormControl>
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
              <FormLabel>Cycle Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Cycle 1 - January 2024" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="start_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start Date (Optional)</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="end_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>End Date (Optional)</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

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
