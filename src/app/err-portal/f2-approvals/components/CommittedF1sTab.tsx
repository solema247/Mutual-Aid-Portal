'use client'

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabaseClient'
import { Search, Filter, Edit2, Undo2, ArrowUp, ArrowDown } from 'lucide-react'
import type { CommittedF1, FilterOptions } from '../types'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import ProjectEditor from './ProjectEditor'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'

export default function CommittedF1sTab() {
  const { t, i18n } = useTranslation(['f2', 'common'])
  const { can } = useAllowedFunctions()
  const canCommit = can('f2_commit')
  const canCreateMou = can('f2_create_mou')
  const canUploadApproval = can('f2_upload_approval')
  const canEditProject = can('f2_edit_project')
  const canViewMou = can('f2_view_mou')
  const searchParams = useSearchParams()
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
    state: 'all',
    monthYearFrom: '',
    monthYearTo: ''
  })
  const [isLoading, setIsLoading] = useState(true)
  const [selected, setSelected] = useState<string[]>([])
  const [partners, setPartners] = useState<Array<{ id: string; name: string }>>([])
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('')
  const [partnerModalOpen, setPartnerModalOpen] = useState(false)
  
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorProjectId, setEditorProjectId] = useState<string | null>(null)
  const [decommitDialogOpen, setDecommitDialogOpen] = useState(false)
  const [decommittingF1Id, setDecommittingF1Id] = useState<string | null>(null)
  const [isDecommitting, setIsDecommitting] = useState(false)
  const [dateSort, setDateSort] = useState<'asc' | 'desc'>('desc')

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
  
  const handleDecommitClick = (f1Id: string) => {
    setDecommittingF1Id(f1Id)
    setDecommitDialogOpen(true)
  }

  const handleDecommitConfirm = async () => {
    if (!decommittingF1Id) return
    setIsDecommitting(true)
    try {
      const response = await fetch('/api/f2/committed/decommit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: decommittingF1Id })
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to de-commit' }))
        alert(error.error || t('f2:decommit_failed'))
        return
      }
      setDecommitDialogOpen(false)
      setDecommittingF1Id(null)
      await fetchCommittedF1s()
      alert(t('f2:decommit_success'))
    } catch (error) {
      console.error('Error de-committing F1:', error)
      alert(t('f2:decommit_failed'))
    } finally {
      setIsDecommitting(false)
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
    
    // Check for editProjectId in URL query params
    const editProjectId = searchParams.get('editProjectId')
    if (editProjectId) {
      setEditorProjectId(editProjectId)
      setEditorOpen(true)
    }
    
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
    applyFilters()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  const fetchCommittedF1s = async () => {
    try {
      const params = new URLSearchParams()
      if (filters.state && filters.state !== 'all') params.append('state', filters.state)
      if (filters.search) params.append('search', filters.search)
      if (filters.monthYearFrom) params.append('month_year_from', filters.monthYearFrom)
      if (filters.monthYearTo) params.append('month_year_to', filters.monthYearTo)

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
      state: 'all',
      monthYearFrom: '',
      monthYearTo: ''
    })
  }

  if (isLoading) {
    return <div className="text-center py-8">{t('common:loading')}</div>
  }

  const sortedF1s = [...f1s].sort((a, b) => {
    const dA = new Date(a.date).getTime()
    const dB = new Date(b.date).getTime()
    return dateSort === 'desc' ? dB - dA : dA - dB
  })
  const totalPages = Math.ceil(sortedF1s.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedF1s = sortedF1s.slice(startIndex, endIndex)

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">{t('f2:committed_header', { count: f1s.length })}</h3>
          <p className="text-sm text-muted-foreground">{t('f2:committed_desc')}</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreateMou && (
            <Button
              onClick={openPartnerModal}
              disabled={selected.length === 0 || selected.some(id => {
                const f1 = f1s.find(f => f.id === id)
                return !!f1?.mou_id
              })}
            >
              Create F3 MOU
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card className="text-[11px]">
        <CardHeader className="py-1.5 px-3">
          <CardTitle className="text-[11px] flex items-center gap-1 font-medium">
            <Filter className="w-3 h-3" />
            {t('f2:filters')}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-2 pt-0">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-0.5 w-full sm:w-[130px] min-w-0">
              <Label className="text-[11px] font-normal text-muted-foreground">{t('f2:search')}</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-muted-foreground w-3 h-3" />
                <Input
                  placeholder={t('f2:search_placeholder') as string}
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  className="pl-7 h-7 text-[11px] w-full"
                />
              </div>
            </div>
            <div className="space-y-0.5 w-full sm:w-[11rem] min-w-[11rem]">
              <Label className="text-[11px] font-normal text-muted-foreground">{t('f2:date') || 'Date'} (from)</Label>
              <Input
                type="month"
                value={filters.monthYearFrom}
                onChange={(e) => setFilters(prev => ({ ...prev, monthYearFrom: e.target.value }))}
                className="w-full h-7 text-[11px] pr-8"
              />
            </div>
            <div className="space-y-0.5 w-full sm:w-[11rem] min-w-[11rem]">
              <Label className="text-[11px] font-normal text-muted-foreground">{t('f2:date') || 'Date'} (to)</Label>
              <Input
                type="month"
                value={filters.monthYearTo}
                onChange={(e) => setFilters(prev => ({ ...prev, monthYearTo: e.target.value }))}
                className="w-full h-7 text-[11px] pr-8"
              />
            </div>
            <div className="space-y-0.5 w-full sm:w-[110px] min-w-0">
              <Label className="text-[11px] font-normal text-muted-foreground">{t('f2:state_label')}</Label>
              <Select
                value={filters.state}
                onValueChange={(value) => setFilters(prev => ({ ...prev, state: value }))}
              >
                <SelectTrigger className="w-full h-7 text-[11px]">
                  <SelectValue placeholder={t('f2:all_states') as string} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-[11px]">{t('f2:all_states')}</SelectItem>
                  {filterOptions.states.map(state => (
                    <SelectItem key={state.name} value={state.name} className="text-[11px]">{state.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-0.5 w-full sm:w-[150px] min-w-0">
              <Label className="text-[11px] font-normal text-muted-foreground">Grant</Label>
              <Select
                value={filters.grant}
                onValueChange={(value) => setFilters(prev => ({ ...prev, grant: value }))}
              >
                <SelectTrigger className="w-full h-7 text-[11px]">
                  <SelectValue placeholder="All Grants" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-[11px]">All Grants</SelectItem>
                  {filterOptions.grants.map((grant: any) => (
                    <SelectItem key={`${grant.grant_id}|${grant.donor_name}`} value={`${grant.grant_id}|${grant.donor_name}`} className="text-[11px]">
                      {grant.grant_id} - {grant.donor_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={clearFilters} className="h-7 text-[11px] shrink-0 px-2">
              {t('f2:clear_filters')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table dir={i18n.language === 'ar' ? 'rtl' : 'ltr'} className="text-xs min-w-[900px]">
            <TableHeader>
              <TableRow className="[&>th]:py-2 [&>th]:px-2 [&>th]:text-xs">
                <TableHead className="w-10 px-2">
                  {canCreateMou && (
                    <Checkbox checked={selected.length > 0 && selected.length === f1s.filter(f => !f.mou_id).length} onCheckedChange={toggleAll} />
                  )}
                </TableHead>
                <TableHead className="px-2">{t('f2:err_id')}</TableHead>
                <TableHead className="px-2">
                  <button
                    type="button"
                    onClick={() => setDateSort(prev => prev === 'desc' ? 'asc' : 'desc')}
                    className="flex items-center gap-1 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring rounded"
                  >
                    {t('f2:date')}
                    {dateSort === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />}
                  </button>
                </TableHead>
                <TableHead className="px-2">{t('f2:state')}</TableHead>
                <TableHead className="px-2">{t('f2:locality')}</TableHead>
                <TableHead className="px-2">{t('f2:grant_name')}</TableHead>
                <TableHead className="text-right px-2">{t('f2:requested_amount')}</TableHead>
                <TableHead className="px-2">{t('f2:committed')}</TableHead>
                <TableHead className="px-2">{t('f2:status')}</TableHead>
                <TableHead className="px-2 whitespace-pre-line text-center leading-tight">{t('f2:community_approval')}</TableHead>
                <TableHead className="px-2">MOU</TableHead>
                <TableHead className="px-2">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedF1s.map((f1) => (
                <TableRow key={f1.id} className="[&>td]:py-1.5 [&>td]:px-2 [&>td]:text-xs">
                  <TableCell className="px-2">
                    {canCreateMou && (
                      <Checkbox disabled={!!f1.mou_id} checked={selected.includes(f1.id)} onCheckedChange={(c) => toggleOne(f1.id, c as boolean)} />
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {f1.err_id}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{new Date(f1.date).toLocaleDateString()}</TableCell>
                  <TableCell className="whitespace-nowrap">{f1.state}</TableCell>
                  <TableCell className="whitespace-nowrap max-w-[100px] truncate" title={f1.locality}>{f1.locality}</TableCell>
                  <TableCell className="max-w-[120px]">
                    <div className="flex flex-col gap-0 truncate">
                      {f1.grant_call_name && f1.donor_name ? (
                        <>
                          <span className="truncate font-medium">{f1.grant_call_name}</span>
                          <span className="text-muted-foreground truncate">{f1.donor_name}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium whitespace-nowrap">
                    {calculateTotalAmount(f1.expenses).toLocaleString()}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {new Date(f1.committed_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant="default" className="text-[10px] px-1.5 py-0">
                      {t(`f2:${f1.funding_status}`)}
                    </Badge>
                  </TableCell>
                  {/* Community Approval */}
                  <TableCell className="whitespace-nowrap">
                    {f1.approval_file_key ? (
                      <Badge variant="default" className="text-[10px] px-1.5 py-0">{t('f2:approval_uploaded')}</Badge>
                    ) : canUploadApproval ? (
                      <div className="flex items-center gap-2">
                        <input
                          id={`approval-file-${f1.id}`}
                          type="file"
                          className="hidden"
                          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            try {
                              // Build path for approval file
                              const key = `f2-approvals/${f1.id}/${Date.now()}-${file.name.replace(/\s+/g,'_')}`
                              const { error: upErr } = await supabase.storage.from('images').upload(key, file, { upsert: true })
                              if (upErr) { alert(t('f2:upload_failed')); return }
                              const resp = await fetch('/api/f2/uncommitted', {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: f1.id, approval_file_key: key })
                              })
                              if (!resp.ok) { alert(t('f2:upload_failed')); return }
                              await fetchCommittedF1s()
                            } catch (err) {
                              console.error('Upload error', err)
                              alert(t('f2:upload_failed'))
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs px-2"
                          onClick={() => document.getElementById(`approval-file-${f1.id}`)?.click()}
                        >
                          {t('f2:upload')}
                        </Button>
                      </div>
                    ) : (
                      <Badge variant="secondary" className="text-muted-foreground text-[10px] px-1.5 py-0">{t('f2:approval_required')}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {f1.mou_id ? (
                      canViewMou ? (
                        <a className="text-primary underline" href="/err-portal/f3-mous">{t('f2:view_mou')}</a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )
                    ) : '-'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      {canEditProject && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setEditorProjectId(f1.id); setEditorOpen(true) }}
                          title={t('projects:edit_project') as string}
                          className="h-7 w-7 p-0"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {!f1.mou_id && canCommit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDecommitClick(f1.id)}
                          title={t('f2:decommit_project') as string}
                          className="h-7 w-7 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                        >
                          <Undo2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
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
            <Button onClick={createMOU} disabled={!selectedPartnerId} >Create</Button>
          </div>
        </DialogContent>
      </Dialog>

      <ProjectEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        projectId={editorProjectId}
        onSaved={async () => { await fetchCommittedF1s() }}
      />

      {/* De-commit confirmation dialog */}
      <Dialog open={decommitDialogOpen} onOpenChange={setDecommitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('f2:decommit_project') || 'De-commit Project'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('f2:decommit_confirmation') || 'Move this project back to the uncommitted list? You can then delete it from there if needed.'}
            </p>
            {decommittingF1Id && (() => {
              const f1 = f1s.find(f => f.id === decommittingF1Id)
              if (!f1) return null
              return (
                <div className="p-3 bg-muted rounded-md">
                  <div className="font-medium">{f1.err_id}</div>
                  <div className="text-sm text-muted-foreground">
                    {f1.state} - {f1.locality}
                  </div>
                </div>
              )
            })()}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setDecommitDialogOpen(false)
                  setDecommittingF1Id(null)
                }}
                disabled={isDecommitting}
              >
                {t('common:cancel')}
              </Button>
              <Button
                variant="secondary"
                onClick={handleDecommitConfirm}
                disabled={isDecommitting}
              >
                {isDecommitting ? t('f2:decommitting') || 'De-committing...' : t('f2:decommit') || 'De-commit'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
