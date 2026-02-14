'use client'

import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Plus, Trash2, Pencil, Building2, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'

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
  grant_id: z.string().min(1, "Grant ID is required"),
  donor_id: z.string().min(1, "Donor is required"),
  donor_name: z.string().min(1, "Donor Name is required"),
  project_name: z.string().optional(),
  partner_name: z.string().optional(),
  grant_start_date: z.string().optional(),
  grant_end_date: z.string().optional(),
  status: z.string().optional(),
  total_transferred_amount_usd: z.string().optional(),
  sum_activity_amount: z.string().optional(),
})

type FormData = z.infer<typeof formSchema>

interface Donor {
  id: string
  name: string
  short_name: string | null
}

interface GrantCall {
  id: string
  grant_id: string
  donor_id: string
  donor_name: string
  project_name: string | null
  partner_name: string | null
  grant_start_date: string | null
  grant_end_date: string | null
  status: string | null
  total_transferred_amount_usd: number | null
  sum_activity_amount: number | null
  donor: Donor
}

interface User {
  id: string
  role: string
  display_name: string | null
  err_id: string | null
}

export default function GrantCallsManager() {
  const { t } = useTranslation(['err', 'common'])
  const { can } = useAllowedFunctions()
  const [donors, setDonors] = useState<Donor[]>([])
  const [grants, setGrants] = useState<GrantCall[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingGrant, setEditingGrant] = useState<GrantCall | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'Active' | 'Complete'>('all')
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [isCollapsed, setIsCollapsed] = useState(true)
  const [isEditMode, setIsEditMode] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [grantToDelete, setGrantToDelete] = useState<string | null>(null)

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      grant_id: '',
      donor_id: '',
      donor_name: '',
      project_name: '',
      partner_name: '',
      grant_start_date: '',
      grant_end_date: '',
      status: 'Active',
      total_transferred_amount_usd: '',
      sum_activity_amount: '',
    },
  })

  useEffect(() => {
    checkAuth()
    fetchData()
  }, [statusFilter])

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/users/me')
      if (res.ok) {
        const userData = await res.json()
        setCurrentUser(userData)
      }
    } catch (error) {
      console.error('Auth check error:', error)
    }
  }

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
        .from('grants_grid_view')
        .select(`
          id,
          grant_id,
          donor_id,
          donor_name,
          project_name,
          partner_name,
          grant_start_date,
          grant_end_date,
          status,
          total_transferred_amount_usd,
          sum_activity_amount,
          donors (
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
      
      // Get unique grants (group by grant_id and donor_name)
      const uniqueGrants = new Map()
      ;(data || []).forEach((item: any) => {
        const key = `${item.grant_id}|${item.donor_name}`
        if (!uniqueGrants.has(key)) {
          uniqueGrants.set(key, {
            id: item.id,
            grant_id: item.grant_id,
            donor_id: item.donor_id,
            donor_name: item.donor_name,
            project_name: item.project_name,
            partner_name: item.partner_name,
            grant_start_date: item.grant_start_date,
            grant_end_date: item.grant_end_date,
            status: item.status,
            total_transferred_amount_usd: item.total_transferred_amount_usd,
            sum_activity_amount: item.sum_activity_amount,
            donor: item.donors ? {
              id: item.donors.id,
              name: item.donors.name,
              short_name: item.donors.short_name
            } : {
              id: item.donor_id || '',
              name: item.donor_name || '',
              short_name: null
            }
          })
        }
      })
      
      setGrants(Array.from(uniqueGrants.values()))
    } catch (error) {
      console.error('Error fetching grants:', error)
      alert('Failed to fetch grants')
    }
  }

  const onSubmit = async (values: FormData) => {
    try {
      const submissionData: any = {
        grant_id: values.grant_id,
        donor_id: values.donor_id,
        donor_name: values.donor_name,
        project_name: values.project_name || null,
        partner_name: values.partner_name || null,
        grant_start_date: values.grant_start_date || null,
        grant_end_date: values.grant_end_date || null,
        status: values.status || null,
        total_transferred_amount_usd: values.total_transferred_amount_usd ? parseFloat(values.total_transferred_amount_usd) : null,
        sum_activity_amount: values.sum_activity_amount ? parseFloat(values.sum_activity_amount) : null,
      }

      if (editingGrant) {
        // Update existing grant
        const { error } = await supabase
          .from('grants_grid_view')
          .update(submissionData)
          .eq('id', editingGrant.id)

        if (error) throw error
        alert('Grant updated successfully')
      } else {
        // Create new grant
        const { error } = await supabase
          .from('grants_grid_view')
          .insert([submissionData])

        if (error) throw error
        alert('Grant created successfully')
      }

      form.reset()
      setIsFormOpen(false)
      setEditingGrant(null)
      fetchGrants()
    } catch (error) {
      console.error('Error saving grant:', error)
      alert('Failed to save grant')
    }
  }

  const handleEdit = (grant: GrantCall) => {
    setEditingGrant(grant)
    form.reset({
      grant_id: grant.grant_id,
      donor_id: grant.donor_id,
      donor_name: grant.donor_name,
      project_name: grant.project_name || '',
      partner_name: grant.partner_name || '',
      grant_start_date: grant.grant_start_date || '',
      grant_end_date: grant.grant_end_date || '',
      status: grant.status || 'Active',
      total_transferred_amount_usd: grant.total_transferred_amount_usd?.toString() || '',
      sum_activity_amount: grant.sum_activity_amount?.toString() || '',
    })
    setIsFormOpen(true)
  }

  const handleDeleteClick = (grantId: string) => {
    setGrantToDelete(grantId)
    setDeleteConfirmOpen(true)
    setDeleteConfirmText('')
  }

  const handleDeleteConfirm = async () => {
    if (deleteConfirmText !== 'Confirm') {
      alert('Please type "Confirm" to delete this grant')
      return
    }

    if (!grantToDelete) return

    try {
      const { error } = await supabase
        .from('grants_grid_view')
        .delete()
        .eq('id', grantToDelete)

      if (error) throw error
      alert('Grant deleted successfully')
      setDeleteConfirmOpen(false)
      setDeleteConfirmText('')
      setGrantToDelete(null)
      fetchGrants()
    } catch (error) {
      console.error('Error deleting grant:', error)
      alert('Failed to delete grant')
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
          <CardTitle 
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            <Building2 className="h-5 w-5" />
            Grants Table
            {isCollapsed && grants.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground ml-2">
                ({grants.length} {grants.length === 1 ? 'grant' : 'grants'})
              </span>
            )}
            {isCollapsed ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select
              value={statusFilter}
              onValueChange={(value: 'all' | 'Active' | 'Complete') => setStatusFilter(value)}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Complete">Complete</SelectItem>
              </SelectContent>
            </Select>
            {(can('grant_edit_call') || can('grant_create_call') || can('grant_delete_call')) && (
              <>
                {!isEditMode ? (
                  <Button 
                    className="bg-[#007229] hover:bg-[#007229]/90 text-white"
                    onClick={() => setIsEditMode(true)}
                    disabled={!can('grant_edit_call')}
                    title={!can('grant_edit_call') ? t('common:no_permission') : undefined}
                  >
                    Edit Grant Call Table
                  </Button>
                ) : (
                  <>
                    <Button 
                      variant="outline"
                      onClick={() => setIsEditMode(false)}
                    >
                      Exit Edit Mode
                    </Button>
                    <Dialog open={isFormOpen} onOpenChange={(open) => {
                      setIsFormOpen(open)
                      if (!open) {
                        form.reset()
                        setEditingGrant(null)
                      }
                    }}>
                      <DialogTrigger asChild>
                        <Button className="bg-[#007229] hover:bg-[#007229]/90 text-white" disabled={!can('grant_create_call')} title={!can('grant_create_call') ? t('common:no_permission') : undefined}>
                          <Plus className="h-4 w-4 mr-2" />
                          Create Grant
                        </Button>
                      </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingGrant ? 'Edit Grant' : 'Create Grant'}
                  </DialogTitle>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="grant_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Grant ID *</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="donor_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Donor *</FormLabel>
                            <Select onValueChange={(value) => {
                              field.onChange(value)
                              const selectedDonor = donors.find(d => d.id === value)
                              if (selectedDonor) {
                                form.setValue('donor_name', selectedDonor.name)
                              }
                            }} value={field.value || ''}>
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
                        name="donor_name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Donor Name *</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="project_name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Project Name</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="partner_name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Partner Name</FormLabel>
                            <FormControl>
                              <Input {...field} />
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
                            <FormLabel>Status</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || 'Active'}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="Active">Active</SelectItem>
                                <SelectItem value="Complete">Complete</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="grant_start_date"
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
                        name="grant_end_date"
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

                      <FormField
                        control={form.control}
                        name="total_transferred_amount_usd"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Total Transferred Amount (USD)</FormLabel>
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
                        name="sum_activity_amount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Sum Activity Amount</FormLabel>
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
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </CardHeader>
      {!isCollapsed && (
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Grant ID</TableHead>
                <TableHead>Donor</TableHead>
                <TableHead>Project Name</TableHead>
                <TableHead>Partner</TableHead>
                <TableHead>Total Transferred</TableHead>
                <TableHead>Sum Activity Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                {(currentUser?.role === 'admin' || currentUser?.role === 'superadmin') && isEditMode && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {grants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={(currentUser?.role === 'admin' || currentUser?.role === 'superadmin') && isEditMode ? 10 : 9} className="text-center py-8 text-muted-foreground">
                    No grants found
                  </TableCell>
                </TableRow>
              ) : (
                grants.map((grant) => (
                  <TableRow key={grant.id}>
                    <TableCell className="font-medium">{grant.grant_id}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {grant.donor.short_name || grant.donor.name || grant.donor_name}
                      </Badge>
                    </TableCell>
                    <TableCell>{grant.project_name || '—'}</TableCell>
                    <TableCell>{grant.partner_name || '—'}</TableCell>
                    <TableCell>{formatCurrency(grant.total_transferred_amount_usd)}</TableCell>
                    <TableCell>{formatCurrency(grant.sum_activity_amount)}</TableCell>
                    <TableCell>
                      <Badge variant={grant.status === 'Active' ? 'default' : 'secondary'}>
                        {grant.status || '—'}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(grant.grant_start_date)}</TableCell>
                    <TableCell>{formatDate(grant.grant_end_date)}</TableCell>
                    {(can('grant_edit_call') || can('grant_delete_call')) && isEditMode && (
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={!can('grant_edit_call')}
                            title={!can('grant_edit_call') ? t('common:no_permission') : undefined}
                            onClick={() => {
                              handleEdit(grant)
                              setIsFormOpen(true)
                            }}
                            className="h-8 w-8"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={!can('grant_delete_call')}
                            title={!can('grant_delete_call') ? t('common:no_permission') : undefined}
                            onClick={() => handleDeleteClick(grant.id)}
                            className="h-8 w-8 text-destructive hover:text-destructive/80"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete Grant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete this grant? This action cannot be undone.
            </p>
            <p className="text-sm font-medium">
              Type <span className="font-bold text-destructive">Confirm</span> to proceed:
            </p>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type 'Confirm' here"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteConfirmOpen(false)
                  setDeleteConfirmText('')
                  setGrantToDelete(null)
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteConfirm}
                disabled={deleteConfirmText !== 'Confirm'}
              >
                Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

