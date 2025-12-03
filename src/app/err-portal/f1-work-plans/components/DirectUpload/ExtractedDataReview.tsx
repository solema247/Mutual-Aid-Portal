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
import { CollapsibleRow } from '@/components/ui/collapsible'
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
  category: string | null; // Category (sector) tag for this expense
  planned_activity: string | null; // Planned activity tag for this expense
  planned_activity_other: string | null; // Custom text when "Other" is selected
}

interface PlannedActivity {
  activity: string;
  category: string | null; // Store sector name instead of ID for readability
  individuals: number | null;
  families: number | null;
  planned_activity_cost: number | null;
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
  planned_activities: PlannedActivity[] | string[]; // Support both old (string[]) and new (PlannedActivity[]) formats
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
  const [fileUrl, setFileUrl] = useState<string>('')
  // Pooled selections to be made here (State, Grant Call, MMYY)
  const [pooledStates, setPooledStates] = useState<{ state_name: string; remaining: number }[]>([])
  const [sectors, setSectors] = useState<Array<{ id: string; sector_name_en: string; sector_name_ar: string | null }>>([])
  const [plannedActivities, setPlannedActivities] = useState<Array<{ id: string; activity_name: string; activity_name_ar: string | null; language: string | null }>>([])
  
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

  // Load sectors for sector dropdown
  useEffect(() => {
    const loadSectors = async () => {
      try {
        const { data: sectorsData, error } = await supabase
          .from('sectors')
          .select('id, sector_name_en, sector_name_ar')
          .order('sector_name_en')
        
        if (error) throw error
        setSectors(sectorsData || [])
      } catch (error) {
        console.error('Error loading sectors:', error)
      }
    }
    loadSectors()
  }, [])

  // Load planned activities for dropdown
  useEffect(() => {
    const loadPlannedActivities = async () => {
      try {
        const { data: activitiesData, error } = await supabase
          .from('planned_activities')
          .select('id, activity_name, activity_name_ar, language')
          .order('activity_name')
        
        if (error) throw error
        setPlannedActivities(activitiesData || [])
      } catch (error) {
        console.error('Error loading planned activities:', error)
      }
    }
    loadPlannedActivities()
  }, [])

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

  // Convert old format (string[]) to new format (PlannedActivity[])
  const normalizePlannedActivities = (activities: PlannedActivity[] | string[]): PlannedActivity[] => {
    if (!Array.isArray(activities)) return []
    if (activities.length === 0) return []
    
    // Check if it's already in new format (objects with activity property)
    if (typeof activities[0] === 'object' && activities[0] !== null && 'activity' in activities[0]) {
      // Convert category_id to category if needed (backward compatibility)
      return (activities as any[]).map((activity: any) => {
        // Remove category_id if it exists (we'll convert it in useEffect if needed)
        const { category_id, ...rest } = activity
        // If category_id exists but category doesn't, we'll need to look it up
        if (category_id && !rest.category) {
          rest.category = null // Will be populated in useEffect
        }
        return rest as PlannedActivity
      })
    }
    
    // Convert old format (string[]) to new format
    return (activities as string[]).map(activity => ({
      activity: activity || '',
      category: null,
      individuals: null,
      families: null,
      planned_activity_cost: null
    }))
  }

  const [editedData, setEditedData] = useState<ExtractedData>({
    ...data,
    date: deriveMMYY(data.date),
    planned_activities: normalizePlannedActivities(Array.isArray(data.planned_activities) ? data.planned_activities : []),
    expenses: Array.isArray(data.expenses) ? data.expenses.map(exp => ({
      activity: exp.activity || '',
      total_cost_usd: typeof exp.total_cost_usd === 'number' ? exp.total_cost_usd : 0,
      total_cost_sdg: typeof exp.total_cost_sdg === 'number' ? exp.total_cost_sdg : null,
      currency: exp.currency || 'USD',
      category: (exp as any).category || null,
      planned_activity: (exp as any).planned_activity || null,
      planned_activity_other: (exp as any).planned_activity_other || null
    })) : []
  })

  // Convert category_id to category name for backward compatibility
  useEffect(() => {
    const convertCategoryIds = async () => {
      const activities = editedData.planned_activities as PlannedActivity[]
      const needsConversion = activities.some((a: any) => a.category_id && !a.category)
      
      if (needsConversion && sectors.length > 0) {
        const converted = await Promise.all(activities.map(async (activity: any) => {
          if (activity.category_id && !activity.category) {
            const sector = sectors.find(s => s.id === activity.category_id)
            return {
              ...activity,
              category: sector?.sector_name_en || null,
              category_id: undefined
            }
          }
          const { category_id, ...rest } = activity
          return rest
        }))
        
        setEditedData(prev => ({
          ...prev,
          planned_activities: converted
        }))
      }
    }
    
    if (sectors.length > 0) {
      convertCategoryIds()
    }
  }, [sectors.length])

  // Proposed amount for live preview
  const totalAmount = useMemo(() => editedData.expenses.reduce((s, e) => s + (e.total_cost_usd || 0), 0), [editedData.expenses])

  // Auto-populate planned activities from tagged expenses
  useEffect(() => {
    // Group expenses by unique planned_activity (not category)
    // Use custom "Other" text if specified, otherwise use the activity name
    const activityMap = new Map<string, { activity: string; cost: number }>()
    
    editedData.expenses.forEach((expense) => {
      // Check if expense has a planned activity
      if (expense.planned_activity && expense.planned_activity.trim()) {
        // If it's "Other" and has custom text, use the custom text; otherwise use the activity name
        const plannedActivityLower = expense.planned_activity.toLowerCase()
        const isOther = plannedActivityLower.includes('other') || expense.planned_activity.includes('أخرى')
        
        let activityName: string
        if (isOther && expense.planned_activity_other && expense.planned_activity_other.trim()) {
          // Use custom "Other" text
          activityName = expense.planned_activity_other.trim()
        } else {
          // Use the activity name from dropdown
          activityName = expense.planned_activity.trim()
        }
        
        // Process the activity
        if (activityName) {
          const key = activityName
          const existing = activityMap.get(key)
          if (existing) {
            existing.cost += expense.total_cost_usd || 0
          } else {
            activityMap.set(key, {
              activity: activityName,
              cost: expense.total_cost_usd || 0
            })
          }
        }
      }
    })

    // Convert map to planned activities array
    const autoPlannedActivities: PlannedActivity[] = Array.from(activityMap.values()).map(item => ({
      activity: item.activity,
      category: null, // Category will be set by user in planned activities table
      individuals: null,
      families: null,
      planned_activity_cost: item.cost
    }))

    // Merge with existing planned activities, preserving user-entered category, individuals and families
    const existingActivities = editedData.planned_activities as PlannedActivity[]
    const mergedActivities = autoPlannedActivities.map(autoActivity => {
      // Find existing activity with same activity name
      const existing = existingActivities.find(
        existing => existing.activity === autoActivity.activity
      )
      return {
        ...autoActivity,
        category: existing?.category ?? null, // Preserve user-entered category
        individuals: existing?.individuals ?? null,
        families: existing?.families ?? null
      }
    })

    // Only update if the structure has changed (new activities, removed activities, or cost changes)
    // Compare by checking if all existing activities still exist and costs match
    const needsUpdate = 
      mergedActivities.length !== existingActivities.length ||
      mergedActivities.some(merged => {
        const existing = existingActivities.find(
          e => e.activity === merged.activity
        )
        return !existing || existing.planned_activity_cost !== merged.planned_activity_cost
      }) ||
      existingActivities.some(existing => {
        const merged = mergedActivities.find(
          m => m.activity === existing.activity
        )
        return !merged
      })

    if (needsUpdate) {
      setEditedData(prev => ({
        ...prev,
        planned_activities: mergedActivities.length > 0 ? mergedActivities : []
      }))
    }
  }, [editedData.expenses])

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
    // Note: Auto-population of planned activities happens in useEffect above
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
        <div className="space-y-6">
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
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-2 text-left min-w-[200px]">{t('fsystem:review.fields.activity')}</th>
                    <th className="px-4 py-2 text-left min-w-[180px]">Sector</th>
                    <th className="px-4 py-2 text-left min-w-[120px]">Individuals</th>
                    <th className="px-4 py-2 text-left min-w-[120px]">Families</th>
                    <th className="px-4 py-2 text-left min-w-[150px]">Planned Activity Cost</th>
                    <th className="w-16 px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {(editedData.planned_activities as PlannedActivity[]).map((activity, index) => (
                    <tr key={index} className="border-t">
                      <td className="px-4 py-2">
                        <div className="p-2 bg-muted rounded-md text-sm h-8 flex items-center">
                          {activity.activity || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <Select
                          value={sectors.find(s => s.sector_name_en === activity.category)?.id || undefined}
                          onValueChange={(value) => {
                            const selectedSector = sectors.find(s => s.id === value)
                            const newActivities = [...(editedData.planned_activities as PlannedActivity[])]
                            newActivities[index] = { 
                              ...newActivities[index], 
                              category: selectedSector ? selectedSector.sector_name_en : null 
                            }
                            handleInputChange('planned_activities', newActivities)
                          }}
                        >
                          <SelectTrigger className="h-8 w-full">
                            <SelectValue placeholder="Select sector" />
                          </SelectTrigger>
                          <SelectContent>
                            {sectors.map((sector) => (
                              <SelectItem key={sector.id} value={sector.id}>
                                {sector.sector_name_en} {sector.sector_name_ar && `(${sector.sector_name_ar})`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          type="number"
                          value={activity.individuals || ''}
                          onChange={(e) => {
                            const newActivities = [...(editedData.planned_activities as PlannedActivity[])]
                            newActivities[index] = { 
                              ...newActivities[index], 
                              individuals: e.target.value ? parseInt(e.target.value) : null 
                            }
                            handleInputChange('planned_activities', newActivities)
                          }}
                          className="border-0 focus-visible:ring-0 px-0 py-0 h-8"
                          placeholder="0"
                          min="0"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          type="number"
                          value={activity.families || ''}
                          onChange={(e) => {
                            const newActivities = [...(editedData.planned_activities as PlannedActivity[])]
                            newActivities[index] = { 
                              ...newActivities[index], 
                              families: e.target.value ? parseInt(e.target.value) : null 
                            }
                            handleInputChange('planned_activities', newActivities)
                          }}
                          className="border-0 focus-visible:ring-0 px-0 py-0 h-8"
                          placeholder="0"
                          min="0"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <div className="p-2 bg-muted rounded-md text-sm h-8 flex items-center justify-end font-medium">
                          {activity.planned_activity_cost?.toLocaleString() || '0.00'}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const newActivities = (editedData.planned_activities as PlannedActivity[]).filter((_, i) => i !== index)
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
            </div>
            <div className="p-4 border-t">
              <p className="text-sm text-muted-foreground mb-2">
                Planned activities are automatically populated from tagged expenses. Select Sector and add Individuals and Families for each activity.
              </p>
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
                  <th className="px-4 py-2 text-left">Expenses</th>
                  <th className="px-4 py-2 text-left min-w-[200px]">Planned Activity</th>
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
                        placeholder="Expense description"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <div className="space-y-2">
                        <Select
                          value={plannedActivities.find(pa => pa.activity_name === expense.planned_activity)?.id || undefined}
                          onValueChange={(value) => {
                            const selectedActivity = plannedActivities.find(pa => pa.id === value)
                            const activityName = selectedActivity ? selectedActivity.activity_name : null
                            
                            // Update both fields in a single state update to avoid race conditions
                            const newExpenses = [...editedData.expenses]
                            const isOther = activityName && (activityName.toLowerCase().includes('other') || activityName.includes('أخرى'))
                            
                            newExpenses[index] = {
                              ...newExpenses[index],
                              planned_activity: activityName,
                              planned_activity_other: isOther ? newExpenses[index].planned_activity_other : null
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
                          }}
                        >
                          <SelectTrigger className="h-8 w-full">
                            <SelectValue placeholder="Select planned activity" />
                          </SelectTrigger>
                          <SelectContent>
                            {plannedActivities.map((activity) => (
                              <SelectItem key={activity.id} value={activity.id}>
                                {activity.activity_name} {activity.activity_name_ar && `(${activity.activity_name_ar})`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {/* Show input field when "Other" is selected */}
                        {expense.planned_activity && (
                          (expense.planned_activity.toLowerCase().includes('other') || expense.planned_activity.includes('أخرى')) && (
                            <Input
                              value={expense.planned_activity_other || ''}
                              onChange={(e) => handleExpenseChange(index, 'planned_activity_other', e.target.value)}
                              className="h-8 text-sm"
                              placeholder="Please specify what 'Other' is"
                            />
                          )
                        )}
                      </div>
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
                  <td colSpan={2} className="px-4 py-2 font-medium text-right">{t('fsystem:review.fields.total')}</td>
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
                    { 
                      activity: '', 
                      total_cost_usd: 0, 
                      total_cost_sdg: null, 
                      currency: data.form_currency || 'USD',
                      category: null,
                      planned_activity: null,
                      planned_activity_other: null
                    }
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

        {/* Original File - Collapsible Section */}
        <CollapsibleRow title="Original File" defaultOpen={false}>
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
        </CollapsibleRow>

        {/* OCR Text - Collapsible Section */}
        <CollapsibleRow title="OCR Text" defaultOpen={false}>
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
        </CollapsibleRow>
        </div>
      </CardContent>
    </Card>
  )
}