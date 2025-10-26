'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { supabase } from '@/lib/supabaseClient'

interface AllocationInfo {
  amount: number;
  amountUsed: number;
  stateName: string;
  grantName: string;
}

interface Expense {
  activity: string;
  total_cost_usd: number;
  total_cost_sdg: number | null;
  currency: string;
}

interface ExtractedData {
  date: string | null;
  state: string | null;
  locality: string | null;
  project_objectives: string | null;
  intended_beneficiaries: string | null;
  estimated_beneficiaries: number | null;
  estimated_timeframe: string | null;
  additional_support: string | null;
  banking_details: string | null;
  program_officer_name: string | null;
  program_officer_phone: string | null;
  reporting_officer_name: string | null;
  reporting_officer_phone: string | null;
  finance_officer_name: string | null;
  finance_officer_phone: string | null;
  planned_activities: string[];
  expenses: Expense[];
  language: 'ar' | 'en' | null;
  form_currency?: string;
  exchange_rate?: number;
  raw_ocr?: string;
}

interface ExtractedDataReviewProps {
  data: ExtractedData;
  onConfirm: (editedData: ExtractedData) => void;
  onCancel: () => void;
  allocationInfo?: AllocationInfo;
  onValidationError?: (message: string) => void;
}


export default function ExtractedDataReview({
  data,
  onConfirm,
  onCancel,
  allocationInfo,
  onValidationError,
  selectedState,
  selectedFile,
  tempFileKey
}: ExtractedDataReviewProps & { selectedState?: string; selectedFile?: File | null; tempFileKey?: string }) {
  const { t } = useTranslation(['common', 'fsystem'])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState('form')
  const [fileUrl, setFileUrl] = useState<string>('')
  // Pooled selections to be made here (State, Grant Call, MMYY)
  const [pooledStates, setPooledStates] = useState<{ state_name: string; remaining: number }[]>([])
  
  // Auto-populate state from user's pre-selection
  const getStateNameFromId = async () => {
    if (selectedState) {
      const { data: stateData } = await supabase
        .from('states')
        .select('state_name')
        .eq('id', selectedState)
        .single()
      return stateData?.state_name || ''
    }
    return ''
  }
  
  const [stateName, setStateName] = useState<string>('')
  
  // Auto-set state on mount
  useEffect(() => {
    getStateNameFromId().then(setStateName)
  }, [selectedState])

  // Generate file URL from temp file
  useEffect(() => {
    const generateFileUrl = async () => {
      if (selectedFile) {
        // Create object URL for local file
        const url = URL.createObjectURL(selectedFile)
        setFileUrl(url)
      } else if (tempFileKey) {
        // Get signed URL for temp file in storage
        const { data } = await supabase.storage
          .from('images')
          .createSignedUrl(tempFileKey, 3600)
        if (data?.signedUrl) {
          setFileUrl(data.signedUrl)
        }
      }
    }
    generateFileUrl()
    return () => {
      if (fileUrl && selectedFile) {
        URL.revokeObjectURL(fileUrl)
      }
    }
  }, [selectedFile, tempFileKey])

  const [grantOptions, setGrantOptions] = useState<{ grant_call_id: string; grant_call_name: string; donor_name: string; remaining: number }[]>([])
  const [grantCallId, setGrantCallId] = useState<string>('')
  const deriveMMYY = (value?: string | null) => {
    try {
      if (!value) return ''
      // From full date YYYY-MM-DD → MMYY
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const mm = value.slice(5, 7)
        const yy = value.slice(2, 4)
        return `${mm}${yy}`
      }
      // Already MMYY
      if (/^\d{4}$/.test(value)) return value
      return ''
    } catch { return '' }
  }
  const [yymm, setYymm] = useState<string>(deriveMMYY(data.date))
  const [stateRemaining, setStateRemaining] = useState<number>(0)
  const [grantRemainingForState, setGrantRemainingForState] = useState<number>(0)
  const [donorShort, setDonorShort] = useState<string>('')
  const [stateShort, setStateShort] = useState<string>('')
  const [existingSerials, setExistingSerials] = useState<string[]>([])
  const [selectedSerial, setSelectedSerial] = useState<string>('new')
  const [nextWorkplanPreview, setNextWorkplanPreview] = useState<string>('')
  const [fundingCycles, setFundingCycles] = useState<{ id: string; name: string; type: string; available: number; allocationId: string }[]>([])
  const [selectedFundingCycleId, setSelectedFundingCycleId] = useState<string>('')
  const [cycleStateAllocationId, setCycleStateAllocationId] = useState<string>('')

  // Load pooled state balances
  useEffect(() => {
    const loadStates = async () => {
      try {
        const res = await fetch('/api/pool/by-state')
        const rows = await res.json()
        setPooledStates(Array.isArray(rows) ? rows.map((r: any) => ({ state_name: r.state_name, remaining: r.remaining })) : [])
      } catch (e) {
        console.error('load states error', e)
      }
    }
    loadStates()
  }, [])

  // Load funding cycles filtered by state
  useEffect(() => {
    const loadFundingCycles = async () => {
      if (!stateName) { 
        setFundingCycles([])
        setSelectedFundingCycleId('')
        setCycleStateAllocationId('')
        return 
      }
      try {
        // Get all open funding cycles
        const { data: cycles, error } = await supabase
          .from('funding_cycles')
          .select('id, name, type, status')
          .eq('status', 'open')

        if (error) throw error

        // Get available amounts for each cycle for the selected state
        const cycleOptions = []
        for (const cycle of cycles || []) {
          // Get ALL state allocations for this cycle and state (there can be multiple)
          const { data: allocations, error: allocError } = await supabase
            .from('cycle_state_allocations')
            .select('id, amount')
            .eq('cycle_id', cycle.id)
            .eq('state_name', stateName)

          if (allocError || !allocations || allocations.length === 0) continue

          // Sum all allocations for this cycle and state
          const totalAllocated = allocations.reduce((sum: number, alloc: any) => sum + (alloc.amount || 0), 0)

          // Get committed and pending amounts for ALL allocations in this cycle
          const allocationIds = allocations.map((alloc: any) => alloc.id)
          const { data: projects, error: projError } = await supabase
            .from('err_projects')
            .select('expenses, status, funding_status')
            .in('cycle_state_allocation_id', allocationIds)

          if (projError) continue

          const committed = (projects || [])
            .filter((p: any) => (p.status === 'approved' || p.status === 'active') && p.funding_status === 'committed')
            .reduce((sum: number, p: any) => {
              try {
                const expenses = typeof p.expenses === 'string' ? JSON.parse(p.expenses) : p.expenses
                return sum + expenses.reduce((expSum: number, exp: any) => 
                  expSum + (exp.total_cost || 0), 0)
              } catch {
                return sum
              }
            }, 0)

          const pending = (projects || [])
            .filter((p: any) => p.status === 'pending' && p.funding_status === 'allocated')
            .reduce((sum: number, p: any) => {
              try {
                const expenses = typeof p.expenses === 'string' ? JSON.parse(p.expenses) : p.expenses
                return sum + expenses.reduce((expSum: number, exp: any) => 
                  expSum + (exp.total_cost || 0), 0)
              } catch {
                return sum
              }
            }, 0)

          const available = totalAllocated - committed - pending

          if (available > 0) {
            // Use the first allocation ID for tracking (they're all for the same cycle/state)
            cycleOptions.push({
              id: cycle.id,
              name: cycle.name,
              type: cycle.type,
              available: available,
              allocationId: allocations[0].id
            })
          }
        }

        setFundingCycles(cycleOptions)
      } catch (e) {
        console.error('load funding cycles error', e)
        setFundingCycles([])
      }
    }
    loadFundingCycles()
  }, [stateName])

  // Load grants filtered by state and funding cycle
  useEffect(() => {
    const loadGrants = async () => {
      if (!stateName || !selectedFundingCycleId) { 
        setGrantOptions([])
        setGrantCallId('')
        return 
      }
      try {
        // Get grant calls that are included in the selected funding cycle
        const { data: inclusions, error } = await supabase
          .from('cycle_grant_inclusions')
          .select(`
            grant_call_id,
            grant_calls!inner (
              id,
              name,
              donor_id,
              donors!inner (
                name
              )
            )
          `)
          .eq('cycle_id', selectedFundingCycleId)

        if (error) throw error

        // Get remaining amounts for each grant call for the selected state
        const grantOptions = []
        for (const inclusion of inclusions || []) {
          const grantCall = (inclusion as any).grant_calls
          if (!grantCall) continue

          // Get remaining amount for this grant call and state
          const res = await fetch(`/api/pool/by-grant-for-state?state=${encodeURIComponent(stateName)}`)
          const rows = await res.json()
          const grantRow = (Array.isArray(rows) ? rows : []).find((r: any) => r.grant_call_id === grantCall.id)
          
          if (grantRow && (grantRow.remaining_for_state || 0) > 0) {
            grantOptions.push({
              grant_call_id: grantCall.id,
              grant_call_name: grantCall.name,
              donor_name: grantCall.donors?.name || '-',
              remaining: grantRow.remaining_for_state || 0
            })
          }
        }

        setGrantOptions(grantOptions)
      } catch (e) {
        console.error('load grants error', e)
        setGrantOptions([])
      }
    }
    loadGrants()
  }, [stateName, selectedFundingCycleId])

  // Load remaining caps and preview parts (donorShort/stateShort)
  useEffect(() => {
    const loadCapsAndPreview = async () => {
      try {
        // State remaining
        if (stateName) {
          const stRes = await fetch('/api/pool/by-state')
          const stRows = await stRes.json()
          const stRow = (Array.isArray(stRows) ? stRows : []).find((r: any) => r.state_name === stateName)
          setStateRemaining(stRow ? (stRow.remaining || 0) : 0)
          // state short
          const { data: stShort } = await supabase
            .from('states')
            .select('state_short')
            .eq('state_name', stateName)
            .limit(1)
          setStateShort((stShort as any)?.[0]?.state_short || '')
        } else {
          setStateRemaining(0)
          setStateShort('')
        }
        // Grant remaining for this state and donor short
        if (stateName && grantCallId) {
          const grRes = await fetch(`/api/pool/by-grant-for-state?state=${encodeURIComponent(stateName)}`)
          const grRows = await grRes.json()
          const grRow = (Array.isArray(grRows) ? grRows : []).find((r: any) => r.grant_call_id === grantCallId)
          setGrantRemainingForState(grRow ? (grRow.remaining_for_state || 0) : 0)
          const { data: gc } = await supabase
            .from('grant_calls')
            .select('donor_id')
            .eq('id', grantCallId)
            .single()
          if (gc?.donor_id) {
            const { data: dn } = await supabase
              .from('donors')
              .select('short_name')
              .eq('id', gc.donor_id)
              .single()
            setDonorShort((dn as any)?.short_name || '')
          } else {
            setDonorShort('')
          }
          // Load existing serials for selection when MMYY length is 4
          if (yymm && /^\d{4}$/.test(yymm)) {
            const { data: serialRows } = await supabase
              .from('grant_serials')
              .select('grant_serial')
              .eq('grant_call_id', grantCallId)
              .eq('state_name', stateName)
              .eq('yymm', yymm)
            setExistingSerials((serialRows as any[])?.map(r => r.grant_serial) || [])
          } else {
            setExistingSerials([])
          }
        } else {
          setGrantRemainingForState(0)
          setDonorShort('')
          setExistingSerials([])
        }
      } catch (e) {
        setStateRemaining(0)
        setGrantRemainingForState(0)
        setDonorShort('')
        setStateShort('')
        setExistingSerials([])
      }
    }
    loadCapsAndPreview()
  }, [stateName, grantCallId, yymm])

  // Preview next workplan number for an existing serial
  useEffect(() => {
    const loadNextWorkplan = async () => {
      try {
        if (selectedSerial !== 'new') {
          const { data, error } = await supabase
            .from('grant_workplan_seq')
            .select('last_workplan_number')
            .eq('grant_serial', selectedSerial)
            .single()
          if (!error && data) {
            const next = (data.last_workplan_number || 0) + 1
            setNextWorkplanPreview(String(next).padStart(3, '0'))
          } else {
            setNextWorkplanPreview('')
          }
        } else {
          setNextWorkplanPreview('')
        }
      } catch {
        setNextWorkplanPreview('')
      }
    }
    loadNextWorkplan()
  }, [selectedSerial])

  const [editedData, setEditedData] = useState<ExtractedData>({
    ...data,
    date: deriveMMYY(data.date),
    planned_activities: Array.isArray(data.planned_activities) ? data.planned_activities : [],
    expenses: Array.isArray(data.expenses) ? data.expenses.map(exp => ({
      activity: exp.activity || '',
      total_cost_usd: typeof exp.total_cost_usd === 'number' ? exp.total_cost_usd : 0,
      total_cost_sdg: typeof exp.total_cost_sdg === 'number' ? exp.total_cost_sdg : null,
      currency: exp.currency || 'USD'
    })) : []
  })

  // Proposed amount for live preview
  const totalAmount = useMemo(() => editedData.expenses.reduce((s, e) => s + (e.total_cost_usd || 0), 0), [editedData.expenses])

  useEffect(() => {
    try {
      window.dispatchEvent(new CustomEvent('f1-proposal', { detail: { state: stateName, grant_call_id: grantCallId, amount: totalAmount } }))
    } catch {}
  }, [stateName, grantCallId, totalAmount])

  // Calculate total expenses
  const calculateTotalExpenses = () => {
    return editedData.expenses.reduce((sum, expense) => sum + (expense.total_cost_usd || 0), 0)
  }

  const handleInputChange = (field: keyof ExtractedData, value: any) => {
    setEditedData(prev => ({
      ...prev,
      [field]: field === 'date' ? String(value).replace(/[^0-9]/g, '').slice(0, 4) : value
    }))
  }

  const handleExpenseChange = (index: number, field: keyof Expense, value: any) => {
    const newExpenses = [...editedData.expenses]
    newExpenses[index] = {
      ...newExpenses[index],
      [field]: field === 'total_cost_usd' || field === 'total_cost_sdg' ? Number(value) || 0 : value
    }
    
    // Calculate new total
    const newTotal = newExpenses.reduce((sum, exp) => sum + (exp.total_cost_usd || 0), 0)
    const availableAmount = (allocationInfo?.amount ?? Number.POSITIVE_INFINITY) - (allocationInfo?.amountUsed ?? 0)
    
    // Validate against remaining allocation
    if (newTotal > availableAmount) {
      alert(t('fsystem:review.errors.amount_too_high', {
        remaining: availableAmount.toLocaleString()
      }))
      return
    }
    
    setEditedData(prev => ({
      ...prev,
      expenses: newExpenses
    }))
  }

  const handleConfirm = () => {
    // Only require state selection - other metadata will be set in F2
    if (!stateName) {
      alert('Please select State')
      return
    }
    setIsSubmitting(true)
    // Send only state selection back in the editedData payload
    onConfirm({
      ...editedData,
      // Only attach state metadata - other fields will be set in F2
      _selected_state_name: stateName
    } as any)
  }

  // Calculate total expenses
  const totalAmountCalc = calculateTotalExpenses()
  // No budget validation at this stage - will be handled in F2 approval
  const isOverBudget = false

  return (
    <Card>
       <CardHeader>
         <CardTitle>Review Extracted F1 Form</CardTitle>
         <CardDescription>Review and confirm the extracted information from your F1 workplan</CardDescription>
       </CardHeader>
       <CardContent>
         <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
           <TabsList className="grid w-full grid-cols-3">
             <TabsTrigger value="form">Extracted Form</TabsTrigger>
             <TabsTrigger value="file">Original File</TabsTrigger>
             <TabsTrigger value="ocr">OCR Text</TabsTrigger>
           </TabsList>

           <TabsContent value="form" className="space-y-6 mt-6">
         {/* State Pool Selection - Auto-populated from user's pre-selection */}
         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           <div>
             <Label>State (Pooled)</Label>
             <Select value={stateName} onValueChange={setStateName}>
               <SelectTrigger className="w-full">
                 <SelectValue placeholder="Select State" />
               </SelectTrigger>
               <SelectContent>
                 {pooledStates.map(s => (
                   <SelectItem key={s.state_name} value={s.state_name}>
                     {s.state_name} (Rem: {s.remaining.toLocaleString()})
                   </SelectItem>
                 ))}
               </SelectContent>
             </Select>
           </div>
           <div>
             <Label>F1 Amount</Label>
             <div className="p-2 bg-muted rounded-md text-lg font-medium">
               {totalAmountCalc.toLocaleString()}
             </div>
           </div>
         </div>

        {/* Basic Information */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>{t('fsystem:review.fields.date')} (MMYY)</Label>
            <Input
              value={editedData.date || ''}
              onChange={(e) => handleInputChange('date', e.target.value)}
              placeholder="0825"
              maxLength={4}
            />
          </div>

          <div>
            <Label>{t('fsystem:review.fields.state')}</Label>
            <div className="p-2 bg-muted rounded-md">
              {editedData.state || ''}
            </div>
          </div>

          <div>
            <Label>{t('fsystem:review.fields.locality')}</Label>
            <div className="p-2 bg-muted rounded-md">
              {editedData.locality || ''}
            </div>
          </div>

          <div>
            <Label>{t('fsystem:review.fields.estimated_timeframe')}</Label>
            <Input
              value={editedData.estimated_timeframe || ''}
              onChange={(e) => handleInputChange('estimated_timeframe', e.target.value)}
            />
          </div>

          <div>
            <Label>{t('fsystem:review.fields.estimated_beneficiaries')}</Label>
            <Input
              type="number"
              value={editedData.estimated_beneficiaries || ''}
              onChange={(e) => handleInputChange('estimated_beneficiaries', parseInt(e.target.value))}
            />
          </div>
        </div>

        {/* Full width fields */}
        <div className="space-y-4">
          <div>
            <Label>{t('fsystem:review.fields.project_objectives')}</Label>
            <Textarea
              value={editedData.project_objectives || ''}
              onChange={(e) => handleInputChange('project_objectives', e.target.value)}
              className="min-h-[100px]"
            />
          </div>

          <div>
            <Label>{t('fsystem:review.fields.intended_beneficiaries')}</Label>
            <Textarea
              value={editedData.intended_beneficiaries || ''}
              onChange={(e) => handleInputChange('intended_beneficiaries', e.target.value)}
            />
          </div>
        </div>

        {/* Planned Activities Section */}
        <div>
          <Label className="text-lg font-semibold mb-2">{t('fsystem:review.fields.planned_activities')}</Label>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-2 text-left">{t('fsystem:review.fields.activity')}</th>
                  <th className="w-16 px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {editedData.planned_activities.map((activity, index) => (
                  <tr key={index} className="border-t">
                    <td className="px-4 py-2">
                      <Input
                        value={activity}
                        onChange={(e) => {
                          const newActivities = [...editedData.planned_activities]
                          newActivities[index] = e.target.value
                          handleInputChange('planned_activities', newActivities)
                        }}
                        className="border-0 focus-visible:ring-0 px-0 py-0 h-8"
                      />
                    </td>
                    <td className="px-4 py-2 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const newActivities = editedData.planned_activities.filter((_, i) => i !== index)
                          handleInputChange('planned_activities', newActivities)
                        }}
                        className="h-8 w-8 p-0"
                      >
                        ×
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="p-4 border-t">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  handleInputChange('planned_activities', [
                    ...editedData.planned_activities,
                    ''
                  ])
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                {t('fsystem:review.fields.add_activity')}
              </Button>
            </div>
          </div>
        </div>

        {/* Expenses Section */}
        <div>
          <Label className="text-lg font-semibold mb-2">{t('fsystem:review.fields.expenses')}</Label>
          {data.form_currency && data.exchange_rate && (
            <div className="mb-4 p-3 bg-blue-50 rounded-lg">
              <div className="text-sm text-blue-800">
                <strong>Form Currency:</strong> {data.form_currency} | 
                <strong> Exchange Rate:</strong> 1 USD = {data.exchange_rate} SDG
              </div>
            </div>
          )}
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-2 text-left">{t('fsystem:review.fields.activity')}</th>
                  <th className="px-4 py-2 text-right">USD</th>
                  {data.form_currency === 'SDG' && (
                    <th className="px-4 py-2 text-right">SDG (Original)</th>
                  )}
                  <th className="w-16 px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {editedData.expenses.map((expense, index) => (
                  <tr key={index} className="border-t">
                    <td className="px-4 py-2">
                      <Input
                        value={expense.activity}
                        onChange={(e) => handleExpenseChange(index, 'activity', e.target.value)}
                        className="border-0 focus-visible:ring-0 px-0 py-0 h-8"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Input
                        type="number"
                        value={expense.total_cost_usd}
                        onChange={(e) => handleExpenseChange(index, 'total_cost_usd', parseFloat(e.target.value))}
                        className="border-0 focus-visible:ring-0 px-0 py-0 h-8 text-right"
                      />
                    </td>
                    {data.form_currency === 'SDG' && (
                      <td className="px-4 py-2">
                        <Input
                          type="number"
                          value={expense.total_cost_sdg || ''}
                          onChange={(e) => handleExpenseChange(index, 'total_cost_sdg', parseFloat(e.target.value))}
                          className="border-0 focus-visible:ring-0 px-0 py-0 h-8 text-right"
                        />
                      </td>
                    )}
                    <td className="px-4 py-2 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const newExpenses = editedData.expenses.filter((_, i) => i !== index)
                          handleInputChange('expenses', newExpenses)
                        }}
                        className="h-8 w-8 p-0"
                      >
                        ×
                      </Button>
                    </td>
                  </tr>
                ))}
                <tr className="border-t bg-muted/50">
                  <td className="px-4 py-2 font-medium text-right">{t('fsystem:review.fields.total')}</td>
                  <td className={cn(
                    "px-4 py-2 font-medium text-right",
                    isOverBudget && "text-destructive"
                  )}>
                    {totalAmount.toLocaleString()}
                  </td>
                  {data.form_currency === 'SDG' && (
                    <td className="px-4 py-2 font-medium text-right">
                      {editedData.expenses.reduce((sum, exp) => sum + (exp.total_cost_sdg || 0), 0).toLocaleString()}
                    </td>
                  )}
                  <td></td>
                </tr>
              </tbody>
            </table>
            <div className="p-4 border-t">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  handleInputChange('expenses', [
                    ...editedData.expenses,
                    { activity: '', total_cost_usd: 0, total_cost_sdg: null, currency: data.form_currency || 'USD' }
                  ])
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                {t('fsystem:review.fields.add_expense')}
              </Button>
            </div>
          </div>
        </div>

        {/* Additional Support */}
        <div className="space-y-4">
          <div>
            <Label>{t('fsystem:review.fields.additional_support')}</Label>
            <Textarea
              value={editedData.additional_support || ''}
              onChange={(e) => handleInputChange('additional_support', e.target.value)}
            />
          </div>

          <div>
            <Label>{t('fsystem:review.fields.banking_details')}</Label>
            <Textarea
              value={editedData.banking_details || ''}
              onChange={(e) => handleInputChange('banking_details', e.target.value)}
            />
          </div>
        </div>

        {/* Contact Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-4">
            <div>
              <Label>{t('fsystem:review.fields.officers.program')}</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={editedData.program_officer_name || ''}
                  onChange={(e) => handleInputChange('program_officer_name', e.target.value)}
                  placeholder={t('fsystem:review.fields.officers.name')}
                />
                <Input
                  value={editedData.program_officer_phone || ''}
                  onChange={(e) => handleInputChange('program_officer_phone', e.target.value)}
                  placeholder={t('fsystem:review.fields.officers.phone')}
                />
              </div>
            </div>

            <div>
              <Label>{t('fsystem:review.fields.officers.reporting')}</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={editedData.reporting_officer_name || ''}
                  onChange={(e) => handleInputChange('reporting_officer_name', e.target.value)}
                  placeholder={t('fsystem:review.fields.officers.name')}
                />
                <Input
                  value={editedData.reporting_officer_phone || ''}
                  onChange={(e) => handleInputChange('reporting_officer_phone', e.target.value)}
                  placeholder={t('fsystem:review.fields.officers.phone')}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label>{t('fsystem:review.fields.officers.finance')}</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={editedData.finance_officer_name || ''}
                  onChange={(e) => handleInputChange('finance_officer_name', e.target.value)}
                  placeholder={t('fsystem:review.fields.officers.name')}
                />
                <Input
                  value={editedData.finance_officer_phone || ''}
                  onChange={(e) => handleInputChange('finance_officer_phone', e.target.value)}
                  placeholder={t('fsystem:review.fields.officers.phone')}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-4 mt-8">
          <Button variant="outline" onClick={onCancel}>
            {t('fsystem:review.cancel')}
          </Button>
          <Button 
            onClick={handleConfirm} 
            disabled={isSubmitting || isOverBudget}
            className={cn(
              "bg-green-600 hover:bg-green-700",
              isOverBudget && "bg-destructive hover:bg-destructive/90"
            )}
          >
            {isSubmitting ? t('fsystem:review.submitting') : t('fsystem:review.submit')}
          </Button>
        </div>
      </TabsContent>

      <TabsContent value="file" className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Uploaded File</CardTitle>
          </CardHeader>
          <CardContent>
            {fileUrl ? (
              <div className="w-full h-[600px] border rounded">
                {selectedFile?.type === 'application/pdf' ? (
                  <iframe 
                    src={fileUrl} 
                    className="w-full h-full rounded"
                    title="F1 Workplan PDF"
                  />
                ) : (
                  <img 
                    src={fileUrl} 
                    alt="F1 Workplan" 
                    className="w-full h-full object-contain rounded"
                  />
                )}
              </div>
            ) : (
              <div className="w-full h-[600px] border rounded flex items-center justify-center text-muted-foreground">
                No file preview available
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="ocr" className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>OCR Text</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/30 p-4 rounded font-mono text-sm whitespace-pre-wrap max-h-[600px] overflow-y-auto">
              {data.raw_ocr || 'No OCR text available'}
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
      </CardContent>
    </Card>
  )
}