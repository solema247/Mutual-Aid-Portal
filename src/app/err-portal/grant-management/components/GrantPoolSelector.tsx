'use client'

import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, DollarSign, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'

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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

import type { CycleGrantInclusion } from '@/types/cycles'

interface GrantCall {
  id: string
  name: string
  shortname: string | null
  amount: number | null
  available_amount: number | null  // Amount still available for inclusion
  status: 'open' | 'closed'
  donor: {
    id: string
    name: string
    short_name: string | null
  }
}

interface GrantPoolSelectorProps {
  cycleId: string
  onGrantsChanged?: () => void
}

export default function GrantPoolSelector({ cycleId, onGrantsChanged }: GrantPoolSelectorProps) {
  const { t } = useTranslation(['err', 'common'])
  const [availableGrants, setAvailableGrants] = useState<GrantCall[]>([])
  const [includedGrants, setIncludedGrants] = useState<CycleGrantInclusion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [selectedGrant, setSelectedGrant] = useState<string>('')
  const [amountIncluded, setAmountIncluded] = useState<string>('')
  const [amountError, setAmountError] = useState<string>('')

  useEffect(() => {
    fetchData()
  }, [cycleId])

  const fetchData = async () => {
    try {
      setIsLoading(true)
      
      // Fetch available grants
      const grantsResponse = await fetch('/api/grant-calls')
      if (!grantsResponse.ok) throw new Error('Failed to fetch grants')
      const grantsData = await grantsResponse.json()
      setAvailableGrants(grantsData.filter((grant: GrantCall) => grant.status === 'open'))

      // Fetch included grants for this cycle
      const inclusionsResponse = await fetch(`/api/cycles/${cycleId}/grants`)
      if (!inclusionsResponse.ok) throw new Error('Failed to fetch cycle grants')
      const inclusionsData = await inclusionsResponse.json()
      setIncludedGrants(inclusionsData)
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddGrant = async () => {
    if (!selectedGrant || !amountIncluded) return

    // Get the selected grant
    const selectedGrantCall = availableGrants.find(g => g.id === selectedGrant)
    if (!selectedGrantCall) return

    // Validate amount
    const amount = parseFloat(amountIncluded)
    if (selectedGrantCall.available_amount !== null && amount > selectedGrantCall.available_amount) {
      alert(t('err:cycles.pool.amount_exceeds_available'))
      return
    }

    try {
      const response = await fetch(`/api/cycles/${cycleId}/grants`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_inclusions: [{
            grant_call_id: selectedGrant,
            amount_included: amount
          }]
        }),
      })

      if (!response.ok) throw new Error('Failed to add grant to cycle')

      setIsAddOpen(false)
      setSelectedGrant('')
      setAmountIncluded('')
      fetchData()
      onGrantsChanged?.() // Notify parent that grants changed
    } catch (error) {
      console.error('Error adding grant:', error)
      alert('Failed to add grant to cycle')
    }
  }

  const handleRemoveGrant = async (grantId: string) => {
    try {
      const response = await fetch(`/api/cycles/${cycleId}/grants/${grantId}`, {
        method: 'DELETE',
      })

      if (!response.ok) throw new Error('Failed to remove grant from cycle')

      fetchData()
      onGrantsChanged?.() // Notify parent that grants changed
    } catch (error) {
      console.error('Error removing grant:', error)
      alert('Failed to remove grant from cycle')
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount)
  }

  const getTotalIncluded = () => {
    return includedGrants.reduce((sum, inclusion) => sum + inclusion.amount_included, 0)
  }

  const getAvailableGrants = () => {
    const includedGrantIds = includedGrants.map(inc => inc.grant_calls?.id).filter(Boolean)
    return availableGrants.filter(grant => !includedGrantIds.includes(grant.id))
  }

  if (isLoading) {
    return <div className="text-center py-4">{t('common:loading')}</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          {t('err:cycles.pool.title')}
        </h3>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-[#007229] hover:bg-[#007229]/90 text-white">
                <Plus className="h-4 w-4 mr-2" />
                {t('err:cycles.pool.add_grant')}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>{t('err:cycles.pool.add_grant_dialog')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">{t('err:cycles.pool.select_grant')}</label>
                  <Select 
                    value={selectedGrant} 
                    onValueChange={(value) => {
                      setSelectedGrant(value)
                      setAmountIncluded('')
                      setAmountError('')
                    }}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('err:cycles.pool.choose_grant_placeholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {getAvailableGrants().map((grant) => (
                        <SelectItem key={grant.id} value={grant.id}>
                          <div>
                            <div className="font-medium">{grant.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {grant.donor.name} - {formatCurrency(grant.amount || 0)}
                              {grant.available_amount !== null && (
                                <span className="ml-2 text-green-600">
                                  (Available: {formatCurrency(grant.available_amount)})
                                </span>
                              )}
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">{t('err:cycles.pool.amount_to_include')}</label>
                  <div className="space-y-2">
                    <Input
                      type="number"
                      placeholder={t('err:cycles.pool.amount_placeholder') as string}
                      value={amountIncluded}
                      onChange={(e) => {
                        const value = e.target.value
                        setAmountIncluded(value)
                        
                        // Clear error if empty
                        if (!value) {
                          setAmountError('')
                          return
                        }

                        // Validate amount
                        const amount = parseFloat(value)
                        const selectedGrantCall = availableGrants.find(g => g.id === selectedGrant)
                        
                        if (selectedGrantCall?.available_amount !== null && amount > selectedGrantCall.available_amount) {
                          setAmountError(t('cycles.pool.amount_exceeds_available'))
                        } else {
                          setAmountError('')
                        }
                      }}
                      className={cn(amountError && "border-red-500 focus-visible:ring-red-500")}
                    />
                    {amountError && (
                      <div className="text-sm text-red-500">
                        {amountError}
                      </div>
                    )}
                    {selectedGrant && (
                      <div className="text-sm text-muted-foreground">
                        {t('cycles.pool.available_amount')}: {formatCurrency(availableGrants.find(g => g.id === selectedGrant)?.available_amount || 0)}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => setIsAddOpen(false)}>
                    {t('common:cancel')}
                  </Button>
                  <Button 
                    onClick={handleAddGrant}
                    disabled={!selectedGrant || !amountIncluded || !!amountError}
                    className="bg-[#007229] hover:bg-[#007229]/90 text-white"
                  >
                    {t('err:cycles.pool.add_grant')}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
      </div>
          {/* Summary */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              <span className="font-medium">{t('err:cycles.pool.total_pool')}</span>
            </div>
            <span className="text-lg font-bold">
              {formatCurrency(getTotalIncluded())}
            </span>
          </div>

          {/* Included Grants Table */}
          {includedGrants.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('err:cycles.pool.no_grants')}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('err:cycles.pool.headers.grant')}</TableHead>
                  <TableHead>{t('err:cycles.pool.headers.donor')}</TableHead>
                  <TableHead className="text-right">{t('err:cycles.pool.headers.amount_included')}</TableHead>
                  <TableHead className="w-[100px]">{t('err:cycles.pool.headers.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {includedGrants.map((inclusion) => (
                  <TableRow key={inclusion.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {inclusion.grant_calls?.name || 'Unknown Grant'}
                        </div>
                        {inclusion.grant_calls?.shortname && (
                          <div className="text-sm text-muted-foreground">
                            {inclusion.grant_calls.shortname}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          {inclusion.grant_calls?.donor?.short_name || inclusion.grant_calls?.donor?.name}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(inclusion.amount_included)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveGrant(inclusion.grant_calls?.id || '')}
                        className="h-8 w-8 text-destructive hover:text-destructive/80"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
    </div>
  )
}
