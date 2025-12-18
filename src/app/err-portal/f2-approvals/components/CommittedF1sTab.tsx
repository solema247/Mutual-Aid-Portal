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
    states: [],
    grants: []
  })
  const [filters, setFilters] = useState({
    search: '',
    grant: 'all',
    state: 'all'
  })
  const [isLoading, setIsLoading] = useState(true)
  const [selected, setSelected] = useState<string[]>([])
  const [partners, setPartners] = useState<Array<{ id: string; name: string }>>([])
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('')
  const [partnerModalOpen, setPartnerModalOpen] = useState(false)
  
  // Reassignment state (for already assigned F1s)
  const [reassignModalOpen, setReassignModalOpen] = useState(false)
  const [reassigningF1Id, setReassigningF1Id] = useState<string | null>(null)
  const [isReassigning, setIsReassigning] = useState(false)
  const [assigningF1Ids, setAssigningF1Ids] = useState<string[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10
  
  // Reassignment form state (using grants_grid_view)
  const [tempGrantId, setTempGrantId] = useState<string>('')
  const [tempDonorName, setTempDonorName] = useState<string>('')
  const [tempMMYY, setTempMMYY] = useState<string>('')
  const [grantsFromGridView, setGrantsFromGridView] = useState<any[]>([])
  const [donorShortNames, setDonorShortNames] = useState<Record<string, string>>({})
  const [selectedGrantMaxSequence, setSelectedGrantMaxSequence] = useState<number>(0)
  const [stateShorts, setStateShorts] = useState<Record<string, string>>({})

  const toggleAll = (checked: boolean) => {
    if (!checked) return setSelected([])
    setSelected(f1s.filter(f => !f.mou_id).map(f => f.id))
  }
  const toggleOne = (id: string, checked: boolean) => {
    if (checked) setSelected(prev => [...prev, id])
    else setSelected(prev => prev.filter(x => x !== id))
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
      // Extract MMYY from grant_id if available (format: LCC-Donor-State-MMYY-WorkplanSeq)
      if (f1.grant_id && f1.grant_id.startsWith('LCC-')) {
        const mmyyMatch = f1.grant_id.match(/-(\d{4})-\d{4}$/)
        if (mmyyMatch) {
          setTempMMYY(mmyyMatch[1])
        }
      }
    }
    
    setReassignModalOpen(true)
  }
  
  const handleReassignMultipleF1s = async () => {
    if (!tempGrantId || !tempDonorName || !tempMMYY) {
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
          grant_id: tempGrantId,
          donor_name: tempDonorName,
          mmyy: tempMMYY
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
      setTempGrantId('')
      setTempDonorName('')
      setTempMMYY('')
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
  
  const fetchGrantsFromGridView = async () => {
    try {
      const { data, error } = await supabase
        .from('grants_grid_view')
        .select('grant_id, donor_name, project_name, donor_id, max_workplan_sequence')
        .order('grant_id', { ascending: true })
      
      if (error) throw error
      
      // Get unique grants (group by grant_id and donor_name)
      const uniqueGrants = new Map()
      const donorIds = new Set<string>()
      ;(data || []).forEach((grant: any) => {
        const key = `${grant.grant_id}|${grant.donor_name}`
        if (!uniqueGrants.has(key)) {
          uniqueGrants.set(key, {
            grant_id: grant.grant_id,
            donor_name: grant.donor_name,
            project_name: grant.project_name || grant.grant_id,
            donor_id: grant.donor_id,
            max_workplan_sequence: grant.max_workplan_sequence || 0
          })
          if (grant.donor_id) {
            donorIds.add(grant.donor_id)
          }
        }
      })
      
      setGrantsFromGridView(Array.from(uniqueGrants.values()))
      
      // Fetch donor short names for all unique donor_ids
      if (donorIds.size > 0) {
        const { data: donors, error: donorsError } = await supabase
          .from('donors')
          .select('id, short_name')
          .in('id', Array.from(donorIds))
        
        if (!donorsError && donors) {
          const shortNamesMap: Record<string, string> = {}
          donors.forEach((donor: any) => {
            if (donor.id && donor.short_name) {
              shortNamesMap[donor.id] = donor.short_name
            }
          })
          setDonorShortNames(shortNamesMap)
        }
      }
    } catch (error) {
      console.error('Error fetching grants from grid view:', error)
    }
  }
  
  const fetchGrantMaxWorkplanSequence = async (grantId: string, donorName: string) => {
    try {
      const { data, error } = await supabase
        .from('grants_grid_view')
        .select('max_workplan_sequence')
        .eq('grant_id', grantId)
        .eq('donor_name', donorName)
        .single()
      
      if (error || !data) {
        setSelectedGrantMaxSequence(0)
        return
      }
      
      setSelectedGrantMaxSequence(data.max_workplan_sequence || 0)
    } catch (error) {
      console.error('Error fetching grant max workplan sequence:', error)
      setSelectedGrantMaxSequence(0)
    }
  }
  
  const openPartnerModal = () => {
    if (selected.length === 0) { 
      alert('Please select committed projects'); 
      return 
    }
    
    // Check if any selected F1s already have an MOU
    const alreadyHasMOU = selected.filter(id => {
      const f1 = f1s.find(f => f.id === id)
      return f1?.mou_id
    })
    
    if (alreadyHasMOU.length > 0) {
      alert('Some selected F1s already have an MOU. Please select F1s without an MOU.')
      return
    }
    
    setPartnerModalOpen(true)
  }

  useEffect(() => {
    fetchCommittedF1s()
    fetchFilterOptions()
    fetchGrantsFromGridView() // Fetch grants from grants_grid_view
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
    if (tempGrantId && tempDonorName && reassignModalOpen) {
      fetchGrantMaxWorkplanSequence(tempGrantId, tempDonorName)
    }
  }, [tempGrantId, tempDonorName, reassignModalOpen])

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
      setCurrentPage(1) // Reset to first page when data refreshes
    } catch (error) {
      console.error('Error fetching committed F1s:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchFilterOptions = async () => {
    try {
      // Fetch grants from grants_grid_view
      const { data: grantsData } = await supabase
        .from('grants_grid_view')
        .select('grant_id, donor_name, project_name')
        .order('grant_id', { ascending: true })

      // Get unique grants (group by grant_id and donor_name)
      const uniqueGrants = new Map()
      ;(grantsData || []).forEach((grant: any) => {
        const key = `${grant.grant_id}|${grant.donor_name}`
        if (!uniqueGrants.has(key)) {
          uniqueGrants.set(key, {
            grant_id: grant.grant_id,
            donor_name: grant.donor_name,
            project_name: grant.project_name || grant.grant_id
          })
        }
      })

      // Fetch states (deduplicate by state_name)
      const { data: statesData } = await supabase
        .from('states')
        .select('state_name')
        .not('state_name', 'is', null)

      setFilterOptions({
        grantCalls: [],
        donors: [],
        cycles: [],
        states: Array.from(new Set(((statesData || []) as any[]).map((s: any) => s.state_name)))
          .filter(Boolean)
          .map((name: string) => ({ name })),
        grants: Array.from(uniqueGrants.values())
      })
    } catch (error) {
      console.error('Error fetching filter options:', error)
    }
  }

  const applyFilters = () => {
    // Since the API now handles most filtering, we just need to refresh the data
    setCurrentPage(1) // Reset to first page when filters change
    fetchCommittedF1s()
  }

  const calculateTotalAmount = (expenses: Array<{ activity: string; total_cost: number }>) => {
    return expenses.reduce((sum, exp) => sum + (exp.total_cost || 0), 0)
  }

  const clearFilters = () => {
    setFilters({
      search: '',
      grant: 'all',
      state: 'all'
    })
  }

  if (isLoading) {
    return <div className="text-center py-8">{t('common:loading')}</div>
  }

  const totalPages = Math.ceil(f1s.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedF1s = f1s.slice(startIndex, endIndex)

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">{t('f2:committed_header', { count: f1s.length })}</h3>
          <p className="text-sm text-muted-foreground">{t('f2:committed_desc')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={openPartnerModal}
            disabled={selected.length === 0 || selected.some(id => {
              const f1 = f1s.find(f => f.id === id)
              return !!f1?.mou_id
            })}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            Create F3 MOU
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
              <Label>Grant</Label>
              <Select
                value={filters.grant}
                onValueChange={(value) => setFilters(prev => ({ ...prev, grant: value }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All Grants" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Grants</SelectItem>
                  {filterOptions.grants.map((grant: any) => (
                    <SelectItem key={`${grant.grant_id}|${grant.donor_name}`} value={`${grant.grant_id}|${grant.donor_name}`}>
                      {grant.grant_id} - {grant.donor_name}
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
              {paginatedF1s.map((f1) => (
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
                      {f1.grant_id && f1.grant_id.startsWith('LCC-') && (
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

      {/* Pagination */}
      {f1s.length > itemsPerPage && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {startIndex + 1} to {Math.min(endIndex, f1s.length)} of {f1s.length} projects
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Reassignment Modal */}
      <Dialog open={reassignModalOpen} onOpenChange={setReassignModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reassign Work Plans</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                Reassigning {assigningF1Ids.length} F1 work plan(s) to a different grant
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Grant *</Label>
                <Select 
                  value={`${tempGrantId}|${tempDonorName}`}
                  onValueChange={(value) => {
                    const [grantId, donorName] = value.split('|')
                    setTempGrantId(grantId)
                    setTempDonorName(donorName)
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select grant" />
                  </SelectTrigger>
                  <SelectContent>
                    {grantsFromGridView.map((grant: any) => (
                      <SelectItem key={`${grant.grant_id}|${grant.donor_name}`} value={`${grant.grant_id}|${grant.donor_name}`}>
                        {grant.grant_id} - {grant.donor_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>MMYY *</Label>
                <Input
                  value={tempMMYY}
                  onChange={(e) => {
                    const newMMYY = e.target.value.replace(/[^0-9]/g, '').slice(0, 4)
                    setTempMMYY(newMMYY)
                  }}
                  placeholder="1225"
                  maxLength={4}
                  className="w-full"
                />
              </div>
            </div>

            {/* Preview generated serials */}
            {tempGrantId && tempDonorName && tempMMYY && tempMMYY.length === 4 && assigningF1Ids.length > 0 && (
              <div className="p-3 bg-muted rounded-md">
                <Label className="text-sm font-semibold mb-2 block">Generated Workplan Serial IDs:</Label>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {assigningF1Ids.map((id, idx) => {
                    const f1 = f1s.find(f => f.id === id)
                    if (!f1) return null
                    const donorShort = donorShortNames[grantsFromGridView.find((g: any) => g.grant_id === tempGrantId && g.donor_name === tempDonorName)?.donor_id || '']
                    const stateShort = stateShorts[f1.state] || 'XX'
                    const workplanSeq = String((selectedGrantMaxSequence || 0) + idx + 1).padStart(4, '0')
                    const generatedSerial = `LCC-${donorShort || 'XXX'}-${stateShort}-${tempMMYY}-${workplanSeq}`
                    const displayLabel = f1.err_id || `${f1.state} - ${f1.locality}` || 'F1'
                    return (
                      <div key={id} className="text-sm font-mono">
                        {displayLabel}: {generatedSerial}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setReassignModalOpen(false)
                  setReassigningF1Id(null)
                  setTempGrantId('')
                  setTempDonorName('')
                  setTempMMYY('')
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleReassignMultipleF1s}
                disabled={!tempGrantId || !tempDonorName || !tempMMYY || tempMMYY.length !== 4 || isReassigning}
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
