'use client'

import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Plus, Trash2, Pencil, Building2, ChevronDown, ChevronUp, X } from 'lucide-react'
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
  grant_id: z.string().min(1, "Grant ID is required"),
  donor_id: z.string().min(1, "Donor is required"),
  donor_name: z.string().min(1, "Donor Name is required"),
  project_name: z.string().optional(),
  partner_name: z.string().optional(),
  grant_start_date: z.string().optional(),
  grant_end_date: z.string().optional(),
  status: z.string().optional(),
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
  donor_id?: string | null
  donor_name?: string | null
  partner_name?: string | null
  project_name: string | null
  grant_start_date: string | null
  grant_end_date: string | null
  status: string | null
  total_transferred_amount_usd: number | null
  sum_activity_amount: number | null
  sum_transfer_fee_amount: number | null
}

interface User {
  id: string
  role: string
  display_name: string | null
  err_id: string | null
}

export default function GrantCallsManager() {
  const { t } = useTranslation(['err', 'common'])
  const [donors, setDonors] = useState<Donor[]>([])
  const [partnerOptions, setPartnerOptions] = useState<string[]>([])
  const [grants, setGrants] = useState<GrantCall[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingGrant, setEditingGrant] = useState<GrantCall | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'Active' | 'Complete'>('all')
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [grantToDelete, setGrantToDelete] = useState<string | null>(null)
  const [addingDonor, setAddingDonor] = useState(false)
  const [newDonorName, setNewDonorName] = useState('')
  const [newDonorShortName, setNewDonorShortName] = useState('')
  const [addingPartner, setAddingPartner] = useState(false)
  const [newPartnerName, setNewPartnerName] = useState('')
  const [isSavingLookup, setIsSavingLookup] = useState(false)

  const canEditGrants =
    currentUser?.role === 'support' ||
    currentUser?.role === 'admin' ||
    currentUser?.role === 'superadmin'

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

      const [donorsRes, partnersRes] = await Promise.all([
        fetch('/api/donors', { cache: 'no-store' }),
        fetch('/api/ops-partners', { cache: 'no-store' }),
      ])

      if (donorsRes.ok) {
        const donorsData = await donorsRes.json()
        setDonors(donorsData || [])
      } else {
        const { data: donorsData, error: donorsError } = await supabase
          .from('donors')
          .select('id, name, short_name')
          .eq('status', 'active')
          .order('name', { ascending: true })
        if (donorsError) throw donorsError
        setDonors(donorsData || [])
      }

      if (partnersRes.ok) {
        const partnersData = await partnersRes.json()
        const names = (partnersData || [])
          .map((p: { name?: string }) => p.name)
          .filter((n: unknown): n is string => typeof n === 'string' && Boolean(n.trim()))
        setPartnerOptions(names)
      }

      await fetchGrants()
    } catch (error) {
      console.error('Error fetching data:', error)
      alert('Failed to fetch data')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddDonor = async () => {
    const name = newDonorName.trim()
    if (!name) return
    try {
      setIsSavingLookup(true)
      const res = await fetch('/api/donors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          short_name: newDonorShortName.trim() || name,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to add donor')
      }
      const created = await res.json()
      setDonors((prev) => {
        if (prev.some((d) => d.id === created.id)) return prev
        return [...prev, created].sort((a, b) => a.name.localeCompare(b.name))
      })
      form.setValue('donor_id', created.id)
      form.setValue('donor_name', created.name)
      setNewDonorName('')
      setNewDonorShortName('')
      setAddingDonor(false)
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : 'Failed to add donor')
    } finally {
      setIsSavingLookup(false)
    }
  }

  const handleAddPartner = async () => {
    const name = newPartnerName.trim()
    if (!name) return
    try {
      setIsSavingLookup(true)
      const res = await fetch('/api/ops-partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to add partner')
      }
      const created = await res.json()
      const createdName = created.name || name
      setPartnerOptions((prev) =>
        prev.includes(createdName) ? prev : [...prev, createdName].sort((a, b) => a.localeCompare(b))
      )
      form.setValue('partner_name', createdName)
      setNewPartnerName('')
      setAddingPartner(false)
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : 'Failed to add partner')
    } finally {
      setIsSavingLookup(false)
    }
  }

  const fetchGrants = async () => {
    try {
      // Fetch via API (canonical grants_grid_view).
      const res = await fetch(
        `/api/grants?status=${encodeURIComponent(statusFilter)}`,
        { cache: 'no-store' }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || res.statusText)
      }
      const list = await res.json()
      setGrants(list)
    } catch (error) {
      console.error('Error fetching grants:', error)
      alert('Failed to fetch grants')
    }
  }

  const onSubmit = async (values: FormData) => {
    try {
      const payload: Record<string, unknown> = {
        grant_id: values.grant_id,
        donor_id: values.donor_id,
        donor_name: values.donor_name,
        project_name: values.project_name || null,
        partner_name: values.partner_name || null,
        grant_start_date: values.grant_start_date || null,
        grant_end_date: values.grant_end_date || null,
        status: values.status || null,
      }

      // Preserve financials on edit (no longer editable in the form)
      if (editingGrant) {
        payload.total_transferred_amount_usd = editingGrant.total_transferred_amount_usd
        payload.sum_activity_amount = editingGrant.sum_activity_amount
        payload.sum_transfer_fee_amount = editingGrant.sum_transfer_fee_amount
      }

      if (editingGrant) {
        const res = await fetch(`/api/grants/${editingGrant.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Failed to update grant')
        }
        alert('Grant updated successfully')
      } else {
        const res = await fetch('/api/grants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            sync_to_p2h_airtable: true,
          }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Failed to create grant')
        }
        alert('Grant created successfully')
      }

      form.reset()
      setIsFormOpen(false)
      setEditingGrant(null)
      setAddingDonor(false)
      setAddingPartner(false)
      fetchGrants()
    } catch (error: unknown) {
      console.error('Error saving grant:', error)
      alert(error instanceof Error ? error.message : 'Failed to save grant')
    }
  }

  const handleEdit = (grant: GrantCall) => {
    setEditingGrant(grant)
    if (grant.partner_name) {
      setPartnerOptions((prev) =>
        prev.includes(grant.partner_name!)
          ? prev
          : [...prev, grant.partner_name!].sort((a, b) => a.localeCompare(b))
      )
    }
    form.reset({
      grant_id: grant.grant_id,
      donor_id: grant.donor_id || '',
      donor_name: grant.donor_name || '',
      project_name: grant.project_name || '',
      partner_name: grant.partner_name || '',
      grant_start_date: grant.grant_start_date || '',
      grant_end_date: grant.grant_end_date || '',
      status: grant.status || 'Active',
    })
    setAddingDonor(false)
    setAddingPartner(false)
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
      const res = await fetch(`/api/grants/${grantToDelete}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to delete grant')
      }
      alert('Grant deleted successfully')
      setDeleteConfirmOpen(false)
      setDeleteConfirmText('')
      setGrantToDelete(null)
      fetchGrants()
    } catch (error: unknown) {
      console.error('Error deleting grant:', error)
      alert(error instanceof Error ? error.message : 'Failed to delete grant')
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
            {grants.length > 0 && (
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
          {!isCollapsed && (
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
            {canEditGrants && (
              <>
                {!isEditMode ? (
                  <Button onClick={() => setIsEditMode(true)}>
                    Edit Grant Table
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
                        setAddingDonor(false)
                        setAddingPartner(false)
                        setNewDonorName('')
                        setNewDonorShortName('')
                        setNewPartnerName('')
                      }
                    }}>
                      <DialogTrigger asChild>
                        <Button>
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4 items-start">
                      <FormField
                        control={form.control}
                        name="grant_id"
                        render={({ field }) => (
                          <FormItem className="min-w-0">
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
                          <FormItem className="min-w-0">
                            <FormLabel>Donor *</FormLabel>
                            {addingDonor ? (
                              <div className="space-y-2">
                                <Input
                                  value={newDonorName}
                                  onChange={(e) => setNewDonorName(e.target.value)}
                                  placeholder="Donor name"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault()
                                      handleAddDonor()
                                    }
                                    if (e.key === 'Escape') {
                                      setAddingDonor(false)
                                      setNewDonorName('')
                                      setNewDonorShortName('')
                                    }
                                  }}
                                />
                                <Input
                                  value={newDonorShortName}
                                  onChange={(e) => setNewDonorShortName(e.target.value)}
                                  placeholder="Short name (optional)"
                                />
                                <div className="flex items-center gap-1">
                                  <Button
                                    type="button"
                                    size="sm"
                                    disabled={isSavingLookup || !newDonorName.trim()}
                                    onClick={handleAddDonor}
                                  >
                                    Save
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => {
                                      setAddingDonor(false)
                                      setNewDonorName('')
                                      setNewDonorShortName('')
                                    }}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 min-w-0">
                                <Select
                                  onValueChange={(value) => {
                                    field.onChange(value)
                                    const selectedDonor = donors.find((d) => d.id === value)
                                    if (selectedDonor) {
                                      form.setValue('donor_name', selectedDonor.name)
                                    }
                                  }}
                                  value={field.value || ''}
                                >
                                  <FormControl>
                                    <SelectTrigger className="w-full min-w-0">
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
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-9 w-9 shrink-0"
                                  title="Add donor"
                                  onClick={() => setAddingDonor(true)}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="project_name"
                        render={({ field }) => (
                          <FormItem className="min-w-0">
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
                          <FormItem className="min-w-0">
                            <FormLabel>Partner Name</FormLabel>
                            {addingPartner ? (
                              <div className="flex items-center gap-2 min-w-0">
                                <Input
                                  value={newPartnerName}
                                  onChange={(e) => setNewPartnerName(e.target.value)}
                                  placeholder="New partner name"
                                  className="min-w-0"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault()
                                      handleAddPartner()
                                    }
                                    if (e.key === 'Escape') {
                                      setAddingPartner(false)
                                      setNewPartnerName('')
                                    }
                                  }}
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  className="shrink-0"
                                  disabled={isSavingLookup || !newPartnerName.trim()}
                                  onClick={handleAddPartner}
                                >
                                  Save
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 shrink-0"
                                  onClick={() => {
                                    setAddingPartner(false)
                                    setNewPartnerName('')
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 min-w-0">
                                <Select
                                  value={field.value || undefined}
                                  onValueChange={field.onChange}
                                >
                                  <FormControl>
                                    <SelectTrigger className="w-full min-w-0">
                                      <SelectValue placeholder="Select partner" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {partnerOptions.map((partner) => (
                                      <SelectItem key={partner} value={partner}>
                                        {partner}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-9 w-9 shrink-0"
                                  title="Add partner"
                                  onClick={() => setAddingPartner(true)}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="grant_start_date"
                        render={({ field }) => (
                          <FormItem className="min-w-0">
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
                          <FormItem className="min-w-0">
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
                        name="status"
                        render={({ field }) => (
                          <FormItem className="min-w-0">
                            <FormLabel>Status</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || 'Active'}>
                              <FormControl>
                                <SelectTrigger className="w-full">
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
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
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
                      <Button type="submit">
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
          )}
        </div>
      </CardHeader>
      {!isCollapsed && (
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="min-w-[800px] text-xs [&_th]:py-1.5 [&_th]:px-2 [&_td]:py-1 [&_td]:px-2">
            <TableHeader>
              <TableRow>
                <TableHead className="px-2">Grant ID</TableHead>
                <TableHead className="px-2">Project Name</TableHead>
                <TableHead className="px-2">Start Date</TableHead>
                <TableHead className="px-2">End Date</TableHead>
                <TableHead className="px-2">Status</TableHead>
                <TableHead className="px-2">Total Transferred (USD)</TableHead>
                <TableHead className="px-2">Sum Activity Amount (USD)</TableHead>
                <TableHead className="px-2">Sum Transfer Fee (USD)</TableHead>
                {canEditGrants && isEditMode && <TableHead className="px-2">Actions</TableHead>}
              </TableRow>
              {grants.length > 0 && (
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="px-2 font-semibold text-foreground whitespace-nowrap">
                    Total ({grants.length} {grants.length === 1 ? 'row' : 'rows'})
                  </TableHead>
                  <TableHead className="px-2" />
                  <TableHead className="px-2" />
                  <TableHead className="px-2" />
                  <TableHead className="px-2" />
                  <TableHead className="px-2 text-right font-semibold text-foreground whitespace-nowrap">
                    {formatCurrency(
                      grants.reduce((s, g) => s + (Number(g.total_transferred_amount_usd) || 0), 0)
                    )}
                  </TableHead>
                  <TableHead className="px-2 text-right font-semibold text-foreground whitespace-nowrap">
                    {formatCurrency(
                      grants.reduce((s, g) => s + (Number(g.sum_activity_amount) || 0), 0)
                    )}
                  </TableHead>
                  <TableHead className="px-2 text-right font-semibold text-foreground whitespace-nowrap">
                    {formatCurrency(
                      grants.reduce((s, g) => s + (Number(g.sum_transfer_fee_amount) || 0), 0)
                    )}
                  </TableHead>
                  {canEditGrants && isEditMode && <TableHead className="px-2" />}
                </TableRow>
              )}
            </TableHeader>
            <TableBody>
              {grants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canEditGrants && isEditMode ? 9 : 8} className="text-center py-6 text-muted-foreground text-xs">
                    No grants found
                  </TableCell>
                </TableRow>
              ) : (
                grants.map((grant) => (
                  <TableRow key={grant.id}>
                    <TableCell className="font-medium whitespace-nowrap">{grant.grant_id}</TableCell>
                    <TableCell className="max-w-[140px] truncate" title={grant.project_name || undefined}>{grant.project_name || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(grant.grant_start_date)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(grant.grant_end_date)}</TableCell>
                    <TableCell>
                      <Badge variant={grant.status === 'Active' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                        {grant.status || '—'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatCurrency(grant.total_transferred_amount_usd)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatCurrency(grant.sum_activity_amount)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatCurrency(grant.sum_transfer_fee_amount)}</TableCell>
                    {canEditGrants && isEditMode && (
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              handleEdit(grant)
                              setIsFormOpen(true)
                            }}
                            className="h-7 w-7"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteClick(grant.id)}
                            className="h-7 w-7 text-destructive hover:text-destructive/80"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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

