'use client'

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabaseClient'
import { Search, Filter } from 'lucide-react'
import type { CommittedF1, FilterOptions } from '../types'

export default function CommittedF1sTab() {
  const { t } = useTranslation(['f2', 'common'])
  const [f1s, setF1s] = useState<CommittedF1[]>([])
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    grantCalls: [],
    donors: [],
    cycles: [],
    states: []
  })
  const [filters, setFilters] = useState({
    search: '',
    grantCall: 'all',
    donor: 'all',
    cycle: 'all',
    state: 'all'
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchCommittedF1s()
    fetchFilterOptions()
  }, [])

  useEffect(() => {
    applyFilters()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  const fetchCommittedF1s = async () => {
    try {
      const params = new URLSearchParams()
      if (filters.grantCall && filters.grantCall !== 'all') params.append('grant_call', filters.grantCall)
      if (filters.cycle && filters.cycle !== 'all') params.append('cycle', filters.cycle)
      if (filters.state && filters.state !== 'all') params.append('state', filters.state)
      if (filters.search) params.append('search', filters.search)
      if (filters.donor && filters.donor !== 'all') params.append('donor', filters.donor)

      const response = await fetch(`/api/f2/committed?${params.toString()}`)
      if (!response.ok) throw new Error('Failed to fetch committed F1s')
      const data = await response.json()
      setF1s(data)
    } catch (error) {
      console.error('Error fetching committed F1s:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchFilterOptions = async () => {
    try {
      // Fetch grant calls
      const { data: grantCallsData } = await supabase
        .from('grant_calls')
        .select('id, name, donors (name)')
        .eq('status', 'open')

      // Fetch donors
      const { data: donorsData } = await supabase
        .from('donors')
        .select('id, name')

      // Fetch funding cycles
      const { data: cyclesData } = await supabase
        .from('funding_cycles')
        .select('id, name, year')
        .order('year', { ascending: false })

      // Fetch states (deduplicate by state_name)
      const { data: statesData } = await supabase
        .from('states')
        .select('state_name')
        .not('state_name', 'is', null)

      setFilterOptions({
        grantCalls: (grantCallsData || []).map((gc: any) => ({
          id: gc.id,
          name: gc.name,
          donor_name: gc.donors?.name || 'Unknown'
        })),
        donors: donorsData || [],
        cycles: cyclesData || [],
        states: Array.from(new Set(((statesData || []) as any[]).map((s: any) => s.state_name)))
          .filter(Boolean)
          .map((name: string) => ({ name }))
      })
    } catch (error) {
      console.error('Error fetching filter options:', error)
    }
  }

  const applyFilters = () => {
    // Since the API now handles most filtering, we just need to refresh the data
    fetchCommittedF1s()
  }

  const calculateTotalAmount = (expenses: Array<{ activity: string; total_cost: number }>) => {
    return expenses.reduce((sum, exp) => sum + (exp.total_cost || 0), 0)
  }

  const clearFilters = () => {
    setFilters({
      search: '',
      grantCall: 'all',
      donor: 'all',
      cycle: 'all',
      state: 'all'
    })
  }

  if (isLoading) {
    return <div className="text-center py-8">{t('common:loading')}</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">{t('f2:committed_header', { count: f1s.length })}</h3>
          <p className="text-sm text-muted-foreground">{t('f2:committed_desc')}</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="w-4 h-4" />
            {t('f2:filters')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>{t('f2:search')}</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder={t('f2:search_placeholder') as string}
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <Label>{t('f2:grant_call')}</Label>
              <Select
                value={filters.grantCall}
                onValueChange={(value) => setFilters(prev => ({ ...prev, grantCall: value }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('f2:all_grant_calls') as string} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('f2:all_grant_calls')}</SelectItem>
                  {filterOptions.grantCalls.map(gc => (
                    <SelectItem key={gc.id} value={gc.id}>
                      {gc.donor_name} — {gc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('f2:donor')}</Label>
              <Select
                value={filters.donor}
                onValueChange={(value) => setFilters(prev => ({ ...prev, donor: value }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('f2:all_donors_label') as string} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('f2:all_donors_label')}</SelectItem>
                  {filterOptions.donors.map(donor => (
                    <SelectItem key={donor.id} value={donor.name}>
                      {donor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('f2:funding_cycle_label')}</Label>
              <Select
                value={filters.cycle}
                onValueChange={(value) => setFilters(prev => ({ ...prev, cycle: value }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('f2:all_cycles') as string} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('f2:all_cycles')}</SelectItem>
                  {filterOptions.cycles.map(cycle => (
                    <SelectItem key={cycle.id} value={cycle.id}>
                      {cycle.name} ({cycle.year})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('f2:state_label')}</Label>
              <Select
                value={filters.state}
                onValueChange={(value) => setFilters(prev => ({ ...prev, state: value }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('f2:all_states') as string} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('f2:all_states')}</SelectItem>
                  {filterOptions.states.map(state => (
                    <SelectItem key={state.name} value={state.name}>
                      {state.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={clearFilters} className="w-full">
                {t('f2:clear_filters')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('f2:err_id')}</TableHead>
                <TableHead>{t('f2:date')}</TableHead>
                <TableHead>{t('f2:state')}</TableHead>
                <TableHead>{t('f2:locality')}</TableHead>
                <TableHead>{t('f2:grant_name')}</TableHead>
                <TableHead>{t('f2:donor')}</TableHead>
                <TableHead>{t('f2:funding_cycle_label')}</TableHead>
                <TableHead className="text-right">{t('f2:requested_amount')}</TableHead>
                <TableHead>{t('f2:committed')}</TableHead>
                <TableHead>{t('f2:status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {f1s.map((f1) => (
                <TableRow key={f1.id}>
                  <TableCell>
                    <div className="font-medium">{f1.err_id}</div>
                    <div className="text-sm text-muted-foreground">{f1.err_code}</div>
                  </TableCell>
                  <TableCell>{new Date(f1.date).toLocaleDateString()}</TableCell>
                  <TableCell>{f1.state}</TableCell>
                  <TableCell>{f1.locality}</TableCell>
                  <TableCell>{f1.grant_call_name || '-'}</TableCell>
                  <TableCell>{f1.donor_name || '-'}</TableCell>
                  <TableCell>{f1.funding_cycle_name || '-'}</TableCell>
                  <TableCell className="text-right font-medium">
                    {calculateTotalAmount(f1.expenses).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {new Date(f1.committed_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant="default">
                      {f1.funding_status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {f1s.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">{t('f2:no_committed')}</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
