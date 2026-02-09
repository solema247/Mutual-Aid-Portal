'use client'

import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabaseClient'
import { Plus, Paperclip, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { defaultFormData, type ManualEntryFormData, type Expense, type PlannedActivity } from './types'
import { submitManualEntry } from './submitManualEntry'
import type { State } from '@/app/api/fsystem/types/fsystem'

type RoomRow = {
  id: string
  name: string
  name_ar: string | null
  err_code: string | null
  state?: { state_name?: string; locality?: string | null } | { state_name?: string; locality?: string | null }[]
}

interface ManualEntryProps {
  onSuccess?: () => void
}

export default function ManualEntry({ onSuccess }: ManualEntryProps) {
  const { t } = useTranslation(['common', 'fsystem'])
  const [states, setStates] = useState<State[]>([])
  const [rooms, setRooms] = useState<RoomRow[]>([])
  const [stateId, setStateId] = useState<string>('')
  const [emergencyRoomId, setEmergencyRoomId] = useState<string>('')
  const [grantSegment, setGrantSegment] = useState<string>('')
  const [currency, setCurrency] = useState<'USD' | 'SDG'>('USD')
  const [exchangeRate, setExchangeRate] = useState<number>(2700)
  const [form, setForm] = useState<ManualEntryFormData>({ ...defaultFormData })
  const [sectors, setSectors] = useState<Array<{ id: string; sector_name_en: string; sector_name_ar: string | null }>>([])
  const [plannedActivities, setPlannedActivities] = useState<Array<{ id: string; activity_name: string; activity_name_ar: string | null }>>([])
  const [plannedActivityOverrides, setPlannedActivityOverrides] = useState<Record<string, { category: string | null; individuals: number | null; families: number | null }>>({})
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [tempFileKey, setTempFileKey] = useState<string | null>(null)
  const [isUploadingFile, setIsUploadingFile] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    const fetchStates = async () => {
      try {
        const { data, error } = await supabase
          .from('states')
          .select('id, state_name, state_name_ar, state_short, locality, locality_ar')
          .not('state_name', 'is', null)
          .order('state_name')
        if (error) throw error
        const unique = (data || []).filter((s: any, i: number, arr: any[]) =>
          arr.findIndex((x: any) => x.state_name === s.state_name) === i
        )
        setStates(unique as State[])
      } catch (e) {
        console.error(e)
      }
    }
    fetchStates()
  }, [])

  useEffect(() => {
    if (!stateId) {
      setRooms([])
      setEmergencyRoomId('')
      return
    }
    const selectedState = states.find(s => s.id === stateId)
    if (!selectedState) return
    const fetchRooms = async () => {
      try {
        const { data: stateIds } = await supabase.from('states').select('id').eq('state_name', selectedState.state_name)
        const ids = (stateIds || []).map((s: any) => s.id)
        const { data: roomsData, error } = await supabase
          .from('emergency_rooms')
          .select(`
            id, name, name_ar, err_code,
            state:states!emergency_rooms_state_reference_fkey(state_name, locality)
          `)
          .in('state_reference', ids)
          .eq('status', 'active')
          .order('name')
        if (error) throw error
        setRooms((roomsData as RoomRow[]) || [])
        setEmergencyRoomId('')
      } catch (e) {
        console.error(e)
        setRooms([])
      }
    }
    fetchRooms()
  }, [stateId, states])

  useEffect(() => {
    const load = async () => {
      try {
        const [sectorsRes, activitiesRes] = await Promise.all([
          supabase.from('sectors').select('id, sector_name_en, sector_name_ar').order('sector_name_en'),
          supabase.from('planned_activities').select('id, activity_name, activity_name_ar').order('activity_name')
        ])
        if (sectorsRes.data) setSectors(sectorsRes.data as any[])
        if (activitiesRes.data) setPlannedActivities(activitiesRes.data as any[])
      } catch (e) {
        console.error(e)
      }
    }
    load()
  }, [])

  const selectedRoom = rooms.find(r => r.id === emergencyRoomId)
  const roomState = selectedRoom?.state
  const stateName = Array.isArray(roomState) ? roomState[0]?.state_name : roomState?.state_name
  const locality = Array.isArray(roomState) ? roomState[0]?.locality : roomState?.locality

  useEffect(() => {
    if (stateName !== undefined || locality !== undefined) {
      setForm(prev => ({
        ...prev,
        state: stateName ?? prev.state,
        locality: locality ?? prev.locality
      }))
    }
  }, [stateName, locality])

  // Derive planned activities from expenses during render (dynamic, no lag)
  const plannedActivitiesDisplayed = useMemo(() => {
    const activityMap = new Map<string, { activity: string; cost: number }>()
    form.expenses.forEach((expense) => {
      if (expense.planned_activity && expense.planned_activity.trim()) {
        const plannedActivityLower = expense.planned_activity.toLowerCase()
        const isOther = plannedActivityLower.includes('other') || expense.planned_activity.includes('أخرى')
        const activityName = isOther && expense.planned_activity_other?.trim()
          ? expense.planned_activity_other.trim()
          : expense.planned_activity.trim()
        if (activityName) {
          const existing = activityMap.get(activityName)
          if (existing) {
            existing.cost += expense.total_cost_usd || 0
          } else {
            activityMap.set(activityName, { activity: activityName, cost: expense.total_cost_usd || 0 })
          }
        }
      }
    })
    return Array.from(activityMap.values()).map(item => {
      const override = plannedActivityOverrides[item.activity]
      return {
        activity: item.activity,
        category: override?.category ?? null,
        individuals: override?.individuals ?? null,
        families: override?.families ?? null,
        planned_activity_cost: item.cost
      }
    })
  }, [form.expenses, plannedActivityOverrides])

  const updateField = <K extends keyof ManualEntryFormData>(key: K, value: ManualEntryFormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const handleDateChange = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 4)
    updateField('date', cleaned || null)
  }

  const handleExpenseChange = (index: number, field: keyof Expense, value: any) => {
    const next = [...form.expenses]
    next[index] = { ...next[index], [field]: field === 'total_cost_usd' || field === 'total_cost_sdg' ? (Number(value) || 0) : value }
    updateField('expenses', next)
  }

  const addExpense = () => {
    updateField('expenses', [
      ...form.expenses,
      { activity: '', total_cost_usd: 0, total_cost_sdg: null, currency: currency, category: null, planned_activity: null, planned_activity_other: null }
    ])
  }

  const removeExpense = (index: number) => {
    const next = form.expenses.filter((_, i) => i !== index)
    if (next.length === 0) next.push({ activity: '', total_cost_usd: 0, total_cost_sdg: null, currency: 'USD', category: null, planned_activity: null, planned_activity_other: null })
    updateField('expenses', next)
  }

  const updatePlannedActivity = (activityName: string, field: 'category' | 'individuals' | 'families', value: string | number | null) => {
    setPlannedActivityOverrides(prev => {
      const current = prev[activityName] ?? { category: null, individuals: null, families: null }
      return { ...prev, [activityName]: { ...current, [field]: value } }
    })
  }

  const removePlannedActivityOverride = (activityName: string) => {
    setPlannedActivityOverrides(prev => {
      const next = { ...prev }
      delete next[activityName]
      return next
    })
  }

  const allowedAttachmentTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
  ]

  const getAttachmentExtension = (file: File): string => {
    const name = file.name
    const ext = name.split('.').pop()?.toLowerCase()
    if (ext) return ext
    const mime = file.type
    if (mime === 'image/jpeg') return 'jpg'
    if (mime === 'image/png') return 'png'
    if (mime === 'image/gif') return 'gif'
    if (mime === 'image/webp') return 'webp'
    if (mime === 'application/pdf') return 'pdf'
    if (mime === 'application/msword') return 'doc'
    if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx'
    return 'bin'
  }

  const handleAttachmentChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!allowedAttachmentTypes.includes(file.type)) {
      alert('Please select a PDF, Word document (.doc/.docx), or image (JPEG, PNG, GIF, WebP).')
      e.target.value = ''
      return
    }
    setIsUploadingFile(true)
    try {
      const ext = getAttachmentExtension(file)
      const key = `f1-forms/_incoming/${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage.from('images').upload(key, file, { cacheControl: '3600', upsert: false })
      if (error) {
        console.error('Attachment upload failed:', error)
        alert('Failed to upload file. Please try again.')
        e.target.value = ''
        return
      }
      setTempFileKey(key)
      setAttachmentFile(file)
    } finally {
      setIsUploadingFile(false)
      e.target.value = ''
    }
  }

  const clearAttachment = () => {
    setAttachmentFile(null)
    setTempFileKey(null)
  }

  const totalAmount = form.expenses.reduce((s, e) => s + (e.total_cost_usd || 0), 0)

  const handleSubmit = async () => {
    setValidationError(null)
    if (!stateId || !emergencyRoomId) {
      const msg = 'Please select State and Emergency Room.'
      setValidationError(msg)
      alert(msg)
      return
    }
    if (!stateName) {
      const msg = 'Could not resolve state name from room.'
      setValidationError(msg)
      alert(msg)
      return
    }
    const planned = plannedActivitiesDisplayed
    if (planned.length > 0) {
      const hasIndividuals = planned.some(a => a.individuals != null && a.individuals > 0)
      if (!hasIndividuals) {
        const msg = 'At least one planned activity must have "Individuals" filled in.'
        setValidationError(msg)
        alert(msg)
        return
      }
    }

    setIsSubmitting(true)
    try {
      await submitManualEntry(
        { ...form, planned_activities: plannedActivitiesDisplayed, form_currency: currency, exchange_rate: currency === 'SDG' ? exchangeRate : undefined },
        {
          stateName,
          emergency_room_id: emergencyRoomId,
          err_code: selectedRoom?.err_code ?? null,
          grant_segment: grantSegment || null,
          temp_file_key: tempFileKey
        }
      )
      const successMessage = t('fsystem:review.submit_success')
      alert(successMessage && !successMessage.includes('submit_success') ? successMessage : 'F1 workplan submitted successfully!')
      setForm({ ...defaultFormData })
      setPlannedActivityOverrides({})
      setAttachmentFile(null)
      setTempFileKey(null)
      setStateId('')
      setEmergencyRoomId('')
      setGrantSegment('')
      onSuccess?.()
    } catch (e: any) {
      console.error(e)
      alert(e?.message || 'Failed to submit. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('fsystem:manual_entry.title', { defaultValue: 'Manual F1 Entry' })}</CardTitle>
        <CardDescription>
          {t('fsystem:manual_entry.description', { defaultValue: 'Enter F1 workplan details manually.' })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* State / Room / Grant Segment - same as Direct Upload pre-step */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>{t('fsystem:f1.state')}</Label>
            <Select value={stateId} onValueChange={(v) => { setStateId(v); setEmergencyRoomId('') }}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('fsystem:f1.state')} />
              </SelectTrigger>
              <SelectContent>
                {states.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.state_name}{s.state_name_ar ? ` (${s.state_name_ar})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t('fsystem:f1.emergency_response_room')}</Label>
            <Select value={emergencyRoomId} onValueChange={setEmergencyRoomId} disabled={rooms.length === 0}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('fsystem:f1.select_emergency_room')} />
              </SelectTrigger>
              <SelectContent>
                {rooms.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name_ar || r.name} {r.err_code ? `(${r.err_code})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t('fsystem:f1.grant_segment')}</Label>
            <Select value={grantSegment} onValueChange={setGrantSegment}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('fsystem:f1.select_grant_segment')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Flexible">Flexible</SelectItem>
                <SelectItem value="Sustainability">Sustainability</SelectItem>
                <SelectItem value="WRR">WRR</SelectItem>
                <SelectItem value="Capacity Building">Capacity Building</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Form language (for translation)</Label>
            <Select value={form.language || 'en'} onValueChange={(v) => updateField('language', v as 'ar' | 'en')}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="ar">Arabic (will translate to EN on submit)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Form Currency</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as 'USD' | 'SDG')}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="SDG">SDG</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {currency === 'SDG' && (
              <div>
                <Label>Exchange Rate (USD to SDG)</Label>
                <Input
                  type="number"
                  min={0}
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 0)}
                />
              </div>
            )}
          </div>
        </div>

        {/* Optional attachment (PDF, Word, Image) - same storage as OCR: f1-forms/_incoming */}
        <div className="space-y-2">
          <Label>{t('fsystem:f1.upload_label', { defaultValue: 'Attachment (optional)' })}</Label>
          <p className="text-sm text-muted-foreground">
            PDF, Word (.doc/.docx), or image (JPEG, PNG).
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="file"
              accept=".pdf,.doc,.docx,image/jpeg,image/png,image/gif,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleAttachmentChange}
              disabled={isUploadingFile}
              className="max-w-sm"
            />
            {isUploadingFile && <span className="text-sm text-muted-foreground">Uploading…</span>}
            {attachmentFile && (
              <span className="text-sm text-muted-foreground flex items-center gap-2">
                <Paperclip className="h-4 w-4" />
                {attachmentFile.name}
                <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={clearAttachment} aria-label="Remove attachment">
                  <X className="h-4 w-4" />
                </Button>
              </span>
            )}
          </div>
        </div>

        {validationError && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-sm text-destructive">
            {validationError}
          </div>
        )}

        {/* Form - same layout as ExtractedDataReview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>{t('fsystem:review.fields.date')} (MMYY)</Label>
            <Input
              value={form.date || ''}
              onChange={(e) => handleDateChange(e.target.value)}
              placeholder="0825"
              maxLength={4}
            />
          </div>
          <div>
            <Label>{t('fsystem:review.fields.state')}</Label>
            <div className="p-2 bg-muted rounded-md">{form.state || '-'}</div>
          </div>
          <div>
            <Label>{t('fsystem:review.fields.locality')}</Label>
            <div className="p-2 bg-muted rounded-md">{form.locality || '-'}</div>
          </div>
          <div>
            <Label>{t('fsystem:review.fields.estimated_timeframe')}</Label>
            <Input
              value={form.estimated_timeframe || ''}
              onChange={(e) => updateField('estimated_timeframe', e.target.value)}
            />
          </div>
          <div>
            <Label>{t('fsystem:review.fields.estimated_beneficiaries')}</Label>
            <Input
              type="number"
              value={form.estimated_beneficiaries ?? ''}
              onChange={(e) => updateField('estimated_beneficiaries', e.target.value ? parseInt(e.target.value) : null)}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label>{t('fsystem:review.fields.project_objectives')}</Label>
            <Textarea
              value={form.project_objectives || ''}
              onChange={(e) => updateField('project_objectives', e.target.value)}
              className="min-h-[100px]"
            />
          </div>
          <div>
            <Label>{t('fsystem:review.fields.intended_beneficiaries')}</Label>
            <Textarea
              value={form.intended_beneficiaries || ''}
              onChange={(e) => updateField('intended_beneficiaries', e.target.value)}
            />
          </div>
        </div>

        {/* Planned Activities - auto-populated from expenses when each expense is tagged with a planned activity */}
        <div>
          <Label className="text-lg font-semibold mb-2">{t('fsystem:review.fields.planned_activities')}</Label>
          {validationError && validationError.includes('Individuals') && (
            <div className="mb-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <p className="text-sm text-destructive font-medium">{validationError}</p>
            </div>
          )}
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-2 text-left min-w-[200px]">{t('fsystem:review.fields.activity')}</th>
                    <th className="px-4 py-2 text-left min-w-[180px]">Sector</th>
                    <th className="px-4 py-2 text-left min-w-[120px]">Individuals <span className="text-destructive">*</span></th>
                    <th className="px-4 py-2 text-left min-w-[120px]">Families</th>
                    <th className="px-4 py-2 text-left min-w-[150px]">Planned Activity Cost</th>
                    <th className="w-16 px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {plannedActivitiesDisplayed.map((activity, index) => (
                    <tr key={`${activity.activity}-${index}`} className="border-t">
                      <td className="px-4 py-2">
                        <div className="p-2 bg-muted rounded-md text-sm h-8 flex items-center">
                          {activity.activity || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <Select
                          value={sectors.find(s => s.sector_name_en === activity.category)?.id ?? ''}
                          onValueChange={(v) => updatePlannedActivity(activity.activity, 'category', sectors.find(s => s.id === v)?.sector_name_en ?? null)}
                        >
                          <SelectTrigger className="h-8 w-full">
                            <SelectValue placeholder="Select sector" />
                          </SelectTrigger>
                          <SelectContent>
                            {sectors.map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.sector_name_en} {s.sector_name_ar ? `(${s.sector_name_ar})` : ''}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          type="number"
                          min={0}
                          value={activity.individuals ?? ''}
                          onChange={(e) => {
                            updatePlannedActivity(activity.activity, 'individuals', e.target.value ? parseInt(e.target.value) : null)
                            if (validationError?.includes('Individuals')) setValidationError(null)
                          }}
                          className="border-0 focus-visible:ring-0 px-0 py-0 h-8"
                          placeholder="0"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          type="number"
                          min={0}
                          value={activity.families ?? ''}
                          onChange={(e) => updatePlannedActivity(activity.activity, 'families', e.target.value ? parseInt(e.target.value) : null)}
                          className="border-0 focus-visible:ring-0 px-0 py-0 h-8"
                          placeholder="0"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <div className="p-2 bg-muted rounded-md text-sm h-8 flex items-center justify-end font-medium">
                          {activity.planned_activity_cost?.toLocaleString() ?? '0.00'}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => removePlannedActivityOverride(activity.activity)} aria-label="Clear override">×</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t">
              <p className="text-sm text-muted-foreground mb-2">
                Planned activities are automatically populated from tagged expenses. Tag each expense with a &quot;Planned Activity&quot; below; then select Sector and add Individuals and Families for each activity here.
              </p>
              <p className="text-sm text-muted-foreground">
                <span className="text-destructive font-medium">*</span> At least one activity must have &quot;Individuals&quot; filled in before submission.
              </p>
            </div>
          </div>
        </div>

        {/* Expenses */}
        <div>
          <Label className="text-lg font-semibold mb-2">{t('fsystem:review.fields.expenses')}</Label>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-2 text-left">Expenses</th>
                  <th className="px-4 py-2 text-left min-w-[200px]">Planned Activity</th>
                  <th className="px-4 py-2 text-right">USD</th>
                  {currency === 'SDG' && <th className="px-4 py-2 text-right">SDG</th>}
                  <th className="w-16 px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {form.expenses.map((expense, index) => (
                  <tr key={index} className="border-t">
                    <td className="px-4 py-2">
                      <Input
                        value={expense.activity}
                        onChange={(e) => handleExpenseChange(index, 'activity', e.target.value)}
                        className="h-8"
                        placeholder="Expense description"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Select
                        value={plannedActivities.find(pa => pa.activity_name === expense.planned_activity)?.id ?? ''}
                        onValueChange={(v) => {
                          const name = plannedActivities.find(pa => pa.id === v)?.activity_name ?? null
                          const isOther = name && (name.toLowerCase().includes('other') || name.includes('أخرى'))
                          const next = [...form.expenses]
                          next[index] = {
                            ...next[index],
                            planned_activity: name,
                            planned_activity_other: isOther ? next[index].planned_activity_other : null
                          }
                          updateField('expenses', next)
                        }}
                      >
                        <SelectTrigger className="h-8 w-full">
                          <SelectValue placeholder="Select planned activity" />
                        </SelectTrigger>
                        <SelectContent>
                          {plannedActivities.map((a) => (
                            <SelectItem key={a.id} value={a.id}>{a.activity_name} {a.activity_name_ar ? `(${a.activity_name_ar})` : ''}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {expense.planned_activity && (expense.planned_activity.toLowerCase().includes('other') || expense.planned_activity.includes('أخرى')) && (
                        <Input
                          value={expense.planned_activity_other || ''}
                          onChange={(e) => handleExpenseChange(index, 'planned_activity_other', e.target.value)}
                          className="h-8 mt-1"
                          placeholder="Specify other"
                        />
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <Input
                        type="number"
                        value={expense.total_cost_usd}
                        onChange={(e) => handleExpenseChange(index, 'total_cost_usd', parseFloat(e.target.value))}
                        className="h-8 text-right"
                      />
                    </td>
                    {currency === 'SDG' && (
                      <td className="px-4 py-2">
                        <Input
                          type="number"
                          value={expense.total_cost_sdg ?? ''}
                          onChange={(e) => handleExpenseChange(index, 'total_cost_sdg', e.target.value ? parseFloat(e.target.value) : null)}
                          className="h-8 text-right"
                        />
                      </td>
                    )}
                    <td className="px-4 py-2">
                      <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => removeExpense(index)}>×</Button>
                    </td>
                  </tr>
                ))}
                <tr className="border-t bg-muted/50">
                  <td colSpan={2} className="px-4 py-2 font-medium text-right">Total</td>
                  <td className="px-4 py-2 font-medium text-right">{totalAmount.toLocaleString()}</td>
                  {currency === 'SDG' && (
                    <td className="px-4 py-2 font-medium text-right">
                      {form.expenses.reduce((s, e) => s + (e.total_cost_sdg || 0), 0).toLocaleString()}
                    </td>
                  )}
                  <td></td>
                </tr>
              </tbody>
            </table>
            <div className="p-2 border-t">
              <Button type="button" variant="outline" size="sm" onClick={addExpense}>
                <Plus className="w-4 h-4 mr-2" />
                {t('fsystem:review.fields.add_expense')}
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label>{t('fsystem:review.fields.additional_support')}</Label>
            <Textarea
              value={form.additional_support || ''}
              onChange={(e) => updateField('additional_support', e.target.value)}
            />
          </div>
          <div>
            <Label>{t('fsystem:review.fields.banking_details')}</Label>
            <Textarea
              value={form.banking_details || ''}
              onChange={(e) => updateField('banking_details', e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-4">
            <div>
              <Label>{t('fsystem:review.fields.officers.program')}</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={form.program_officer_name || ''}
                  onChange={(e) => updateField('program_officer_name', e.target.value)}
                  placeholder={t('fsystem:review.fields.officers.name')}
                />
                <Input
                  value={form.program_officer_phone || ''}
                  onChange={(e) => updateField('program_officer_phone', e.target.value)}
                  placeholder={t('fsystem:review.fields.officers.phone')}
                />
              </div>
            </div>
            <div>
              <Label>{t('fsystem:review.fields.officers.reporting')}</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={form.reporting_officer_name || ''}
                  onChange={(e) => updateField('reporting_officer_name', e.target.value)}
                  placeholder={t('fsystem:review.fields.officers.name')}
                />
                <Input
                  value={form.reporting_officer_phone || ''}
                  onChange={(e) => updateField('reporting_officer_phone', e.target.value)}
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
                  value={form.finance_officer_name || ''}
                  onChange={(e) => updateField('finance_officer_name', e.target.value)}
                  placeholder={t('fsystem:review.fields.officers.name')}
                />
                <Input
                  value={form.finance_officer_phone || ''}
                  onChange={(e) => updateField('finance_officer_phone', e.target.value)}
                  placeholder={t('fsystem:review.fields.officers.phone')}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !stateId || !emergencyRoomId}
            className={cn('bg-green-600 hover:bg-green-700')}
          >
            {isSubmitting ? (t('fsystem:review.submitting') || 'Submitting…') : (t('fsystem:review.submit') || 'Submit F1')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
