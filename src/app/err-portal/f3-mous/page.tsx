'use client'

import { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Eye, Upload, Receipt, FileSignature, FileCheck, Link2, X, Plus } from 'lucide-react'
import dynamic from 'next/dynamic'
import { aggregateObjectives, aggregateBeneficiaries, aggregatePlannedActivities, aggregatePlannedActivitiesDetailed, aggregateLocations, getBankingDetails, getBudgetTable } from '@/lib/mou-aggregation'
import { supabase } from '@/lib/supabaseClient'
import PoolByDonor from '@/app/err-portal/f2-approvals/components/PoolByDonor'

interface Signature {
  id: string
  name: string
  role?: string
  date: string
}

interface MOU {
  id: string
  mou_code: string
  partner_name: string
  err_name: string
  state: string | null
  total_amount: number
  start_date: string | null
  end_date: string | null
  file_key: string | null
  payment_confirmation_file: string | null
  signed_mou_file_key: string | null
  banking_details_override: string | null
  partner_contact_override: string | null
  err_contact_override: string | null
  partner_signature: string | null
  err_signature: string | null
  signature_date: string | null
  signatures: Signature[] | null
  created_at: string
}

interface MOUDetail {
  mou: MOU
  projects?: Array<{
    banking_details: string | null
    program_officer_name: string | null
    program_officer_phone: string | null
    reporting_officer_name: string | null
    reporting_officer_phone: string | null
    finance_officer_name: string | null
    finance_officer_phone: string | null
    project_objectives: string | null
    intended_beneficiaries: string | null
    planned_activities: string | null
    planned_activities_resolved?: string | null
    locality: string | null
    state: string | null
    "Sector (Primary)"?: string | null
    "Sector (Secondary)"?: string | null
  }> | null
  project?: {
    banking_details: string | null
    program_officer_name: string | null
    program_officer_phone: string | null
    reporting_officer_name: string | null
    reporting_officer_phone: string | null
    finance_officer_name: string | null
    finance_officer_phone: string | null
    project_objectives: string | null
    intended_beneficiaries: string | null
    planned_activities: string | null
    planned_activities_resolved?: string | null
    locality: string | null
    state: string | null
    "Sector (Primary)"?: string | null
    "Sector (Secondary)"?: string | null
  } | null
  partner?: {
    name: string
    contact_person: string | null
    email: string | null
    phone_number: string | null
    address: string | null
    position?: string | null
  } | null
}

export default function F3MOUsPage() {
  const { t, i18n } = useTranslation(['f3', 'common'])
  const [mous, setMous] = useState<MOU[]>([])
  const [selectedState, setSelectedState] = useState<string>('all')
  const [availableStates, setAvailableStates] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [activeMou, setActiveMou] = useState<MOU | null>(null)
  const [detail, setDetail] = useState<MOUDetail | null>(null)
  const [translations, setTranslations] = useState<{ objectives_en?: string; beneficiaries_en?: string; activities_en?: string; objectives_ar?: string; beneficiaries_ar?: string; activities_ar?: string }>({})
  const [exporting, setExporting] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editingMou, setEditingMou] = useState<Partial<MOU>>({})
  const [saving, setSaving] = useState(false)
  const previewId = 'mou-preview-content'
  
  // Assignment state
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [assigningMouId, setAssigningMouId] = useState<string | null>(null)
  const [isAssigning, setIsAssigning] = useState(false)
  const [mouAssignmentStatus, setMouAssignmentStatus] = useState<Record<string, { hasUnassigned: boolean; projectCount: number }>>({})
  
  // Assignment form state
  const [tempGrantId, setTempGrantId] = useState<string>('')
  const [tempDonorName, setTempDonorName] = useState<string>('')
  const [tempMMYY, setTempMMYY] = useState<string>('')
  const [grantsFromGridView, setGrantsFromGridView] = useState<any[]>([])
  const [mouProjects, setMouProjects] = useState<Array<{ id: string; err_id: string | null; state: string; locality: string | null }>>([])
  const [stateShorts, setStateShorts] = useState<Record<string, string>>({})
  const [donorShortNames, setDonorShortNames] = useState<Record<string, string>>({})
  const [selectedGrantMaxSequence, setSelectedGrantMaxSequence] = useState<number>(0)
  
  // Remaining amounts state
  const [grantRemaining, setGrantRemaining] = useState<{
    total: number;
    committed: number;
    allocated: number;
    remaining: number;
    loading: boolean;
  } | null>(null)
  const [stateAllocationRemaining, setStateAllocationRemaining] = useState<{
    total: number;
    committed: number;
    allocated: number;
    remaining: number;
    loading: boolean;
  } | null>(null)
  const [mouTotalAmount, setMouTotalAmount] = useState<number>(0)
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  const toDisplay = (value: any): string => {
    if (value == null) return ''
    if (typeof value === 'string') return value
    try {
      if (Array.isArray(value)) {
        return value.map((item: any) => {
          if (item == null) return ''
          if (typeof item === 'string') return item
          return item.activity || item.description || item.selectedActivity || JSON.stringify(item)
        }).join('\n')
      }
      // Plain object
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  // Aggregate data from all projects
  const aggregatedData = useMemo(() => {
    const projects = detail?.projects || (detail?.project ? [detail.project] : [])
    if (projects.length === 0) {
      return {
        objectives: null,
        beneficiaries: null,
        activities: null,
        activitiesDetailed: null,
        locations: { localities: '', state: null },
        banking: null,
        budgetTable: null
      }
    }

    return {
      objectives: aggregateObjectives(projects),
      beneficiaries: aggregateBeneficiaries(projects),
      activities: aggregatePlannedActivities(projects),
      activitiesDetailed: aggregatePlannedActivitiesDetailed(projects),
      locations: aggregateLocations(projects),
      banking: getBankingDetails(projects),
      budgetTable: getBudgetTable(projects)
    }
  }, [detail])

  const fetchMous = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (selectedState && selectedState !== 'all') params.append('state', selectedState)
      
      const res = await fetch(`/api/f3/mous?${params.toString()}`)
      const data = await res.json()
      setMous(data)
      setCurrentPage(1) // Reset to first page when data refreshes
      
      // Extract unique states from MOUs for the filter dropdown
      const uniqueStates = Array.from(new Set(data.map((m: MOU) => m.state).filter(Boolean))) as string[]
      setAvailableStates(uniqueStates.sort())
      
      // Check assignment status for each MOU
      await checkMouAssignmentStatus(data.map((m: MOU) => m.id))
    } catch (e) {
      console.error('Failed to load MOUs', e)
    } finally {
      setLoading(false)
    }
  }
  
  const checkMouAssignmentStatus = async (mouIds: string[]) => {
    try {
      const statusMap: Record<string, { hasUnassigned: boolean; projectCount: number }> = {}
      
      for (const mouId of mouIds) {
        const { data: projects, error } = await supabase
          .from('err_projects')
          .select('id, grant_id')
          .eq('mou_id', mouId)
        
        if (error) {
          console.error(`Error checking MOU ${mouId}:`, error)
          continue
        }
        
        const projectCount = projects?.length || 0
        // A project is assigned if it has a grant_id that looks like a serial (starts with LCC-)
        const hasUnassigned = projectCount > 0 && projects?.some((p: any) => !p.grant_id || !p.grant_id.startsWith('LCC-')) || false
        
        statusMap[mouId] = { hasUnassigned, projectCount }
      }
      
      setMouAssignmentStatus(statusMap)
    } catch (error) {
      console.error('Error checking MOU assignment status:', error)
    }
  }
  
  const fetchGrantsFromGridView = async () => {
    try {
      const { data, error } = await supabase
        .from('grants_grid_view')
        .select('grant_id, donor_name, project_name, donor_id')
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
            donor_id: grant.donor_id
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
  
  const handleAssignMou = async () => {
    if (!assigningMouId || !tempGrantId || !tempDonorName || !tempMMYY) {
      alert('Please fill all assignment fields')
      return
    }
    
    if (tempMMYY.length !== 4) {
      alert('MMYY must be 4 digits')
      return
    }
    
    setIsAssigning(true)
    try {
      const response = await fetch(`/api/f3/mous/${assigningMouId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_id: tempGrantId,
          donor_name: tempDonorName,
          mmyy: tempMMYY
        })
      })
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to assign MOU' }))
        alert(error.error || 'Failed to assign MOU')
        return
      }
      
      const result = await response.json()
      alert(`Successfully assigned ${result.assigned_count} work plan(s) to grant`)
      
      // Clear form
      setTempGrantId('')
      setTempDonorName('')
      setTempMMYY('')
      setAssignModalOpen(false)
      setAssigningMouId(null)
      
      // Refresh MOUs and assignment status
      await fetchMous()
    } catch (error) {
      console.error('Error assigning MOU:', error)
      alert('Failed to assign MOU')
    } finally {
      setIsAssigning(false)
    }
  }
  
  const openAssignModal = async (mouId: string) => {
    setAssigningMouId(mouId)
    setAssignModalOpen(true)
    
    // Fetch projects in this MOU
    try {
      const { data: projects, error } = await supabase
        .from('err_projects')
        .select('id, err_id, state, locality, expenses')
        .eq('mou_id', mouId)
        .eq('funding_status', 'committed')
        .eq('status', 'approved')
        .order('submitted_at', { ascending: true })
      
      if (error) {
        console.error('Error fetching MOU projects:', error)
        setMouProjects([])
        setMouTotalAmount(0)
      } else {
        setMouProjects((projects || []).map(p => ({ id: p.id, err_id: p.err_id, state: p.state, locality: p.locality })))
        
        // Calculate MOU total amount
        const totalAmount = (projects || []).reduce((sum: number, project: any) => {
          try {
            const expenses = typeof project.expenses === 'string' 
              ? JSON.parse(project.expenses) 
              : project.expenses || []
            return sum + expenses.reduce((expSum: number, exp: any) => expSum + (exp.total_cost || 0), 0)
          } catch {
            return sum
          }
        }, 0)
        setMouTotalAmount(totalAmount)
        
        // Fetch state shorts for the projects
        const states = [...new Set((projects || []).map(p => p.state).filter(Boolean))]
        if (states.length > 0) {
          const { data: stateData } = await supabase
            .from('states')
            .select('state_name, state_short')
            .in('state_name', states)
          
          const shorts: Record<string, string> = {}
          ;(stateData || []).forEach((row: any) => {
            shorts[row.state_name] = row.state_short
          })
          setStateShorts(shorts)
        }
      }
    } catch (error) {
      console.error('Error fetching MOU projects:', error)
      setMouProjects([])
      setMouTotalAmount(0)
    }
  }
  
  const calculateGrantRemaining = async (grantId: string, donorName: string) => {
    if (!grantId || !donorName) {
      setGrantRemaining(null)
      return
    }
    
    try {
      setGrantRemaining(prev => prev ? { ...prev, loading: true } : { total: 0, committed: 0, allocated: 0, remaining: 0, loading: true })
      
      // Get grant from grants_grid_view
      const { data: grant, error: grantError } = await supabase
        .from('grants_grid_view')
        .select('total_transferred_amount_usd, sum_activity_amount, activities')
        .eq('grant_id', grantId)
        .eq('donor_name', donorName)
        .single()
      
      if (grantError || !grant) {
        setGrantRemaining(null)
        return
      }
      
      // Total is the sum_activity_amount from grants_grid_view
      const totalIncluded = Number(grant.sum_activity_amount || 0)
      
      // Get allocated amounts from projects that match this grant
      // Projects assigned to this grant will have grant_id in the activities list
      const activitySerials = grant.activities 
        ? grant.activities.split(',').map((s: string) => s.trim()).filter(Boolean)
        : []
      
      if (activitySerials.length === 0) {
        // No activities yet, so no committed or allocated
        setGrantRemaining({
          total: totalIncluded,
          committed: 0,
          allocated: 0,
          remaining: totalIncluded,
          loading: false
        })
        return
      }
      
      // Get projects that match these serials
      const { data: projects, error: projectsError } = await supabase
        .from('err_projects')
        .select('expenses, funding_status, grant_id')
        .in('grant_id', activitySerials)
      
      if (projectsError) throw projectsError
      
      const sumExpenses = (exp: any): number => {
        try {
          const arr = typeof exp === 'string' ? JSON.parse(exp || '[]') : (exp || [])
          return arr.reduce((s: number, e: any) => s + (e?.total_cost || 0), 0)
        } catch {
          return 0
        }
      }
      
      // Committed = projects with funding_status = 'committed'
      const totalCommitted = (projects || [])
        .filter((p: any) => p.funding_status === 'committed')
        .reduce((sum: number, p: any) => sum + sumExpenses(p.expenses), 0)
      
      // Allocated = projects with funding_status = 'allocated' or (unassigned + pending)
      const totalAllocated = (projects || [])
        .filter((p: any) => p.funding_status === 'allocated' || (p.funding_status === 'unassigned' && p.status === 'pending'))
        .reduce((sum: number, p: any) => sum + sumExpenses(p.expenses), 0)
      
      const remaining = totalIncluded - totalCommitted - totalAllocated
      
      setGrantRemaining({
        total: totalIncluded,
        committed: totalCommitted,
        allocated: totalAllocated,
        remaining,
        loading: false
      })
    } catch (error) {
      console.error('Error calculating grant remaining:', error)
      setGrantRemaining(null)
    }
  }
  
  const calculateStateAllocationRemaining = async (stateName: string) => {
    if (!stateName) {
      setStateAllocationRemaining(null)
      return
    }
    
    try {
      setStateAllocationRemaining(prev => prev ? { ...prev, loading: true } : { total: 0, committed: 0, allocated: 0, remaining: 0, loading: true })
      
      // Get all allocations for this state from allocations_by_date
      const { data: allocations, error: allocationsError } = await supabase
        .from('allocations_by_date')
        .select('"Allocation Amount", State')
        .eq('State', stateName)
      
      if (allocationsError) throw allocationsError
      
      const totalAllocated = (allocations || []).reduce((sum: number, alloc: any) => {
        const amount = alloc['Allocation Amount'] ? Number(alloc['Allocation Amount']) : 0
        return sum + amount
      }, 0)
      
      // Get committed and allocated amounts from projects for this state
      const { data: projects, error: projectsError } = await supabase
        .from('err_projects')
        .select('expenses, funding_status, state')
        .eq('state', stateName)
      
      if (projectsError) throw projectsError
      
      const sumExpenses = (exp: any): number => {
        try {
          const arr = typeof exp === 'string' ? JSON.parse(exp || '[]') : (exp || [])
          return arr.reduce((s: number, e: any) => s + (e?.total_cost || 0), 0)
        } catch {
          return 0
        }
      }
      
      const totalCommitted = (projects || [])
        .filter((p: any) => p.funding_status === 'committed')
        .reduce((sum: number, p: any) => sum + sumExpenses(p.expenses), 0)
      
      const totalAllocatedProjects = (projects || [])
        .filter((p: any) => p.funding_status === 'allocated' || (p.funding_status === 'unassigned' && p.status === 'pending'))
        .reduce((sum: number, p: any) => sum + sumExpenses(p.expenses), 0)
      
      const remaining = totalAllocated - totalCommitted - totalAllocatedProjects
      
      setStateAllocationRemaining({
        total: totalAllocated,
        committed: totalCommitted,
        allocated: totalAllocatedProjects,
        remaining,
        loading: false
      })
    } catch (error) {
      console.error('Error calculating state allocation remaining:', error)
      setStateAllocationRemaining(null)
    }
  }
  

  useEffect(() => {
    fetchMous()
    fetchGrantsFromGridView()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedState])
  
  // Calculate grant remaining when grant changes
  useEffect(() => {
    if (tempGrantId && tempDonorName && assignModalOpen) {
      calculateGrantRemaining(tempGrantId, tempDonorName)
    } else {
      setGrantRemaining(null)
    }
  }, [tempGrantId, tempDonorName, assignModalOpen])
  
  // Calculate state allocation remaining when modal opens
  useEffect(() => {
    if (assignModalOpen && mouProjects.length > 0) {
      const stateName = mouProjects[0]?.state
      if (stateName) {
        calculateStateAllocationRemaining(stateName)
      }
    } else {
      setStateAllocationRemaining(null)
    }
  }, [assignModalOpen, mouProjects])

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('f3:title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Select value={selectedState} onValueChange={setSelectedState}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by State" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                {availableStates.map(state => (
                  <SelectItem key={state} value={state}>{state}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="py-8 text-center text-muted-foreground">{t('common:loading') || 'Loading...'}</div>
          ) : (
            <>
              <Table dir={i18n.language === 'ar' ? 'rtl' : 'ltr'}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('f3:headers.mou_code')}</TableHead>
                    <TableHead>{t('f3:headers.partner')}</TableHead>
                    <TableHead>{t('f3:headers.err_state')}</TableHead>
                    <TableHead className="text-right">{t('f3:headers.total')}</TableHead>
                    <TableHead>{t('f3:headers.end_date')}</TableHead>
                    <TableHead>{t('f3:headers.created')}</TableHead>
                    <TableHead>{t('f3:headers.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
              <TableBody>
                {(() => {
                    const totalPages = Math.ceil(mous.length / itemsPerPage)
                    const startIndex = (currentPage - 1) * itemsPerPage
                    const endIndex = startIndex + itemsPerPage
                    const paginatedMous = mous.slice(startIndex, endIndex)
                    
                    return paginatedMous.map(m => (
                      <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.mou_code}</TableCell>
                    <TableCell>{m.partner_name}</TableCell>
                    <TableCell>{m.err_name}{m.state ? ` — ${m.state}` : ''}</TableCell>
                    <TableCell className="text-right">{Number(m.total_amount || 0).toLocaleString()}</TableCell>
                    <TableCell>{m.end_date ? new Date(m.end_date).toLocaleDateString() : '-'}</TableCell>
                    <TableCell>{new Date(m.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="align-top">
                      <div className="flex items-start gap-3">
                        {mouAssignmentStatus[m.id]?.hasUnassigned && (
                          <div className="flex flex-col items-center gap-0.5 min-w-[50px]">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openAssignModal(m.id)}
                              title="Assign to Grant"
                            >
                              <Link2 className="h-4 w-4 text-blue-600" />
                            </Button>
                            <span className="text-[10px] text-muted-foreground text-center leading-tight">Assign</span>
                          </div>
                        )}
                        <div className="flex flex-col items-center gap-0.5 min-w-[50px]">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={async () => {
                          setActiveMou(m)
                          setEditMode(false)
                          setEditingMou({})
                          setPreviewOpen(true)
                          try {
                            const res = await fetch(`/api/f3/mous/${m.id}`)
                            const data = await res.json()
                            setDetail(data)
                            // Update activeMou with latest data including override fields
                            if (data.mou) {
                              setActiveMou(data.mou)
                            }
                            // Attempt lightweight auto-translation for aggregated project fields
                            const projects = data?.projects || (data?.project ? [data.project] : [])
                            const objStr = aggregateObjectives(projects) || ''
                            const benStr = aggregateBeneficiaries(projects) || ''
                            const actStr = aggregatePlannedActivitiesDetailed(projects) || aggregatePlannedActivities(projects) || ''
                            const hasArabic = (s?: string) => !!s && /[\u0600-\u06FF]/.test(s)

                            const translate = async (q: string, source: 'ar'|'en', target: 'ar'|'en') => {
                              try {
                                const r = await fetch('/api/translate', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ q, source, target, format: 'text' })
                                })
                                const j = await r.json()
                                return j?.translatedText || q
                              } catch {
                                return q
                              }
                            }

                            const newTx: any = {}
                            if (objStr) {
                              if (hasArabic(objStr)) {
                                newTx.objectives_ar = objStr
                                newTx.objectives_en = await translate(objStr, 'ar', 'en')
                              } else {
                                newTx.objectives_en = objStr
                                newTx.objectives_ar = await translate(objStr, 'en', 'ar')
                              }
                            }
                            if (benStr) {
                              if (hasArabic(benStr)) {
                                newTx.beneficiaries_ar = benStr
                                newTx.beneficiaries_en = await translate(benStr, 'ar', 'en')
                              } else {
                                newTx.beneficiaries_en = benStr
                                newTx.beneficiaries_ar = await translate(benStr, 'en', 'ar')
                              }
                            }
                            if (actStr) {
                              if (hasArabic(actStr)) {
                                newTx.activities_ar = actStr
                                newTx.activities_en = await translate(actStr, 'ar', 'en')
                              } else {
                                newTx.activities_en = actStr
                                newTx.activities_ar = await translate(actStr, 'en', 'ar')
                              }
                            }
                            setTranslations(newTx)
                          } catch (e) {
                            console.error('Failed loading detail', e)
                          }
                        }}
                        title={t('f3:preview')}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <span className="text-[10px] text-muted-foreground text-center leading-tight">{t('f3:preview')}</span>
                    </div>
                        <input
                          type="file"
                          id={`payment-upload-${m.id}`}
                          className="hidden"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file) return

                            try {
                              const formData = new FormData()
                              formData.append('file', file)

                              const response = await fetch(`/api/f3/mous/${m.id}/payment-confirmation`, {
                                method: 'POST',
                                body: formData
                              })

                              if (!response.ok) {
                                throw new Error('Failed to upload payment confirmation')
                              }

                              // Refresh the MOUs list
                              await fetchMous()
                              alert('Payment confirmation uploaded successfully')
                            } catch (error) {
                              console.error('Error uploading payment confirmation:', error)
                              alert('Failed to upload payment confirmation')
                            }

                            // Clear the input
                            e.target.value = ''
                          }}
                        />
                        <div className="flex flex-col items-center gap-0.5 min-w-[50px]">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={m.payment_confirmation_file ? async () => {
                            try {
                              // First get the signed URL
                              const response = await fetch(`/api/storage/signed-url?path=${encodeURIComponent(m.payment_confirmation_file || '')}`)
                              if (!response.ok) {
                                throw new Error('Failed to get signed URL')
                              }
                              const { url, error } = await response.json()
                              if (error || !url) {
                                throw new Error(error || 'No URL returned')
                              }

                              // Create a link and click it
                              const link = document.createElement('a')
                              link.href = url
                              link.target = '_blank'
                              link.rel = 'noopener noreferrer'
                              document.body.appendChild(link)
                              link.click()
                              document.body.removeChild(link)
                            } catch (error) {
                              console.error('Error getting signed URL:', error)
                              alert('Failed to open payment confirmation')
                            }
                          } : () => {
                            document.getElementById(`payment-upload-${m.id}`)?.click()
                          }}
                          title={m.payment_confirmation_file ? t('f3:view_payment') : t('f3:add_payment')}
                        >
                          {m.payment_confirmation_file ? (
                            <Receipt className="h-4 w-4 text-green-600" />
                          ) : (
                            <Upload className="h-4 w-4 text-amber-600" />
                          )}
                        </Button>
                        <span className="text-[10px] text-muted-foreground text-center leading-tight whitespace-nowrap">{m.payment_confirmation_file ? t('f3:view_payment') : t('f3:add_payment')}</span>
                      </div>
                        <input
                          type="file"
                          id={`signed-mou-upload-${m.id}`}
                          className="hidden"
                          accept=".pdf"
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file) return

                            try {
                              const formData = new FormData()
                              formData.append('file', file)

                              const response = await fetch(`/api/f3/mous/${m.id}/signed-mou`, {
                                method: 'POST',
                                body: formData
                              })

                              if (!response.ok) {
                                throw new Error('Failed to upload signed MOU')
                              }

                              // Refresh the MOUs list
                              await fetchMous()
                              alert('Signed MOU uploaded successfully')
                            } catch (error) {
                              console.error('Error uploading signed MOU:', error)
                              alert('Failed to upload signed MOU')
                            }

                            // Clear the input
                            e.target.value = ''
                          }}
                        />
                        <div className="flex flex-col items-center gap-0.5 min-w-[50px]">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={m.signed_mou_file_key ? async () => {
                            try {
                              // First get the signed URL
                              const response = await fetch(`/api/storage/signed-url?path=${encodeURIComponent(m.signed_mou_file_key || '')}`)
                              if (!response.ok) {
                                throw new Error('Failed to get signed URL')
                              }
                              const { url, error } = await response.json()
                              if (error || !url) {
                                throw new Error(error || 'No URL returned')
                              }

                              // Create a link and click it
                              const link = document.createElement('a')
                              link.href = url
                              link.target = '_blank'
                              link.rel = 'noopener noreferrer'
                              document.body.appendChild(link)
                              link.click()
                              document.body.removeChild(link)
                            } catch (error) {
                              console.error('Error getting signed URL:', error)
                              alert('Failed to open signed MOU')
                            }
                          } : () => {
                            document.getElementById(`signed-mou-upload-${m.id}`)?.click()
                          }}
                          title={m.signed_mou_file_key ? 'View Signed MOU' : 'Upload Signed MOU'}
                        >
                          {m.signed_mou_file_key ? (
                            <FileCheck className="h-4 w-4 text-green-600" />
                          ) : (
                            <FileSignature className="h-4 w-4 text-amber-600" />
                          )}
                        </Button>
                        <span className="text-[10px] text-muted-foreground text-center leading-tight whitespace-nowrap">{m.signed_mou_file_key ? 'View MOU' : 'Upload MOU'}</span>
                      </div>
                      </div>
                    </TableCell>
                      </TableRow>
                    ))
                  })()}
                </TableBody>
              </Table>
              
              {/* Pagination Controls */}
              {mous.length > itemsPerPage && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, mous.length)} of {mous.length} MOUs
                  </div>
                  <div className="flex items-center gap-2">
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
                      onClick={() => setCurrentPage(prev => Math.min(Math.ceil(mous.length / itemsPerPage), prev + 1))}
                      disabled={currentPage >= Math.ceil(mous.length / itemsPerPage)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* By Grant Table */}
      <PoolByDonor />

      <Dialog open={previewOpen} onOpenChange={(open) => {
        setPreviewOpen(open)
        if (!open) {
          setEditMode(false)
          setEditingMou({})
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{activeMou?.mou_code || 'MOU'}</DialogTitle>
          </DialogHeader>
          {activeMou && (
            <div id={previewId} className="space-y-4">
              <div className="rounded-lg border p-4" data-mou-section="true">
                <div className="text-lg font-semibold mb-2">
                  {t('f3:mou_agreement', { lng: 'en' })}
                  <div className="text-sm text-muted-foreground" dir="rtl">{t('f3:mou_agreement', { lng: 'ar' })}</div>
                </div>
                {editMode ? (
                  <div className="space-y-4">
                    <div>
                      <Label>{t('f3:between', { lng: 'en' })}</Label>
                      <Input
                        value={editingMou.partner_name || ''}
                        onChange={(e) => setEditingMou({ ...editingMou, partner_name: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>{t('f3:and', { lng: 'en' })}</Label>
                      <Input
                        value={editingMou.err_name || ''}
                        onChange={(e) => setEditingMou({ ...editingMou, err_name: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-sm">
                    <div className="font-medium">{t('f3:between', { lng: 'en' })}</div>
                    <div>{activeMou.partner_name}</div>
                    <div className="font-medium mt-2">{t('f3:and', { lng: 'en' })}</div>
                    <div>{activeMou.err_name}</div>
                    <div className="mt-3" dir="rtl">
                      <div className="font-medium">{t('f3:between', { lng: 'ar' })}</div>
                      <div>{activeMou.partner_name}</div>
                      <div className="font-medium mt-2">{t('f3:and', { lng: 'ar' })}</div>
                      <div>{activeMou.err_name}</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-lg border p-4" data-mou-section="true">
                <div className="font-semibold mb-2">
                  1. {t('f3:purpose', { lng: 'en' })}
                  <div className="text-sm text-muted-foreground" dir="rtl">{t('f3:purpose', { lng: 'ar' })}</div>
                </div>
                <p className="text-sm">{t('f3:purpose_desc', { lng: 'en', partner: activeMou.partner_name, err: activeMou.err_name })}</p>
                <p className="text-sm mt-2">{t('f3:activities_intro', { lng: 'en' })}</p>
                <p className="text-sm mt-2" dir="rtl">{t('f3:activities_intro', { lng: 'ar' })}</p>
                <p className="text-sm" dir="rtl">{t('f3:purpose_desc', { lng: 'ar', partner: activeMou.partner_name, err: activeMou.err_name })}</p>

                {/* English row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3" data-mou-subsection="true">
                  <div className="rounded-md border p-3">
                    <div className="font-medium mb-2">{t('f3:shall_err', { err: activeMou.err_name })}</div>
                    <div className="text-sm space-y-2">
                      {(translations.objectives_en || aggregatedData.objectives) && (
                        <div>
                          <div className="font-semibold">{t('f3:objectives')}</div>
                          <div className="whitespace-pre-wrap">{translations.objectives_en || aggregatedData.objectives || ''}</div>
                        </div>
                      )}
                      {(translations.beneficiaries_en || aggregatedData.beneficiaries) && (
                        <div>
                          <div className="font-semibold">{t('f3:target_beneficiaries')}</div>
                          <div className="whitespace-pre-wrap">{translations.beneficiaries_en || aggregatedData.beneficiaries || ''}</div>
                        </div>
                      )}
                      {(aggregatedData.activitiesDetailed || translations.activities_en || aggregatedData.activities) && (
                        <div>
                          <div className="font-semibold">{t('f3:planned_activities')}</div>
                          <div className="whitespace-pre-wrap">{aggregatedData.activitiesDetailed || translations.activities_en || aggregatedData.activities || ''}</div>
                        </div>
                      )}
                      {(aggregatedData.locations.localities || aggregatedData.locations.state) && (
                        <div className="text-xs text-muted-foreground">{t('f3:location', { lng: 'en' })}: {aggregatedData.locations.localities || '-'} / {aggregatedData.locations.state || '-'}</div>
                      )}
                    </div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="font-medium mb-2">{t('f3:shall_partner', { partner: activeMou.partner_name })}</div>
                    <ul className="list-disc pl-5 text-sm space-y-1">
                      <li>{t('f3:partner_provide_sum', { amount: Number(activeMou.total_amount || 0).toLocaleString() })}</li>
                      <li>{t('f3:partner_accept_apps')}</li>
                      <li>{t('f3:partner_assess_needs')}</li>
                      <li>{t('f3:partner_support_followup')}</li>
                      <li>{t('f3:partner_report')}</li>
                    </ul>
                  </div>
                </div>

                {/* Arabic row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4" data-mou-subsection="true">
                  <div className="rounded-md border p-3" dir="rtl">
                    <div className="font-medium mb-2">تلتزم {activeMou.err_name}</div>
                    <div className="text-sm space-y-2">
                      {(translations.objectives_ar || aggregatedData.objectives) && (
                        <div>
                          <div className="font-semibold">الأهداف</div>
                          <div className="whitespace-pre-wrap">{translations.objectives_ar || aggregatedData.objectives || ''}</div>
                        </div>
                      )}
                      {(translations.beneficiaries_ar || aggregatedData.beneficiaries) && (
                        <div>
                          <div className="font-semibold">المستفيدون المستهدفون</div>
                          <div className="whitespace-pre-wrap">{translations.beneficiaries_ar || aggregatedData.beneficiaries || ''}</div>
                        </div>
                      )}
                      {(aggregatedData.activitiesDetailed || translations.activities_ar || aggregatedData.activities) && (
                        <div>
                          <div className="font-semibold">الأنشطة المخططة</div>
                          <div className="whitespace-pre-wrap">{aggregatedData.activitiesDetailed || translations.activities_ar || aggregatedData.activities || ''}</div>
                        </div>
                      )}
                      {(aggregatedData.locations.localities || aggregatedData.locations.state) && (
                        <div className="text-xs text-muted-foreground">الموقع: {aggregatedData.locations.localities || '-'} / {aggregatedData.locations.state || '-'}</div>
                      )}
                    </div>
                  </div>
                  <div className="rounded-md border p-3" dir="rtl">
                    <div className="font-medium mb-2">تلتزم {activeMou.partner_name}</div>
                    <ul className="list-disc list-inside pr-5 text-sm space-y-1 break-words">
                      <li>تقديم مبلغ قدره ${Number(activeMou.total_amount || 0).toLocaleString()}.</li>
                      <li>قبول الطلبات المقدّمة من المجتمعات والتي تحدد أولويات الاحتياجات (الحماية، المياه والصرف الصحي، الأمن الغذائي، الصحة أو المأوى والمواد غير الغذائية).</li>
                      <li>تقييم الاحتياجات بشكل عادل وفق المنهجية المجتمعية (نموذج F1).</li>
                      <li>تقديم الدعم الفني والمتابعة المستمرة للإجراءات المتفق عليها.</li>
                      <li>رفع التقارير إلى المانح.</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-4" data-mou-section="true">
                <div className="font-semibold mb-2">2. {t('f3:principles')}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-md border p-3 text-sm">{t('f3:principles_en_desc')}</div>
                  <div className="rounded-md border p-3 text-sm" dir="rtl">{t('f3:principles_ar_desc')}</div>
                </div>
              </div>

              <div className="rounded-lg border p-4" data-mou-section="true">
                <div className="font-semibold mb-2">3. {t('f3:reports')}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-md border p-3 text-sm">{t('f3:reports_en_desc')}</div>
                  <div className="rounded-md border p-3 text-sm" dir="rtl">{t('f3:reports_ar_desc')}</div>
                </div>
              </div>

              <div className="rounded-lg border p-4" data-mou-section="true">
                <div className="font-semibold mb-2">4. {t('f3:funding')}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-md border p-3 text-sm">{t('f3:funding_en_desc', { partner: activeMou.partner_name, amount: Number(activeMou.total_amount || 0).toLocaleString() })}</div>
                  <div className="rounded-md border p-3 text_sm" dir="rtl">{t('f3:funding_ar_desc', { partner: activeMou.partner_name, amount: Number(activeMou.total_amount || 0).toLocaleString() })}</div>
                </div>
              </div>

              <div className="rounded-lg border p-4" data-mou-section="true">
                <div className="font-semibold mb-2">5. {t('f3:approved_accounts')}</div>
                {editMode ? (
                  <div>
                    <Label>Banking Details</Label>
                    <Textarea
                      value={editingMou.banking_details_override ?? ''}
                      onChange={(e) => setEditingMou({ ...editingMou, banking_details_override: e.target.value })}
                      className="mt-1 min-h-[100px]"
                      placeholder="Enter banking details..."
                    />
                    <p className="text-xs text-muted-foreground mt-1">Leave empty to use aggregated data from projects</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-md border p-3 text-sm whitespace-pre-wrap">{(activeMou.banking_details_override || aggregatedData.banking) || t('f3:approved_accounts_en_desc')}</div>
                    <div className="rounded-md border p-3 text-sm whitespace-pre-wrap" dir="rtl">{(activeMou.banking_details_override || aggregatedData.banking) || t('f3:approved_accounts_ar_desc')}</div>
                  </div>
                )}
              </div>

              <div className="rounded-lg border p-4" data-mou-section="true">
                <div className="font-semibold mb-2">6. {t('f3:budget')}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="rounded-md border p-3 text-sm">{t('f3:budget_en_desc')}</div>
                  <div className="rounded-md border p-3 text-sm" dir="rtl">{t('f3:budget_ar_desc')}</div>
                </div>
                {aggregatedData.budgetTable && (
                  <div className="mt-4 overflow-x-auto" dangerouslySetInnerHTML={{ __html: aggregatedData.budgetTable }} />
                )}
              </div>

              <div className="rounded-lg border p-4" data-mou-section="true">
                <div className="font-semibold mb-2">
                  7. {t('f3:duration', { lng: 'en' })}
                  <div className="text-sm text-muted-foreground" dir="rtl">{t('f3:duration', { lng: 'ar' })}</div>
                </div>
                {editMode ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Start Date</Label>
                      <Input
                        type="date"
                        value={editingMou.start_date ? new Date(editingMou.start_date).toISOString().split('T')[0] : ''}
                        onChange={(e) => setEditingMou({ ...editingMou, start_date: e.target.value || null })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>End Date</Label>
                      <Input
                        type="date"
                        value={editingMou.end_date ? new Date(editingMou.end_date).toISOString().split('T')[0] : ''}
                        onChange={(e) => setEditingMou({ ...editingMou, end_date: e.target.value || null })}
                        className="mt-1"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm">
                      {activeMou.start_date && activeMou.end_date
                        ? `From ${new Date(activeMou.start_date).toLocaleDateString()} to ${new Date(activeMou.end_date).toLocaleDateString()}`
                        : activeMou.end_date
                        ? `Until ${new Date(activeMou.end_date).toLocaleDateString()}`
                        : t('f3:duration_en_open', { lng: 'en' })}
                    </p>
                    <p className="text-sm" dir="rtl">
                      {activeMou.start_date && activeMou.end_date
                        ? `من ${new Date(activeMou.start_date).toLocaleDateString('ar')} إلى ${new Date(activeMou.end_date).toLocaleDateString('ar')}`
                        : activeMou.end_date
                        ? `حتى ${new Date(activeMou.end_date).toLocaleDateString('ar')}`
                        : t('f3:duration_en_open', { lng: 'ar' })}
                    </p>
                  </>
                )}
              </div>

              <div className="rounded-lg border p-4" data-mou-section="true">
                <div className="font-semibold mb-2">8. {t('f3:contact_info', { lng: 'en' })}
                  <div className="text-sm text-muted-foreground" dir="rtl">{t('f3:contact_info', { lng: 'ar' })}</div>
                </div>
                {editMode ? (
                  <div className="space-y-4">
                    <div>
                      <Label>Partner Contact Information</Label>
                      <Textarea
                        value={editingMou.partner_contact_override ?? ''}
                        onChange={(e) => setEditingMou({ ...editingMou, partner_contact_override: e.target.value })}
                        className="mt-1 min-h-[80px]"
                        placeholder="Enter partner contact information..."
                      />
                      <p className="text-xs text-muted-foreground mt-1">Leave empty to use data from partners table</p>
                    </div>
                    <div>
                      <Label>ERR Contact Information</Label>
                      <Textarea
                        value={editingMou.err_contact_override ?? ''}
                        onChange={(e) => setEditingMou({ ...editingMou, err_contact_override: e.target.value })}
                        className="mt-1 min-h-[80px]"
                        placeholder="Enter ERR contact information..."
                      />
                      <p className="text-xs text-muted-foreground mt-1">Leave empty to use data from projects</p>
                    </div>
                    
                    {/* Signatures Section */}
                    <div className="mt-6 pt-4 border-t">
                      <div className="flex items-center justify-between mb-4">
                        <Label className="text-base font-semibold">Signatures</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const currentSignatures = (editingMou.signatures as Signature[]) || []
                            const newSignature: Signature = {
                              id: `temp-${Date.now()}`,
                              name: '',
                              role: '',
                              date: new Date().toISOString().split('T')[0]
                            }
                            setEditingMou({
                              ...editingMou,
                              signatures: [...currentSignatures, newSignature]
                            })
                          }}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add Signature
                        </Button>
                      </div>
                      
                      <div className="space-y-4">
                        {((editingMou.signatures as Signature[]) || []).map((sig, index) => (
                          <div key={sig.id} className="border rounded-lg p-4 space-y-3">
                            <div className="flex items-start justify-between">
                              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                  <Label className="text-xs">Name / Role</Label>
                                  <Input
                                    value={sig.name}
                                    onChange={(e) => {
                                      const updated = [...((editingMou.signatures as Signature[]) || [])]
                                      updated[index] = { ...updated[index], name: e.target.value }
                                      setEditingMou({ ...editingMou, signatures: updated })
                                    }}
                                    placeholder="e.g., John Doe, Partner Representative"
                                    className="mt-1"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">Date</Label>
                                  <Input
                                    type="date"
                                    value={sig.date}
                                    onChange={(e) => {
                                      const updated = [...((editingMou.signatures as Signature[]) || [])]
                                      updated[index] = { ...updated[index], date: e.target.value }
                                      setEditingMou({ ...editingMou, signatures: updated })
                                    }}
                                    className="mt-1"
                                  />
                                </div>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const updated = ((editingMou.signatures as Signature[]) || []).filter((_, i) => i !== index)
                                  setEditingMou({ ...editingMou, signatures: updated.length > 0 ? updated : null })
                                }}
                                className="ml-2 text-destructive hover:text-destructive"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                        {(!editingMou.signatures || (editingMou.signatures as Signature[]).length === 0) && (
                          <p className="text-sm text-muted-foreground text-center py-4">No signatures added yet. Click "Add Signature" to add one.</p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* English labels */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="font-medium mb-1">{t('f3:partner_label', { lng: 'en' })}</div>
                        <div className="whitespace-pre-wrap">{activeMou.partner_contact_override || (detail?.partner ? `${detail.partner.name}${detail.partner.contact_person ? `\n${t('f3:representative', { lng: 'en' })}: ${detail.partner.contact_person}` : ''}${detail.partner.position ? `\n${t('f3:position', { lng: 'en' })}: ${detail.partner.position}` : ''}${detail.partner.email ? `\n${t('f3:email', { lng: 'en' })}: ${detail.partner.email}` : ''}${detail.partner.phone_number ? `\n${t('f3:phone', { lng: 'en' })}: ${detail.partner.phone_number}` : ''}` : activeMou.partner_name)}</div>
                      </div>
                      <div>
                        <div className="font-medium mb-1">{t('f3:err_label', { lng: 'en' })}</div>
                        <div className="whitespace-pre-wrap">{activeMou.err_contact_override || `${activeMou.err_name}${((detail?.projects && detail.projects[0]?.program_officer_name) || detail?.project?.program_officer_name) ? `\n${t('f3:representative', { lng: 'en' })}: ${(detail?.projects && detail.projects[0]?.program_officer_name) || detail?.project?.program_officer_name}` : ''}${((detail?.projects && detail.projects[0]?.program_officer_phone) || detail?.project?.program_officer_phone) ? `\n${t('f3:phone', { lng: 'en' })}: ${(detail?.projects && detail.projects[0]?.program_officer_phone) || detail?.project?.program_officer_phone}` : ''}`}</div>
                      </div>
                    </div>
                    {/* Arabic labels */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mt-4" dir="rtl">
                      <div>
                        <div className="font-medium mb-1">{t('f3:partner_label', { lng: 'ar' })}</div>
                        <div className="whitespace-pre-wrap">{activeMou.partner_contact_override || (detail?.partner ? `${detail.partner.name}${detail.partner.contact_person ? `\n${t('f3:representative', { lng: 'ar' })}: ${detail.partner.contact_person}` : ''}${detail.partner.position ? `\n${t('f3:position', { lng: 'ar' })}: ${detail.partner.position}` : ''}${detail.partner.email ? `\n${t('f3:email', { lng: 'ar' })}: ${detail.partner.email}` : ''}${detail.partner.phone_number ? `\n${t('f3:phone', { lng: 'ar' })}: ${detail.partner.phone_number}` : ''}` : activeMou.partner_name)}</div>
                      </div>
                      <div>
                        <div className="font-medium mb-1">{t('f3:err_label', { lng: 'ar' })}</div>
                        <div className="whitespace-pre-wrap">{activeMou.err_contact_override || `${activeMou.err_name}${((detail?.projects && detail.projects[0]?.program_officer_name) || detail?.project?.program_officer_name) ? `\n${t('f3:representative', { lng: 'ar' })}: ${(detail?.projects && detail.projects[0]?.program_officer_name) || detail?.project?.program_officer_name}` : ''}${((detail?.projects && detail.projects[0]?.program_officer_phone) || detail?.project?.program_officer_phone) ? `\n${t('f3:phone', { lng: 'ar' })}: ${(detail?.projects && detail.projects[0]?.program_officer_phone) || detail?.project?.program_officer_phone}` : ''}`}</div>
                      </div>
                    </div>
                    {/* Signatures */}
                    {activeMou.signatures && (activeMou.signatures as Signature[]).length > 0 ? (
                      <div className="mt-6 pt-4 border-t">
                        <div className="font-semibold mb-4">Signatures</div>
                        {(activeMou.signatures as Signature[]).map((sig, index) => (
                          <div key={sig.id || index} className="mb-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
                              <div className="space-y-2">
                                <div className="font-medium text-sm">{sig.name || `Signature ${index + 1}`}{sig.role ? ` (${sig.role})` : ''}</div>
                                <div className="border-b-2 border-gray-400 min-h-[40px] pb-2">
                                  <span className="text-muted-foreground text-sm">Signature line</span>
                                </div>
                              </div>
                              <div className="space-y-2" dir="rtl">
                                <div className="font-medium text-sm">{sig.name || `التوقيع ${index + 1}`}{sig.role ? ` (${sig.role})` : ''}</div>
                                <div className="border-b-2 border-gray-400 min-h-[40px] pb-2">
                                  <span className="text-muted-foreground text-sm">خط التوقيع</span>
                                </div>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <div className="text-xs text-muted-foreground mb-1">Date</div>
                                <div className="text-xs">{sig.date ? new Date(sig.date).toLocaleDateString() : 'Not set'}</div>
                              </div>
                              <div dir="rtl">
                                <div className="text-xs text-muted-foreground mb-1">التاريخ</div>
                                <div className="text-xs">{sig.date ? new Date(sig.date).toLocaleDateString() : 'غير محدد'}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      // Fallback to old signature fields for backward compatibility
                      <div className="mt-6 pt-4 border-t">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          <div>
                            <div className="font-medium mb-2">Partner Signature</div>
                            <div className="border-b-2 border-gray-400 min-h-[40px] pb-1">
                              {activeMou.partner_signature || <span className="text-muted-foreground text-sm">Signature</span>}
                            </div>
                          </div>
                          <div dir="rtl">
                            <div className="font-medium mb-2">توقيع الشريك</div>
                            <div className="border-b-2 border-gray-400 min-h-[40px] pb-1">
                              {activeMou.partner_signature || <span className="text-muted-foreground text-sm">التوقيع</span>}
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          <div>
                            <div className="font-medium mb-2">ERR Signature</div>
                            <div className="border-b-2 border-gray-400 min-h-[40px] pb-1">
                              {activeMou.err_signature || <span className="text-muted-foreground text-sm">Signature</span>}
                            </div>
                          </div>
                          <div dir="rtl">
                            <div className="font-medium mb-2">توقيع غرفة الطوارئ</div>
                            <div className="border-b-2 border-gray-400 min-h-[40px] pb-1">
                              {activeMou.err_signature || <span className="text-muted-foreground text-sm">التوقيع</span>}
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <div className="font-medium mb-2">Date of Signature</div>
                            <div className="border-b-2 border-gray-400 min-h-[40px] pb-1">
                              {activeMou.signature_date ? new Date(activeMou.signature_date).toLocaleDateString() : <span className="text-muted-foreground text-sm">Date</span>}
                            </div>
                          </div>
                          <div dir="rtl">
                            <div className="font-medium mb-2">تاريخ التوقيع</div>
                            <div className="border-b-2 border-gray-400 min-h-[40px] pb-1">
                              {activeMou.signature_date ? new Date(activeMou.signature_date).toLocaleDateString() : <span className="text-muted-foreground text-sm">التاريخ</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="mt-2 flex justify-end gap-2">
                {editMode ? (
                  <>
                    <Button variant="outline" onClick={() => {
                      setEditMode(false)
                      setEditingMou({})
                    }} disabled={saving}>
                      Cancel
                    </Button>
                    <Button
                      onClick={async () => {
                        try {
                          setSaving(true)
                          const response = await fetch(`/api/f3/mous/${activeMou.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(editingMou)
                          })
                          if (!response.ok) {
                            throw new Error('Failed to save changes')
                          }
                          const updated = await response.json()
                          setActiveMou(updated)
                          setEditMode(false)
                          setEditingMou({})
                          // Refresh the MOUs list
                          await fetchMous()
                          alert('MOU updated successfully')
                        } catch (error) {
                          console.error('Error saving MOU:', error)
                          alert('Failed to save changes')
                        } finally {
                          setSaving(false)
                        }
                      }}
                      disabled={saving}
                    >
                      {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => setPreviewOpen(false)}>Close</Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditMode(true)
                        // Initialize with current display values (override if exists, otherwise aggregated/fallback data)
                        const currentBanking = activeMou?.banking_details_override || aggregatedData.banking || ''
                        const currentPartnerContact = activeMou?.partner_contact_override || (detail?.partner ? `${detail.partner.name}${detail.partner.contact_person ? `\nRepresentative: ${detail.partner.contact_person}` : ''}${detail.partner.position ? `\nPosition: ${detail.partner.position}` : ''}${detail.partner.email ? `\nEmail: ${detail.partner.email}` : ''}${detail.partner.phone_number ? `\nPhone: ${detail.partner.phone_number}` : ''}` : activeMou?.partner_name || '')
                        const currentErrContact = activeMou?.err_contact_override || `${activeMou?.err_name || ''}${((detail?.projects && detail.projects[0]?.program_officer_name) || detail?.project?.program_officer_name) ? `\nRepresentative: ${(detail?.projects && detail.projects[0]?.program_officer_name) || detail?.project?.program_officer_name}` : ''}${((detail?.projects && detail.projects[0]?.program_officer_phone) || detail?.project?.program_officer_phone) ? `\nPhone: ${(detail?.projects && detail.projects[0]?.program_officer_phone) || detail?.project?.program_officer_phone}` : ''}`
                        
                        setEditingMou({
                          partner_name: activeMou?.partner_name || '',
                          err_name: activeMou?.err_name || '',
                          banking_details_override: activeMou?.banking_details_override !== null && activeMou?.banking_details_override !== undefined ? activeMou.banking_details_override : currentBanking,
                          partner_contact_override: activeMou?.partner_contact_override !== null && activeMou?.partner_contact_override !== undefined ? activeMou.partner_contact_override : currentPartnerContact,
                          err_contact_override: activeMou?.err_contact_override !== null && activeMou?.err_contact_override !== undefined ? activeMou.err_contact_override : currentErrContact,
                          start_date: activeMou?.start_date || null,
                          end_date: activeMou?.end_date || null,
                          signatures: activeMou?.signatures || null
                        })
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                  onClick={async () => {
                    try {
                      setExporting(true)
                      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
                        import('html2canvas'),
                        import('jspdf') as any
                      ])
                      const el = document.getElementById(previewId)
                      if (!el) return
                      const canvas = await html2canvas(el as HTMLElement, {
                        scale: 2,
                        useCORS: true,
                        logging: false,
                        backgroundColor: '#ffffff',
                        onclone: (doc) => {
                          // Set CSS variables directly on root element (highest priority)
                          const root = doc.documentElement as HTMLElement
                          root.style.setProperty('--background', '#ffffff')
                          root.style.setProperty('--foreground', '#111111')
                          root.style.setProperty('--card', '#ffffff')
                          root.style.setProperty('--card-foreground', '#111111')
                          root.style.setProperty('--popover', '#ffffff')
                          root.style.setProperty('--popover-foreground', '#111111')
                          root.style.setProperty('--primary', '#111111')
                          root.style.setProperty('--primary-foreground', '#ffffff')
                          root.style.setProperty('--secondary', '#f3f4f6')
                          root.style.setProperty('--secondary-foreground', '#111111')
                          root.style.setProperty('--muted', '#f9fafb')
                          root.style.setProperty('--muted-foreground', '#6b7280')
                          root.style.setProperty('--accent', '#f3f4f6')
                          root.style.setProperty('--accent-foreground', '#111111')
                          root.style.setProperty('--destructive', '#ef4444')
                          root.style.setProperty('--border', '#e5e7eb')
                          root.style.setProperty('--input', '#e5e7eb')
                          root.style.setProperty('--ring', '#6b7280')
                          root.style.setProperty('--chart-1', '#3b82f6')
                          root.style.setProperty('--chart-2', '#10b981')
                          root.style.setProperty('--chart-3', '#f59e0b')
                          root.style.setProperty('--chart-4', '#ef4444')
                          root.style.setProperty('--chart-5', '#8b5cf6')
                          root.style.setProperty('--sidebar', '#ffffff')
                          root.style.setProperty('--sidebar-foreground', '#111111')
                          root.style.setProperty('--sidebar-primary', '#111111')
                          root.style.setProperty('--sidebar-primary-foreground', '#ffffff')
                          root.style.setProperty('--sidebar-accent', '#f3f4f6')
                          root.style.setProperty('--sidebar-accent-foreground', '#111111')
                          root.style.setProperty('--sidebar-border', '#e5e7eb')
                          root.style.setProperty('--sidebar-ring', '#6b7280')
                          
                          // Inject a style tag to override all CSS variables with RGB values
                          const style = doc.createElement('style')
                          style.textContent = `
                            :root {
                              --background: #ffffff !important;
                              --foreground: #111111 !important;
                              --card: #ffffff !important;
                              --card-foreground: #111111 !important;
                              --popover: #ffffff !important;
                              --popover-foreground: #111111 !important;
                              --primary: #111111 !important;
                              --primary-foreground: #ffffff !important;
                              --secondary: #f3f4f6 !important;
                              --secondary-foreground: #111111 !important;
                              --muted: #f9fafb !important;
                              --muted-foreground: #6b7280 !important;
                              --accent: #f3f4f6 !important;
                              --accent-foreground: #111111 !important;
                              --destructive: #ef4444 !important;
                              --border: #e5e7eb !important;
                              --input: #e5e7eb !important;
                              --ring: #6b7280 !important;
                              --chart-1: #3b82f6 !important;
                              --chart-2: #10b981 !important;
                              --chart-3: #f59e0b !important;
                              --chart-4: #ef4444 !important;
                              --chart-5: #8b5cf6 !important;
                              --sidebar: #ffffff !important;
                              --sidebar-foreground: #111111 !important;
                              --sidebar-primary: #111111 !important;
                              --sidebar-primary-foreground: #ffffff !important;
                              --sidebar-accent: #f3f4f6 !important;
                              --sidebar-accent-foreground: #111111 !important;
                              --sidebar-border: #e5e7eb !important;
                              --sidebar-ring: #6b7280 !important;
                            }
                            * {
                              color: #111111 !important;
                              border-color: #e5e7eb !important;
                            }
                            body, html {
                              background-color: #ffffff !important;
                            }
                            .text-muted-foreground {
                              color: #6b7280 !important;
                            }
                            [class*="bg-"] {
                              background-color: #ffffff !important;
                            }
                            [class*="border"] {
                              border-color: #e5e7eb !important;
                            }
                          `
                          doc.head.appendChild(style)
                        }
                      })
                      const imgData = canvas.toDataURL('image/png')
                      const pdf = new jsPDF('p', 'pt', 'a4')
                      const pageWidth = pdf.internal.pageSize.getWidth()
                      const pageHeight = pdf.internal.pageSize.getHeight()
                      const margin = 36 // ~0.5 inch

                      // Strategy: render each logical section to its own canvas and add per page to avoid splitting
                      const container = document.getElementById(previewId) as HTMLElement
                      const sections = Array.from(container.querySelectorAll('[data-mou-section="true"]')) as HTMLElement[]

                      let currentY = margin
                      for (const sec of sections) {
                        const secCanvas = await html2canvas(sec, {
                          scale: 2,
                          useCORS: true,
                          logging: false,
                          backgroundColor: '#ffffff',
                          onclone: (doc) => {
                            // Inject a style tag to override all CSS variables with RGB values
                            const style = doc.createElement('style')
                            style.textContent = `
                              :root {
                                --background: #ffffff !important;
                                --foreground: #111111 !important;
                                --card: #ffffff !important;
                                --card-foreground: #111111 !important;
                                --popover: #ffffff !important;
                                --popover-foreground: #111111 !important;
                                --primary: #111111 !important;
                                --primary-foreground: #ffffff !important;
                                --secondary: #f3f4f6 !important;
                                --secondary-foreground: #111111 !important;
                                --muted: #f9fafb !important;
                                --muted-foreground: #6b7280 !important;
                                --accent: #f3f4f6 !important;
                                --accent-foreground: #111111 !important;
                                --destructive: #ef4444 !important;
                                --border: #e5e7eb !important;
                                --input: #e5e7eb !important;
                                --ring: #6b7280 !important;
                              }
                              * {
                                color: #111111 !important;
                                background-color: transparent !important;
                                border-color: #e5e7eb !important;
                              }
                              .text-muted-foreground {
                                color: #6b7280 !important;
                              }
                              [class*="bg-"] {
                                background-color: #ffffff !important;
                              }
                              [class*="border"] {
                                border-color: #e5e7eb !important;
                              }
                            `
                            doc.head.appendChild(style)
                          }
                        })
                        const secImg = secCanvas.toDataURL('image/png')
                        const secW = secCanvas.width
                        const secH = secCanvas.height
                        const printableW = pageWidth - margin * 2
                        const ratio = printableW / secW
                        const drawW = printableW
                        let drawH = secH * ratio

                        if (currentY + drawH > pageHeight - margin) {
                          pdf.addPage()
                          currentY = margin
                        }
                        // If section still taller than a page, try rendering its subsections individually
                        if (drawH > pageHeight - margin * 2) {
                          const subs = Array.from(sec.querySelectorAll('[data-mou-subsection="true"]')) as HTMLElement[]
                          if (subs.length > 0) {
                            for (const sub of subs) {
                              const subCanvas = await html2canvas(sub, {
                                scale: 2,
                                useCORS: true,
                                logging: false,
                                backgroundColor: '#ffffff',
                                onclone: (doc) => {
                                  // Inject a style tag to override all CSS variables with RGB values
                                  const style = doc.createElement('style')
                                  style.textContent = `
                                    :root {
                                      --background: #ffffff !important;
                                      --foreground: #111111 !important;
                                      --card: #ffffff !important;
                                      --card-foreground: #111111 !important;
                                      --popover: #ffffff !important;
                                      --popover-foreground: #111111 !important;
                                      --primary: #111111 !important;
                                      --primary-foreground: #ffffff !important;
                                      --secondary: #f3f4f6 !important;
                                      --secondary-foreground: #111111 !important;
                                      --muted: #f9fafb !important;
                                      --muted-foreground: #6b7280 !important;
                                      --accent: #f3f4f6 !important;
                                      --accent-foreground: #111111 !important;
                                      --destructive: #ef4444 !important;
                                      --border: #e5e7eb !important;
                                      --input: #e5e7eb !important;
                                      --ring: #6b7280 !important;
                                    }
                                    * {
                                      color: #111111 !important;
                                      background-color: transparent !important;
                                      border-color: #e5e7eb !important;
                                    }
                                    .text-muted-foreground {
                                      color: #6b7280 !important;
                                    }
                                    [class*="bg-"] {
                                      background-color: #ffffff !important;
                                    }
                                    [class*="border"] {
                                      border-color: #e5e7eb !important;
                                    }
                                  `
                                  doc.head.appendChild(style)
                                }
                              })
                              const subImg = subCanvas.toDataURL('image/png')
                              const subW = subCanvas.width
                              const subH = subCanvas.height
                              const subRatio = printableW / subW
                              const subDrawW = printableW
                              const subDrawH = subH * subRatio
                              if (currentY + subDrawH > pageHeight - margin) {
                                pdf.addPage()
                                currentY = margin
                              }
                              pdf.addImage(subImg, 'PNG', margin, currentY, subDrawW, subDrawH)
                              currentY += subDrawH + 8
                            }
                            continue
                          }
                          
                          // If no subsections, split the section canvas into chunks
                          const maxChunkHeight = pageHeight - margin * 2
                          const totalChunks = Math.ceil(drawH / maxChunkHeight)
                          
                          for (let chunk = 0; chunk < totalChunks; chunk++) {
                            const chunkStartY = (chunk * maxChunkHeight) / ratio
                            const chunkHeight = Math.min(maxChunkHeight / ratio, secH - chunkStartY)
                            
                            // Create a temporary canvas for this chunk
                            const chunkCanvas = document.createElement('canvas')
                            chunkCanvas.width = secW
                            chunkCanvas.height = chunkHeight
                            const chunkCtx = chunkCanvas.getContext('2d')
                            if (chunkCtx && secCanvas) {
                              // Draw the portion of the section canvas we need
                              // secCanvas is a canvas element from html2canvas
                              // Copy from secCanvas starting at chunkStartY, taking chunkHeight pixels
                              chunkCtx.drawImage(secCanvas as HTMLCanvasElement, 0, chunkStartY, secW, chunkHeight, 0, 0, secW, chunkHeight)
                              const chunkImg = chunkCanvas.toDataURL('image/png')
                              const chunkDrawH = chunkHeight * ratio
                              
                              if (currentY + chunkDrawH > pageHeight - margin) {
                                pdf.addPage()
                                currentY = margin
                              }
                              
                              pdf.addImage(chunkImg, 'PNG', margin, currentY, drawW, chunkDrawH)
                              currentY += chunkDrawH
                              
                              // Add small gap between chunks (except last)
                              if (chunk < totalChunks - 1) {
                                currentY += 4
                              }
                            }
                          }
                          currentY += 12 // gap after section
                        } else {
                          pdf.addImage(secImg, 'PNG', margin, currentY, drawW, drawH)
                          currentY += drawH + 12 // gap between sections
                        }
                      }
                      const blob = pdf.output('bloburl')
                      window.open(blob, '_blank')
                    } catch (e) {
                      console.error('PDF export failed', e)
                    } finally {
                      setExporting(false)
                    }
                  }}
                  disabled={exporting || editMode}
                >
                  {exporting ? 'Generating…' : 'Download PDF'}
                </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Assignment Modal */}
      <Dialog open={assignModalOpen} onOpenChange={setAssignModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assign MOU to Grant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                Assigning all work plans in MOU {mous.find(m => m.id === assigningMouId)?.mou_code || ''} to a grant call
              </p>
              {mouAssignmentStatus[assigningMouId || ''] && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-sm font-medium text-blue-800">
                    This MOU contains {mouAssignmentStatus[assigningMouId || ''].projectCount} work plan(s) that will be assigned together.
                  </p>
                </div>
              )}
            </div>

            {/* Row 1: Grant and Donor */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Grant *</Label>
                <Select 
                  value={tempGrantId} 
                  onValueChange={async (value) => {
                    const selectedGrant = grantsFromGridView.find((g: any) => g.grant_id === value)
                    setTempGrantId(value)
                    setTempDonorName(selectedGrant?.donor_name || '')
                    
                    // Fetch max_workplan_sequence from grants_grid_view
                    if (value && selectedGrant?.donor_name) {
                      try {
                        const { data: grantData, error } = await supabase
                          .from('grants_grid_view')
                          .select('max_workplan_sequence')
                          .eq('grant_id', value)
                          .eq('donor_name', selectedGrant.donor_name)
                          .single()
                        
                        if (!error && grantData) {
                          setSelectedGrantMaxSequence(grantData.max_workplan_sequence || 0)
                        } else {
                          setSelectedGrantMaxSequence(0)
                        }
                      } catch (error) {
                        console.error('Error fetching max workplan sequence:', error)
                        setSelectedGrantMaxSequence(0)
                      }
                    } else {
                      setSelectedGrantMaxSequence(0)
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select Grant" />
                  </SelectTrigger>
                  <SelectContent>
                    {grantsFromGridView.map((grant: any) => (
                      <SelectItem key={`${grant.grant_id}|${grant.donor_name}`} value={grant.grant_id}>
                        {grant.grant_id} - {grant.project_name || grant.grant_id} ({grant.donor_name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Donor</Label>
                <Input
                  value={tempDonorName}
                  disabled
                  className="bg-muted w-full"
                />
              </div>
            </div>

            {/* Row 2: MMYY */}
            <div className="grid grid-cols-1 gap-4">
              <div>
                <Label>MMYY *</Label>
                <Input
                  value={tempMMYY}
                  onChange={(e) => {
                    const newMMYY = e.target.value.replace(/[^0-9]/g, '').slice(0, 4)
                    setTempMMYY(newMMYY)
                  }}
                  placeholder="1224"
                  maxLength={4}
                  className="w-full"
                />
              </div>
            </div>

            {/* Remaining Amounts Display */}
            {(grantRemaining || stateAllocationRemaining) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Grant Remaining */}
                {grantRemaining && (
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-sm font-semibold">Grant Remaining</Label>
                      {grantRemaining.loading && (
                        <span className="text-xs text-muted-foreground">Calculating...</span>
                      )}
                    </div>
                    {!grantRemaining.loading && (
                      <>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Total:</span>
                            <span className="font-medium">${grantRemaining.total.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Committed:</span>
                            <span>${grantRemaining.committed.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Allocated:</span>
                            <span>${grantRemaining.allocated.toLocaleString()}</span>
                          </div>
                          <div className="pt-2 border-t flex justify-between items-center">
                            <span className="font-semibold">Remaining:</span>
                            <span className={`font-bold text-lg ${
                              grantRemaining.remaining < 0 ? 'text-red-600' :
                              grantRemaining.remaining < mouTotalAmount ? 'text-yellow-600' :
                              'text-green-600'
                            }`}>
                              ${grantRemaining.remaining.toLocaleString()}
                            </span>
                          </div>
                          {mouTotalAmount > 0 && (
                            <div className="pt-1 text-xs">
                              <div className="flex justify-between text-muted-foreground">
                                <span>After assignment:</span>
                                <span className={`font-medium ${
                                  (grantRemaining.remaining - mouTotalAmount) < 0 ? 'text-red-600' :
                                  (grantRemaining.remaining - mouTotalAmount) < mouTotalAmount ? 'text-yellow-600' :
                                  'text-green-600'
                                }`}>
                                  ${(grantRemaining.remaining - mouTotalAmount).toLocaleString()}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* State Allocation Remaining */}
                {stateAllocationRemaining && mouProjects.length > 0 && (
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-sm font-semibold">
                        State Allocation Remaining ({mouProjects[0]?.state})
                      </Label>
                      {stateAllocationRemaining.loading && (
                        <span className="text-xs text-muted-foreground">Calculating...</span>
                      )}
                    </div>
                    {!stateAllocationRemaining.loading && (
                      <>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Total:</span>
                            <span className="font-medium">${stateAllocationRemaining.total.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Committed:</span>
                            <span>${stateAllocationRemaining.committed.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Allocated:</span>
                            <span>${stateAllocationRemaining.allocated.toLocaleString()}</span>
                          </div>
                          <div className="pt-2 border-t flex justify-between items-center">
                            <span className="font-semibold">Remaining:</span>
                            <span className={`font-bold text-lg ${
                              stateAllocationRemaining.remaining < 0 ? 'text-red-600' :
                              stateAllocationRemaining.remaining < mouTotalAmount ? 'text-yellow-600' :
                              'text-green-600'
                            }`}>
                              ${stateAllocationRemaining.remaining.toLocaleString()}
                            </span>
                          </div>
                          {mouTotalAmount > 0 && (
                            <div className="pt-1 text-xs">
                              <div className="flex justify-between text-muted-foreground">
                                <span>After assignment:</span>
                                <span className={`font-medium ${
                                  (stateAllocationRemaining.remaining - mouTotalAmount) < 0 ? 'text-red-600' :
                                  (stateAllocationRemaining.remaining - mouTotalAmount) < mouTotalAmount ? 'text-yellow-600' :
                                  'text-green-600'
                                }`}>
                                  ${(stateAllocationRemaining.remaining - mouTotalAmount).toLocaleString()}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* MOU Total Amount Info */}
            {mouTotalAmount > 0 && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-sm">
                  <span className="font-semibold">MOU Total Amount:</span>{' '}
                  <span className="font-mono">${mouTotalAmount.toLocaleString()}</span>
                </p>
              </div>
            )}

            {/* Generated Grant ID Preview */}
            {mouProjects.length > 0 && tempGrantId && tempDonorName && tempMMYY && tempMMYY.length === 4 && (
              <div>
                <Label>Generated Workplan Serial IDs</Label>
                <div className="p-3 bg-muted rounded-md font-mono text-sm max-h-64 overflow-y-auto mt-2">
                  {mouProjects.map((project, idx) => {
                    const stateShort = stateShorts[project.state] || 'XX'
                    const mmyy = tempMMYY
                    
                    // Get donor short name from the grants_grid_view grant
                    const selectedGrant = grantsFromGridView.find((g: any) => g.grant_id === tempGrantId && g.donor_name === tempDonorName)
                    const donorShort = selectedGrant?.donor_id ? (donorShortNames[selectedGrant.donor_id] || 'XXX') : 'XXX'
                    
                    // Get max workplan sequence from grants_grid_view for preview
                    // Start from max_workplan_sequence + 1 for the first project, then increment
                    const workplanNum = selectedGrantMaxSequence + idx + 1
                    
                    // Format: LCC-DonorShort-StateShort-MMYY-WorkplanSeq
                    const generatedSerial = `LCC-${donorShort}-${stateShort}-${mmyy}-${String(workplanNum).padStart(4, '0')}`
                    
                    return (
                      <div key={project.id} className="py-1 border-b border-border/50 last:border-0">
                        <div className="font-semibold">{generatedSerial}</div>
                        <div className="text-xs text-muted-foreground">
                          {project.err_id || project.id.slice(0, 8)} - {project.state} - {project.locality || 'N/A'}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  These are the serial IDs that will be assigned to each work plan in this MOU. Format: LCC-DonorShort-StateShort-MMYY-WorkplanSeq
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setAssignModalOpen(false)
                  setAssigningMouId(null)
                  setTempGrantId('')
                  setTempDonorName('')
                  setTempMMYY('')
                  setMouProjects([])
                  setStateShorts({})
                  setGrantRemaining(null)
                  setStateAllocationRemaining(null)
                  setMouTotalAmount(0)
                  setSelectedGrantMaxSequence(0)
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAssignMou}
                disabled={!tempGrantId || !tempDonorName || !tempMMYY || tempMMYY.length !== 4 || isAssigning}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {isAssigning ? 'Assigning...' : 'Assign to Grant'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}


