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
import { Search, Filter, ArrowRightLeft } from 'lucide-react'
import type { CommittedF1, FilterOptions } from '../types'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export default function CommittedF1sTab() {
  const { t, i18n } = useTranslation(['f2', 'common'])
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
  const [selected, setSelected] = useState<string[]>([])
  const [partners, setPartners] = useState<Array<{ id: string; name: string }>>([])
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('')
  const [partnerModalOpen, setPartnerModalOpen] = useState(false)
  
  // Assignment modal state
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [assigningF1Ids, setAssigningF1Ids] = useState<string[]>([])
  const [isAssigning, setIsAssigning] = useState(false)
  
  // Assignment form state
  const [tempFundingCycle, setTempFundingCycle] = useState<string>('')
  const [tempGrantCall, setTempGrantCall] = useState<string>('')
  const [tempMMYY, setTempMMYY] = useState<string>('')
  const [tempGrantSerial, setTempGrantSerial] = useState<string>('')
  const [fundingCycles, setFundingCycles] = useState<any[]>([])
  const [grantCallsForCycle, setGrantCallsForCycle] = useState<any[]>([])
  const [grantSerials, setGrantSerials] = useState<any[]>([])
  const [stateShorts, setStateShorts] = useState<Record<string, string>>({})
  const [lastWorkplanNums, setLastWorkplanNums] = useState<Record<string, number>>({})
  
  // Reassignment state
  const [reassignModalOpen, setReassignModalOpen] = useState(false)
  const [reassigningF1Id, setReassigningF1Id] = useState<string | null>(null)
  const [isReassigning, setIsReassigning] = useState(false)

  const toggleAll = (checked: boolean) => {
    if (!checked) return setSelected([])
    setSelected(f1s.filter(f => !f.mou_id).map(f => f.id))
  }
  const toggleOne = (id: string, checked: boolean) => {
    if (checked) setSelected(prev => [...prev, id])
    else setSelected(prev => prev.filter(x => x !== id))
  }
  const handleAssignMultipleF1s = async () => {
    if (!tempFundingCycle || !tempGrantCall || !tempMMYY || !tempGrantSerial) {
      alert('Please fill all assignment fields')
      return
    }
    
    if (tempMMYY.length !== 4) {
      alert('MMYY must be 4 digits')
      return
    }
    
    setIsAssigning(true)
    try {
      const response = await fetch('/api/f2/committed/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          f1_ids: assigningF1Ids,
          funding_cycle_id: tempFundingCycle,
          grant_call_id: tempGrantCall,
          mmyy: tempMMYY,
          grant_serial: tempGrantSerial
        })
      })
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to assign F1s' }))
        alert(error.error || 'Failed to assign F1s')
        return
      }
      
      const result = await response.json()
      alert(`Successfully assigned ${result.assigned_count} F1(s)`)
      
      // Clear assignment form
      setTempFundingCycle('')
      setTempGrantCall('')
      setTempMMYY('')
      setTempGrantSerial('')
      setAssignModalOpen(false)
      
      // Refresh data
      await fetchCommittedF1s()
      
      // Open partner modal for MOU creation
      setPartnerModalOpen(true)
    } catch (error) {
      console.error('Error assigning F1s:', error)
      alert('Failed to assign F1s')
    } finally {
      setIsAssigning(false)
    }
  }
  
  const createMOU = async () => {
    if (selected.length === 0) return
    if (!selectedPartnerId) { alert('Please select a local partner'); return }
    const total = selected
      .map(id => f1s.find(f => f.id === id))
      .filter(Boolean)
      .reduce((s: number, f: any) => s + f.expenses.reduce((x: number, e: any) => x + (e.total_cost || 0), 0), 0)
    const body = {
      project_ids: selected,
      partner_id: selectedPartnerId,
      state: f1s.find(f => f.id === selected[0])?.state,
      mou_code: undefined,
      end_date: null
    }
    const resp = await fetch('/api/f3/mous', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!resp.ok) { alert('Failed to create MOU'); return }
    alert('MOU created')
    setSelected([])
    setSelectedPartnerId('')
    setPartnerModalOpen(false)
    await fetchCommittedF1s()
  }
  
  const getMOUForF1 = async (f1Id: string): Promise<string[]> => {
    try {
      const f1 = f1s.find(f => f.id === f1Id)
      if (!f1?.mou_id) {
        return [f1Id]
      }
      
      const { data } = await supabase
        .from('err_projects')
        .select('id')
        .eq('mou_id', f1.mou_id)
      
      return (data || []).map((p: any) => p.id)
    } catch (error) {
      console.error('Error fetching MOU F1s:', error)
      return [f1Id]
    }
  }
  
  const handleReassignClick = async (f1Id: string) => {
    const mouF1Ids = await getMOUForF1(f1Id)
    
    if (mouF1Ids.length > 1) {
      const confirmMsg = `This F1 is part of an MOU. Reassigning will affect ${mouF1Ids.length} F1s in this MOU. Continue?`
      if (!confirm(confirmMsg)) {
        return
      }
    }
    
    setReassigningF1Id(f1Id)
    setAssigningF1Ids(mouF1Ids)
    
    // Pre-populate with current values
    const f1 = f1s.find(f => f.id === f1Id)
    if (f1) {
      if (f1.funding_cycle_id) setTempFundingCycle(f1.funding_cycle_id)
      if (f1.grant_call_id) setTempGrantCall(f1.grant_call_id)
      // Extract MMYY from grant_serial_id if available
      if (f1.grant_serial_id) {
        const mmyyMatch = f1.grant_serial_id.match(/-(\d{4})-/)
        if (mmyyMatch) {
          setTempMMYY(mmyyMatch[1])
        }
        setTempGrantSerial(f1.grant_serial_id.split('-').slice(0, -1).join('-'))
      }
    }
    
    setReassignModalOpen(true)
  }
  
  const handleReassignMultipleF1s = async () => {
    if (!tempFundingCycle || !tempGrantCall || !tempMMYY || !tempGrantSerial) {
      alert('Please fill all assignment fields')
      return
    }
    
    if (tempMMYY.length !== 4) {
      alert('MMYY must be 4 digits')
      return
    }
    
    setIsReassigning(true)
    try {
      const response = await fetch('/api/f2/committed/reassign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          f1_ids: assigningF1Ids,
          funding_cycle_id: tempFundingCycle,
          grant_call_id: tempGrantCall,
          mmyy: tempMMYY,
          grant_serial: tempGrantSerial
        })
      })
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to reassign F1s' }))
        alert(error.error || 'Failed to reassign F1s')
        return
      }
      
      const result = await response.json()
      alert(`Successfully reassigned ${result.reassigned_count} F1(s)`)
      
      // Clear form
      setTempFundingCycle('')
      setTempGrantCall('')
      setTempMMYY('')
      setTempGrantSerial('')
      setReassignModalOpen(false)
      setReassigningF1Id(null)
      
      // Refresh data
      await fetchCommittedF1s()
    } catch (error) {
      console.error('Error reassigning F1s:', error)
      alert('Failed to reassign F1s')
    } finally {
      setIsReassigning(false)
    }
  }

  const fetchStateShorts = async () => {
    try {
      const states = [...new Set(f1s.map(f => f.state).filter(Boolean))]
      const { data } = await supabase
        .from('states')
        .select('state_name, state_short')
        .in('state_name', states)
      
      const shorts: Record<string, string> = {}
      ;(data || []).forEach((row: any) => {
        shorts[row.state_name] = row.state_short
      })
      setStateShorts(shorts)
    } catch (error) {
      console.error('Error fetching state shorts:', error)
    }
  }
  
  const fetchFundingCycles = async () => {
    try {
      const { data } = await supabase
        .from('funding_cycles')
        .select('id, name, type, status')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
      setFundingCycles(data || [])
    } catch (error) {
      console.error('Error fetching funding cycles:', error)
    }
  }
  
  const fetchGrantCallsForCycle = async (cycleId: string) => {
    try {
      const { data } = await supabase
        .from('cycle_grant_inclusions')
        .select(`
          grant_call_id,
          grant_calls (
            id,
            name,
            donor_id,
            donors (
              id,
              name,
              short_name
            )
          )
        `)
        .eq('cycle_id', cycleId)
      
      const grantCalls = (data || []).map((item: any) => ({
        id: item.grant_call_id,
        name: item.grant_calls?.name || '',
        donor_id: item.grant_calls?.donor_id || '',
        donor_name: item.grant_calls?.donors?.name || '',
        donor_short: item.grant_calls?.donors?.short_name || ''
      }))
      
      setGrantCallsForCycle(grantCalls)
    } catch (error) {
      console.error('Error fetching grant calls for cycle:', error)
    }
  }
  
  const fetchGrantSerials = async (stateName: string, mmyy: string) => {
    try {
      const { data, error } = await supabase
        .from('grant_serials')
        .select('grant_serial, grant_call_id')
        .eq('state_name', stateName)
        .eq('yymm', mmyy)
        .order('grant_serial', { ascending: true })
      
      const serials = (data || []).map(s => ({ grant_serial: s.grant_serial }))
      setGrantSerials(serials)
    } catch (error) {
      console.error('Error fetching grant serials:', error)
    }
  }
  
  const fetchLastWorkplanNum = async (grantSerial: string) => {
    try {
      const { data: existingProjects, error: projectsError } = await supabase
        .from('err_projects')
        .select('workplan_number')
        .eq('grant_serial_id', grantSerial)
        .not('workplan_number', 'is', null)

      if (projectsError) {
        console.error('Error fetching existing workplans:', projectsError)
        return
      }

      const existingWorkplanNumbers = (existingProjects || [])
        .map((p: any) => p.workplan_number)
        .filter((n: number) => typeof n === 'number' && n > 0)
        .sort((a: number, b: number) => b - a)

      const highestNumber = existingWorkplanNumbers.length > 0 ? existingWorkplanNumbers[0] : 0
      
      // Store for each F1 being assigned
      const nums: Record<string, number> = {}
      assigningF1Ids.forEach(id => {
        nums[id] = highestNumber
      })
      setLastWorkplanNums(nums)
    } catch (error) {
      console.error('Error fetching last workplan number:', error)
    }
  }
  
  const openPartnerModal = () => {
    if (selected.length === 0) { alert('Please select committed projects'); return }
    setPartnerModalOpen(true)
  }
  
  const openAssignModal = () => {
    if (selected.length === 0) { 
      alert('Please select committed projects to assign'); 
      return 
    }
    
    // Check if any selected F1s are already assigned
    const alreadyAssigned = selected.filter(id => {
      const f1 = f1s.find(f => f.id === id)
      return f1?.grant_call_id
    })
    
    if (alreadyAssigned.length > 0) {
      alert('Some selected F1s are already assigned. Please reassign them separately or select unassigned F1s.')
      return
    }
    
    setAssigningF1Ids(selected)
    setAssignModalOpen(true)
  }

  useEffect(() => {
    fetchCommittedF1s()
    fetchFilterOptions()
    fetchFundingCycles()
    ;(async () => {
      const { data } = await supabase
        .from('partners')
        .select('id, name')
        .eq('status', 'active')
        .order('name')
      setPartners((data || []) as any)
    })()
  }, [])
  
  useEffect(() => {
    if (f1s.length > 0) {
      fetchStateShorts()
    }
  }, [f1s])
  
  useEffect(() => {
    if (tempFundingCycle) {
      fetchGrantCallsForCycle(tempFundingCycle)
    }
  }, [tempFundingCycle])
  
  useEffect(() => {
    if (tempGrantCall && tempMMYY && tempMMYY.length === 4 && assigningF1Ids.length > 0) {
      const firstF1 = f1s.find(f => f.id === assigningF1Ids[0])
      if (firstF1) {
        fetchGrantSerials(firstF1.state, tempMMYY)
      }
    }
  }, [tempGrantCall, tempMMYY, assigningF1Ids, f1s])
  
  useEffect(() => {
    if (tempGrantSerial && tempGrantSerial !== 'new' && assigningF1Ids.length > 0) {
      fetchLastWorkplanNum(tempGrantSerial)
    }
  }, [tempGrantSerial, assigningF1Ids])

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
        <div className="flex items-center gap-2">
          <Button
            onClick={openAssignModal}
            disabled={selected.length === 0 || selected.some(id => {
              const f1 = f1s.find(f => f.id === id)
              return !!f1?.mou_id || !!f1?.grant_call_id
            })}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            Assign F1 and Create F3 MOU
          </Button>
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
          <Table dir={i18n.language === 'ar' ? 'rtl' : 'ltr'}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 px-4">
                  <Checkbox checked={selected.length > 0 && selected.length === f1s.filter(f => !f.mou_id).length} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead>{t('f2:err_id')}</TableHead>
                <TableHead>{t('f2:date')}</TableHead>
                <TableHead>{t('f2:state')}</TableHead>
                <TableHead>{t('f2:locality')}</TableHead>
                <TableHead>{t('f2:grant_name')}</TableHead>
                <TableHead className="text-right">{t('f2:requested_amount')}</TableHead>
                <TableHead>{t('f2:committed')}</TableHead>
                <TableHead>{t('f2:status')}</TableHead>
                <TableHead>MOU</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {f1s.map((f1) => (
                <TableRow key={f1.id}>
                  <TableCell className="px-4">
                    <Checkbox disabled={!!f1.mou_id} checked={selected.includes(f1.id)} onCheckedChange={(c) => toggleOne(f1.id, c as boolean)} />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{f1.err_id}</div>
                    <div className="text-sm text-muted-foreground">{f1.err_code}</div>
                  </TableCell>
                  <TableCell>{new Date(f1.date).toLocaleDateString()}</TableCell>
                  <TableCell>{f1.state}</TableCell>
                  <TableCell>{f1.locality}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        {f1.grant_call_name && f1.donor_name ? (
                          <div>
                            <div className="font-medium">{f1.grant_call_name}</div>
                            <div className="text-sm text-muted-foreground">{f1.donor_name}</div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </div>
                      {f1.grant_call_id && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleReassignClick(f1.id)}
                          title={f1.mou_id ? 'Reassign to different grant (will affect all F1s in this MOU)' : 'Reassign to different grant'}
                          className="h-8 w-8 p-0"
                        >
                          <ArrowRightLeft className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {calculateTotalAmount(f1.expenses).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {new Date(f1.committed_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant="default">
                      {t(`f2:${f1.funding_status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {f1.mou_id ? (
                      <a className="text-primary underline" href="/err-portal/f3-mous">{t('f2:view_mou')}</a>
                    ) : '-'}
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

      {/* Assignment Modal */}
      <Dialog open={assignModalOpen} onOpenChange={setAssignModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assign Work Plans</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                Assigning {assigningF1Ids.length} F1 work plan(s) to a grant call
              </p>
              <div className="max-h-32 overflow-y-auto mb-4 p-2 bg-muted rounded-md">
                {assigningF1Ids.map(id => {
                  const f1 = f1s.find(f => f.id === id)
                  return f1 ? (
                    <div key={id} className="text-sm">{f1.err_id} - {f1.state} - {f1.locality}</div>
                  ) : null
                })}
              </div>
            </div>

            {/* Row 1: Funding Cycle, Grant Call, Donor */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Funding Cycle *</Label>
                <Select value={tempFundingCycle} onValueChange={setTempFundingCycle}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {fundingCycles.map(fc => (
                      <SelectItem key={fc.id} value={fc.id}>{fc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Grant Call *</Label>
                <Select 
                  value={tempGrantCall} 
                  onValueChange={(value) => {
                    setTempGrantCall(value)
                    setTempGrantSerial('')
                    setGrantSerials([])
                  }}
                  disabled={!tempFundingCycle}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {grantCallsForCycle.map((gc: any) => (
                      <SelectItem key={gc.id} value={gc.id}>{gc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Donor</Label>
                <Input
                  value={grantCallsForCycle.find((gc: any) => gc.id === tempGrantCall)?.donor_name || ''}
                  disabled
                  className="bg-muted w-full"
                />
              </div>
            </div>

            {/* Row 2: MMYY and Grant Serial */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>MMYY *</Label>
                <Input
                  value={tempMMYY}
                  onChange={(e) => {
                    const newMMYY = e.target.value.replace(/[^0-9]/g, '').slice(0, 4)
                    setTempMMYY(newMMYY)
                    if (newMMYY.length !== 4) {
                      setTempGrantSerial('')
                      setGrantSerials([])
                    }
                  }}
                  placeholder="0825"
                  maxLength={4}
                  className="w-full"
                />
              </div>

              <div>
                <Label>Grant Serial *</Label>
                <Select 
                  value={tempGrantSerial} 
                  onValueChange={setTempGrantSerial}
                  disabled={!tempGrantCall || !tempMMYY || tempMMYY.length !== 4}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select or create" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">Create New Serial</SelectItem>
                    {grantSerials.map(gs => (
                      <SelectItem key={gs.grant_serial} value={gs.grant_serial}>{gs.grant_serial}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Generated Serial ID Preview */}
            {assigningF1Ids.length > 0 && (
              <div>
                <Label>Generated Workplan Serial(s)</Label>
                <div className="p-3 bg-muted rounded-md font-mono text-sm max-h-32 overflow-y-auto">
                  {assigningF1Ids.map((id, idx) => {
                    const grantCall = grantCallsForCycle.find((gc: any) => gc.id === tempGrantCall)
                    const donorShort = grantCall?.donor_short
                    const f1 = f1s.find(f => f.id === id)
                    const stateShort = f1 ? (stateShorts[f1.state] || '') : ''
                    const mmyy = tempMMYY
                    const grantSerial = tempGrantSerial
                    
                    let workplanNum = 1
                    if (grantSerial && grantSerial !== 'new') {
                      const baseNum = lastWorkplanNums[id] || 0
                      workplanNum = baseNum + 1 + idx
                    } else if (grantSerial === 'new') {
                      // For new serials, increment workplan number for each F1 (1, 2, 3, etc.)
                      workplanNum = idx + 1
                    }
                    
                    if (grantSerial && grantSerial !== 'new' && grantSerial.includes('-')) {
                      return <div key={id}>{grantSerial}-{String(workplanNum).padStart(3, '0')}</div>
                    }
                    
                    if (grantSerial === 'new' && donorShort && stateShort && mmyy) {
                      // Calculate next serial number from existing grant serials
                      const serialPrefix = `LCC-${donorShort}-${stateShort}-${mmyy}-`
                      let maxSerialNumber = 0
                      
                      // Filter grant serials for this donor/state/yymm combination
                      const relevantSerials = grantSerials.filter((gs: any) => 
                        gs.grant_serial && gs.grant_serial.startsWith(serialPrefix)
                      )
                      
                      // Extract serial numbers and find the maximum
                      for (const gs of relevantSerials) {
                        const serialStr = gs.grant_serial || ''
                        if (serialStr.startsWith(serialPrefix)) {
                          const serialNumberStr = serialStr.substring(serialPrefix.length)
                          const serialNumber = parseInt(serialNumberStr, 10)
                          if (!isNaN(serialNumber) && serialNumber > maxSerialNumber) {
                            maxSerialNumber = serialNumber
                          }
                        }
                      }
                      
                      const nextSerialNumber = maxSerialNumber + 1
                      const serialNum = String(nextSerialNumber).padStart(4, '0')
                      return <div key={id}>LCC-{donorShort}-{stateShort}-{mmyy}-{serialNum}-{String(workplanNum).padStart(3, '0')}</div>
                    }
                    return <div key={id}>LCC-XXX-XX-XXXX-XXXX-XXX</div>
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setAssignModalOpen(false)
                  setTempFundingCycle('')
                  setTempGrantCall('')
                  setTempMMYY('')
                  setTempGrantSerial('')
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAssignMultipleF1s}
                disabled={!tempGrantCall || !tempMMYY || tempMMYY.length !== 4 || !tempGrantSerial || !tempFundingCycle || isAssigning}
              >
                {isAssigning ? 'Assigning...' : 'Assign and Continue'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reassignment Modal */}
      <Dialog open={reassignModalOpen} onOpenChange={setReassignModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reassign Work Plans</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                Reassigning {assigningF1Ids.length} F1 work plan(s) to a different grant call
              </p>
              {assigningF1Ids.length > 1 && (
                <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                  <p className="text-sm font-medium text-yellow-800">
                    These F1s are part of the same MOU. All {assigningF1Ids.length} F1s will be reassigned together.
                  </p>
                </div>
              )}
              <div className="max-h-32 overflow-y-auto mb-4 p-2 bg-muted rounded-md">
                {assigningF1Ids.map(id => {
                  const f1 = f1s.find(f => f.id === id)
                  return f1 ? (
                    <div key={id} className="text-sm">{f1.err_id} - {f1.state} - {f1.locality}</div>
                  ) : null
                })}
              </div>
            </div>

            {/* Same form fields as assignment modal */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Funding Cycle *</Label>
                <Select value={tempFundingCycle} onValueChange={setTempFundingCycle}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {fundingCycles.map(fc => (
                      <SelectItem key={fc.id} value={fc.id}>{fc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Grant Call *</Label>
                <Select 
                  value={tempGrantCall} 
                  onValueChange={(value) => {
                    setTempGrantCall(value)
                    setTempGrantSerial('')
                    setGrantSerials([])
                  }}
                  disabled={!tempFundingCycle}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {grantCallsForCycle.map((gc: any) => (
                      <SelectItem key={gc.id} value={gc.id}>{gc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Donor</Label>
                <Input
                  value={grantCallsForCycle.find((gc: any) => gc.id === tempGrantCall)?.donor_name || ''}
                  disabled
                  className="bg-muted w-full"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>MMYY *</Label>
                <Input
                  value={tempMMYY}
                  onChange={(e) => {
                    const newMMYY = e.target.value.replace(/[^0-9]/g, '').slice(0, 4)
                    setTempMMYY(newMMYY)
                    if (newMMYY.length !== 4) {
                      setTempGrantSerial('')
                      setGrantSerials([])
                    }
                  }}
                  placeholder="0825"
                  maxLength={4}
                  className="w-full"
                />
              </div>

              <div>
                <Label>Grant Serial *</Label>
                <Select 
                  value={tempGrantSerial} 
                  onValueChange={setTempGrantSerial}
                  disabled={!tempGrantCall || !tempMMYY || tempMMYY.length !== 4}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select or create" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">Create New Serial</SelectItem>
                    {grantSerials.map(gs => (
                      <SelectItem key={gs.grant_serial} value={gs.grant_serial}>{gs.grant_serial}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setReassignModalOpen(false)
                  setReassigningF1Id(null)
                  setTempFundingCycle('')
                  setTempGrantCall('')
                  setTempMMYY('')
                  setTempGrantSerial('')
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleReassignMultipleF1s}
                disabled={!tempGrantCall || !tempMMYY || tempMMYY.length !== 4 || !tempGrantSerial || !tempFundingCycle || isReassigning}
              >
                {isReassigning ? 'Reassigning...' : 'Reassign'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={partnerModalOpen} onOpenChange={setPartnerModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Select Local Partner</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div>
              <Label>Local Partner</Label>
              <select
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedPartnerId}
                onChange={(e) => setSelectedPartnerId(e.target.value)}
              >
                <option value="">Select partner…</option>
                {partners.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPartnerModalOpen(false)}>Cancel</Button>
            <Button onClick={createMOU} disabled={!selectedPartnerId} className="bg-green-600 hover:bg-green-700 text-white">Create</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
