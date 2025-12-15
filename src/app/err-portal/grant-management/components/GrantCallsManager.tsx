'use client'

import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Plus, Trash2, Pencil, Building2 } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

const formSchema = z.object({
  donor_id: z.string().min(1, "Donor is required"),
  name: z.string().min(1, "Name is required"),
  shortname: z.string().optional(),
  amount: z.string().optional(),
  status: z.enum(['open', 'closed']),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
})

type FormData = z.infer<typeof formSchema>

interface Donor {
  id: string
  name: string
  short_name: string | null
}

interface GrantCall {
  id: string
  donor_id: string
  name: string
  shortname: string | null
  amount: number | null
  status: 'open' | 'closed'
  start_date: string | null
  end_date: string | null
  created_at: string
  donor: Donor
}

export default function GrantCallsManager() {
  const { t } = useTranslation(['err', 'common'])
  const [donors, setDonors] = useState<Donor[]>([])
  const [grants, setGrants] = useState<GrantCall[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingGrant, setEditingGrant] = useState<GrantCall | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all')

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      donor_id: '',
      name: '',
      shortname: '',
      amount: '',
      status: 'open',
      start_date: '',
      end_date: ''
    },
  })

  useEffect(() => {
    fetchData()
  }, [statusFilter])

  const fetchData = async () => {
    try {
      setIsLoading(true)
      
      // Fetch donors
      const { data: donorsData, error: donorsError } = await supabase
        .from('donors')
        .select('id, name, short_name')
        .eq('status', 'active')
        .order('name', { ascending: true })
      
      if (donorsError) throw donorsError
      setDonors(donorsData || [])

      // Fetch grants
      await fetchGrants()
    } catch (error) {
      console.error('Error fetching data:', error)
      alert('Failed to fetch data')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchGrants = async () => {
    try {
      let query = supabase
        .from('grant_calls')
        .select(`
          id,
          donor_id,
          name,
          shortname,
          amount,
          status,
          start_date,
          end_date,
          created_at,
          donor:donors (
            id,
            name,
            short_name
          )
        `)
        .order('created_at', { ascending: false })

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      const { data, error } = await query
      if (error) throw error
      
      const typedData: GrantCall[] = (data || []).map((item: any) => ({
        id: item.id,
        donor_id: item.donor_id,
        name: item.name,
        shortname: item.shortname,
        amount: item.amount,
        status: item.status as 'open' | 'closed',
        start_date: item.start_date,
        end_date: item.end_date,
        created_at: item.created_at,
        donor: {
          id: item.donor.id,
          name: item.donor.name,
          short_name: item.donor.short_name
        }
      }))
      
      setGrants(typedData)
    } catch (error) {
      console.error('Error fetching grants:', error)
      alert('Failed to fetch grants')
    }
  }

  const onSubmit = async (values: FormData) => {
    try {
      const submissionData = {
        ...values,
        amount: values.amount ? parseFloat(values.amount) : null
      }

      if (editingGrant) {
        // Update existing grant
        const { error } = await supabase
          .from('grant_calls')
          .update(submissionData)
          .eq('id', editingGrant.id)

        if (error) throw error
        alert('Grant call updated successfully')
      } else {
        // Create new grant
        const { error } = await supabase
          .from('grant_calls')
          .insert([submissionData])

        if (error) throw error
        alert('Grant call created successfully')
      }

      form.reset()
      setIsFormOpen(false)
      setEditingGrant(null)
      fetchGrants()
    } catch (error) {
      console.error('Error saving grant:', error)
      alert('Failed to save grant call')
    }
  }

  const handleEdit = (grant: GrantCall) => {
    setEditingGrant(grant)
    form.reset({
      donor_id: grant.donor_id,
      name: grant.name,
      shortname: grant.shortname || '',
      amount: grant.amount?.toString() || '',
      status: grant.status,
      start_date: grant.start_date || '',
      end_date: grant.end_date || ''
    })
    setIsFormOpen(true)
  }

  const handleDelete = async (grantId: string) => {
    if (!confirm('Are you sure you want to delete this grant call?')) {
      return
    }

    try {
      const { error } = await supabase
        .from('grant_calls')
        .delete()
        .eq('id', grantId)

      if (error) throw error
      alert('Grant call deleted successfully')
      fetchGrants()
    } catch (error) {
      console.error('Error deleting grant:', error)
      alert('Failed to delete grant call')
    }
  }

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return '—'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(amount)
  }

  const formatDate = (date: string | null) => {
    if (!date) return '—'
    return new Date(date).toLocaleDateString()
  }

  if (isLoading) {
    return <div className="text-center py-4">{t('common:loading')}</div>
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Grant Calls Management
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select
              value={statusFilter}
              onValueChange={(value: 'all' | 'open' | 'closed') => setStatusFilter(value)}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <Dialog open={isFormOpen} onOpenChange={(open) => {
              setIsFormOpen(open)
              if (!open) {
                form.reset()
                setEditingGrant(null)
              }
            }}>
              <DialogTrigger asChild>
                <Button className="bg-[#007229] hover:bg-[#007229]/90 text-white">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Grant Call
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingGrant ? 'Edit Grant Call' : 'Create Grant Call'}
                  </DialogTitle>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="donor_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Donor *</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ''}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select donor" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {donors.map((donor) => (
                                  <SelectItem key={donor.id} value={donor.id}>
                                    {donor.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Grant Name *</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="shortname"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Short Name</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="amount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Amount</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                value={field.value || ''}
                                onChange={(e) => field.onChange(e.target.value)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="status"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Status *</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="open">Open</SelectItem>
                                <SelectItem value="closed">Closed</SelectItem>
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
                          <FormItem>
                            <FormLabel>Start Date</FormLabel>
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
                            <FormLabel>End Date</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setIsFormOpen(false)
                          form.reset()
                          setEditingGrant(null)
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        className="bg-[#007229] hover:bg-[#007229]/90 text-white"
                      >
                        {editingGrant ? 'Update' : 'Create'}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Donor</TableHead>
                <TableHead>Grant Name</TableHead>
                <TableHead>Short Name</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No grant calls found
                  </TableCell>
                </TableRow>
              ) : (
                grants.map((grant) => (
                  <TableRow key={grant.id}>
                    <TableCell>
                      <Badge variant="outline">
                        {grant.donor.short_name || grant.donor.name}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{grant.name}</TableCell>
                    <TableCell>{grant.shortname || '—'}</TableCell>
                    <TableCell>{formatCurrency(grant.amount)}</TableCell>
                    <TableCell>
                      <Badge variant={grant.status === 'open' ? 'default' : 'secondary'}>
                        {grant.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(grant.start_date)}</TableCell>
                    <TableCell>{formatDate(grant.end_date)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(grant)}
                          className="h-8 w-8"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(grant.id)}
                          className="h-8 w-8 text-destructive hover:text-destructive/80"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

