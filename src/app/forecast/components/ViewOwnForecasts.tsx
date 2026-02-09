'use client'

import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Pencil, Trash2, X, Check, ArrowUpDown, Search } from 'lucide-react'
import React from 'react'
import { Label } from '@/components/ui/label'

interface Forecast {
  id: string
  month: string
  state_name: string
  amount: number
  localities: string | null
  intermediary: string | null
  transfer_method: string
  source: string
  receiving_mag: string
  status: string
}

interface EditingForecast {
  amount: string
  localities: string
  status: string
}

interface SortConfig {
  key: keyof Forecast | null
  direction: 'asc' | 'desc'
}

interface Filters {
  month: string
  state: string
  status: string
  transfer_method: string
  source: string
  receiving_mag: string
}

interface EditActionsProps {
  onSave: () => void
  onCancel: () => void
}

interface ViewActionsProps {
  onEdit: () => void
  onDelete: () => void
}

interface StatusSelectProps {
  id?: string // forecast.id passed in
  value: string
  onChange: (value: string) => void
}

const StatusSelect = ({ id = '', value, onChange }: StatusSelectProps) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger className="w-[100px]">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem key={`planned-${id}`} value="planned">Planned</SelectItem>
      <SelectItem key={`complete-${id}`} value="complete">Complete</SelectItem>
    </SelectContent>
  </Select>
)

const EditActions = ({ onSave, onCancel }: EditActionsProps) => (
  <div className="flex items-center gap-2">
    <Button
      variant="ghost"
      size="icon"
      onClick={onSave}
      className="h-8 w-8 text-green-600 hover:text-green-700"
    >
      <Check className="h-4 w-4" />
    </Button>
    <Button
      variant="ghost"
      size="icon"
      onClick={onCancel}
      className="h-8 w-8 text-muted-foreground hover:text-foreground"
    >
      <X className="h-4 w-4" />
    </Button>
  </div>
)

const ViewActions = ({ onEdit, onDelete }: ViewActionsProps) => (
  <div className="flex items-center gap-2">
    <Button
      variant="ghost"
      size="icon"
      onClick={onEdit}
      className="h-8 w-8"
    >
      <Pencil className="h-4 w-4" />
    </Button>
    <Button
      variant="ghost"
      size="icon"
      onClick={onDelete}
      className="h-8 w-8 text-destructive hover:text-destructive/80"
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  </div>
)

export function ViewOwnForecasts() {
  const { t } = useTranslation(['forecast', 'common'])
  const [forecasts, setForecasts] = useState<Forecast[]>([])
  const [filteredForecasts, setFilteredForecasts] = useState<Forecast[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValues, setEditingValues] = useState<EditingForecast>({
    amount: '',
    localities: '',
    status: ''
  })
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: null,
    direction: 'asc'
  })
  const [filters, setFilters] = useState<Filters>({
    month: "all",
    state: "all",
    status: "all",
    transfer_method: "all",
    source: "all",
    receiving_mag: "all"
  })

  const fetchForecasts = async () => {
    try {
      const donorData = JSON.parse(localStorage.getItem('donor') || '{}')
      if (!donorData?.code) {
        throw new Error('No donor code found')
      }

      const { data: response, error } = await supabase
        .rpc('get_donor_forecasts', {
          p_donor_code: donorData.code
        })

      if (error) throw error

      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch forecasts')
      }

      setForecasts(response.data || [])
    } catch (err) {
      console.error('Error fetching forecasts:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch forecasts')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchForecasts()
  }, [])

  const startEditing = (forecast: Forecast) => {
    setEditingId(forecast.id)
    setEditingValues({
      amount: forecast.amount.toString(),
      localities: forecast.localities || '',
      status: forecast.status
    })
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditingValues({
      amount: '',
      localities: '',
      status: ''
    })
  }

  const handleSave = async (id: string) => {
    try {
      const donorData = JSON.parse(localStorage.getItem('donor') || '{}')
      if (!donorData?.code) {
        throw new Error('No donor code found')
      }

      const amount = parseFloat(editingValues.amount)
      if (isNaN(amount)) {
        throw new Error('Invalid amount')
      }

      const { data: response, error } = await supabase
        .rpc('update_donor_forecast', {
          p_donor_code: donorData.code,
          p_id: id,
          p_amount: amount,
          p_localities: editingValues.localities || null,
          p_status: editingValues.status
        })

      if (error) throw error

      if (!response.success) {
        throw new Error(response.error || 'Failed to update forecast')
      }

      await fetchForecasts()
      cancelEditing()
    } catch (err) {
      console.error('Error updating forecast:', err)
      setError(err instanceof Error ? err.message : 'Failed to update forecast')
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('forecast:confirm_delete'))) return

    try {
      const donorData = JSON.parse(localStorage.getItem('donor') || '{}')
      if (!donorData?.code) {
        throw new Error('No donor code found')
      }

      const { data: response, error } = await supabase
        .rpc('delete_donor_forecast', {
          p_donor_code: donorData.code,
          p_id: id
        })

      if (error) throw error

      if (!response.success) {
        throw new Error(response.error || 'Failed to delete forecast')
      }

      await fetchForecasts()
    } catch (err) {
      console.error('Error deleting forecast:', err)
      setError(err instanceof Error ? err.message : 'Failed to delete forecast')
    }
  }

  // Sort function
  const sortData = (data: Forecast[], key: keyof Forecast, direction: 'asc' | 'desc') => {
    return [...data].sort((a, b) => {
      if (key === 'amount') {
        return direction === 'asc' ? a[key] - b[key] : b[key] - a[key]
      }
      
      const aValue = (a[key] || '').toString().toLowerCase()
      const bValue = (b[key] || '').toString().toLowerCase()
      
      if (direction === 'asc') {
        return aValue.localeCompare(bValue)
      }
      return bValue.localeCompare(aValue)
    })
  }

  // Handle sort
  const handleSort = (key: keyof Forecast) => {
    const direction = sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc'
    setSortConfig({ key, direction })
  }

  // Filter function
  const filterData = (data: Forecast[]) => {
    return data.filter(forecast => {
      const matchesMonth = filters.month === "all" || forecast.month === filters.month
      const matchesState = filters.state === "all" || forecast.state_name === filters.state
      const matchesStatus = filters.status === "all" || forecast.status === filters.status
      const matchesTransferMethod = filters.transfer_method === "all" || forecast.transfer_method === filters.transfer_method
      const matchesSource = filters.source === "all" || forecast.source === filters.source
      const matchesReceivingMag = filters.receiving_mag === "all" || forecast.receiving_mag === filters.receiving_mag

      return matchesMonth && matchesState && matchesStatus && matchesTransferMethod && matchesSource && matchesReceivingMag
    })
  }

  // Update filtered data when forecasts, filters, or sort changes
  useEffect(() => {
    let result = [...forecasts]
    
    // Apply filters
    result = filterData(result)
    
    // Apply sort
    if (sortConfig.key) {
      result = sortData(result, sortConfig.key, sortConfig.direction)
    }
    
    setFilteredForecasts(result)
  }, [forecasts, filters, sortConfig])

  // Get unique values for filter dropdowns
  const getUniqueValues = (key: keyof Forecast) => {
    return Array.from(new Set(forecasts.map(f => f[key])))
      .filter((value): value is string => typeof value === 'string' && value !== '')
      .sort()
  }

  const SortButton = ({ column }: { column: keyof Forecast }) => (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8 data-[sorting=true]:bg-muted"
      onClick={() => handleSort(column)}
      data-sorting={sortConfig.key === column}
    >
      <ArrowUpDown className="h-4 w-4" />
    </Button>
  )

  if (loading) {
    return <div className="text-center py-4">{t('common:loading')}</div>
  }

  if (error) {
    return (
      <div className="bg-destructive/15 text-destructive px-4 py-3 rounded-md">
        {error}
      </div>
    )
  }

  if (forecasts.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        {t('forecast:no_forecasts')}
      </div>
    )
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-GB', { 
      month: 'long',
      year: 'numeric'
    })
  }

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount)
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-4 mb-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[150px]">
            <Select
              value={filters.month}
              onValueChange={(value) => setFilters(prev => ({ ...prev, month: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('forecast:filters.all_months')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('forecast:filters.all_months')}</SelectItem>
                {getUniqueValues('month').map((month) => (
                  <SelectItem key={month} value={month}>{month}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Select
            value={filters.state}
            onValueChange={(value) => setFilters(prev => ({ ...prev, state: value }))}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t('forecast:sections.form.table.state')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('forecast:filters.all_states')}</SelectItem>
              {getUniqueValues('state_name').map(state => (
                <SelectItem key={state} value={state}>{state}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.status}
            onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t('forecast:sections.form.table.status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('forecast:filters.all_statuses')}</SelectItem>
              <SelectItem value="planned">Planned</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filters.transfer_method}
            onValueChange={(value) => setFilters(prev => ({ ...prev, transfer_method: value }))}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t('forecast:sections.form.table.transfer_method')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('forecast:filters.all_methods')}</SelectItem>
              {getUniqueValues('transfer_method').map(method => (
                <SelectItem key={method} value={method}>{method}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.source}
            onValueChange={(value) => setFilters(prev => ({ ...prev, source: value }))}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t('forecast:sections.form.table.source')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('forecast:filters.all_sources')}</SelectItem>
              {getUniqueValues('source').map(source => (
                <SelectItem key={source} value={source}>{source}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.receiving_mag}
            onValueChange={(value) => setFilters(prev => ({ ...prev, receiving_mag: value }))}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t('forecast:sections.form.table.receiving_mag')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('forecast:filters.all_mags')}</SelectItem>
              {getUniqueValues('receiving_mag').map(mag => (
                <SelectItem key={mag} value={mag}>{mag}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              {t('forecast:sections.form.table.month')}
              <SortButton column="month" />
            </TableHead>
            <TableHead>
              {t('forecast:sections.form.table.state')}
              <SortButton column="state_name" />
            </TableHead>
            <TableHead>
              {t('forecast:sections.form.table.amount')}
              <SortButton column="amount" />
            </TableHead>
            <TableHead>
              {t('forecast:sections.form.table.localities')}
              <SortButton column="localities" />
            </TableHead>
            <TableHead>
              {t('forecast:sections.form.table.intermediary')}
              <SortButton column="intermediary" />
            </TableHead>
            <TableHead>
              {t('forecast:sections.form.table.transfer_method')}
              <SortButton column="transfer_method" />
            </TableHead>
            <TableHead>
              {t('forecast:sections.form.table.source')}
              <SortButton column="source" />
            </TableHead>
            <TableHead>
              {t('forecast:sections.form.table.receiving_mag')}
              <SortButton column="receiving_mag" />
            </TableHead>
            <TableHead>
              {t('forecast:sections.form.table.status')}
              <SortButton column="status" />
            </TableHead>
            <TableHead className="w-[100px]">{t('forecast:sections.form.table.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredForecasts.map((forecast) => (
            <TableRow key={forecast.id}>
              <TableCell>{formatDate(forecast.month)}</TableCell>
              <TableCell>{forecast.state_name}</TableCell>
              <TableCell>
                {editingId === forecast.id ? (
                  <Input
                    type="number"
                    value={editingValues.amount}
                    onChange={(e) => setEditingValues(prev => ({ ...prev, amount: e.target.value }))}
                    className="w-32"
                  />
                ) : (
                  formatAmount(forecast.amount)
                )}
              </TableCell>
              <TableCell>
                {editingId === forecast.id ? (
                  <Input
                    value={editingValues.localities}
                    onChange={(e) => setEditingValues(prev => ({ ...prev, localities: e.target.value }))}
                  />
                ) : (
                  forecast.localities || '-'
                )}
              </TableCell>
              <TableCell>{forecast.intermediary || '-'}</TableCell>
              <TableCell>{forecast.transfer_method}</TableCell>
              <TableCell>{forecast.source}</TableCell>
              <TableCell>{forecast.receiving_mag}</TableCell>
              <TableCell>
                {editingId === forecast.id ? (
                  <StatusSelect
                    id={forecast.id}
                    value={editingValues.status}
                    onChange={(value) => setEditingValues(prev => ({ ...prev, status: value }))}
                  />
                ) : (
                  <span className={
                    forecast.status === 'complete' 
                      ? 'text-green-600' 
                      : 'text-yellow-600'
                  }>
                    {forecast.status.charAt(0).toUpperCase() + forecast.status.slice(1)}
                  </span>
                )}
              </TableCell>
              <TableCell>
                {editingId === forecast.id ? (
                  <EditActions
                    onSave={() => handleSave(forecast.id)}
                    onCancel={cancelEditing}
                  />
                ) : (
                  <ViewActions
                    onEdit={() => startEditing(forecast)}
                    onDelete={() => handleDelete(forecast.id)}
                  />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
} 