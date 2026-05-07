'use client'

import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabaseClient'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CollapsibleRow } from '@/components/ui/collapsible'
import { Check, Pencil, Flag } from 'lucide-react'
import type { F5WizardKind, RegionSelection, WizardPageEntry } from '../f5Wizard/types'
import { normalizeWizardPage } from '../f5Wizard/types'
import { buildSnippetFilesFromSelections } from '../f5Wizard/buildSnippetFiles'
import { f5ParseSnips, f5Save, f5UploadInit } from '../f5Wizard/f5WizardApi'
import { useF5WizardViewerPages } from '../f5Wizard/useF5WizardViewerPages'
import { useF5WizardDrag, type WizardDragState } from '../f5Wizard/useF5WizardDrag'
import {
  clampDateInputToToday,
  getTodayDateInputValue,
  isValidReportDate,
  normalizeReportDateInput,
} from '@/lib/reportUploadDate'

interface UploadF5ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  initialProjectId?: string | null
}

export default function UploadF5Modal({ open, onOpenChange, onSaved, initialProjectId }: UploadF5ModalProps) {
  const { t } = useTranslation(['f4f5'])
  
  // Style object to ensure text is selectable in inputs with visible selection
  const selectableInputStyle: React.CSSProperties = {
    userSelect: 'text',
    WebkitUserSelect: 'text',
    MozUserSelect: 'text',
    msUserSelect: 'text',
    cursor: 'text',
  }

  const [states, setStates] = useState<string[]>([])
  const [selectedState, setSelectedState] = useState('')
  const [rooms, setRooms] = useState<Array<{ id: string; label: string }>>([])
  const [selectedRoomId, setSelectedRoomId] = useState('')
  const [projects, setProjects] = useState<Array<{ id: string; label: string }>>([])
  const [projectId, setProjectId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [reportDate, setReportDate] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [step, setStep] = useState<'select'|'wizard'|'preview'>('select')
  const [summaryDraft, setSummaryDraft] = useState<any | null>(null)
  const [reachDraft, setReachDraft] = useState<any[]>([])
  const [tempKey, setTempKey] = useState<string>('')
  const [fileUrl, setFileUrl] = useState<string>('')
  const [wizardLoading, setWizardLoading] = useState<F5WizardKind | null>(null)
  const [wizardKind, setWizardKind] = useState<F5WizardKind>('activities')
  const [wizardProgress, setWizardProgress] = useState<{ activities: boolean; demographics: boolean; questions: boolean }>({
    activities: false,
    demographics: false,
    questions: false,
  })
  const [viewerMode, setViewerMode] = useState<'pdf' | 'image' | 'unsupported'>('unsupported')
  const [wizardPages, setWizardPages] = useState<WizardPageEntry[]>([])
  const [isRenderingPages, setIsRenderingPages] = useState(false)
  const [selectionByKind, setSelectionByKind] = useState<Record<F5WizardKind, RegionSelection[]>>({
    activities: [],
    demographics: [],
    questions: [],
  })
  const [dragging, setDragging] = useState<WizardDragState>(null)
  const [adjustOpen, setAdjustOpen] = useState<{ row: number | null; key: string } | null>(null)
  const [adjustTempValue, setAdjustTempValue] = useState<number | ''>('')
  const [adjustTempNote, setAdjustTempNote] = useState<string>('')
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false)
  const [adjustDialogTitle, setAdjustDialogTitle] = useState<string>('')
  const [minimized, setMinimized] = useState(false)
  const isMinimizingRef = useRef(false)
  const isRestoringRef = useRef(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [entryMode, setEntryMode] = useState<'upload' | 'manual'>('upload')
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const wizardViewerScrollRef = useRef<HTMLDivElement | null>(null)
  const wizardPageWrapRefs = useRef<(HTMLDivElement | null)[]>([])
  const draggingRef = useRef<WizardDragState>(null)
  const wizardKindRef = useRef(wizardKind)
  wizardKindRef.current = wizardKind

  useEffect(() => {
    draggingRef.current = dragging
  }, [dragging])

  const { startDragOnPage } = useF5WizardDrag({
    open,
    step,
    wizardKindRef,
    wizardPageWrapRefs,
    wizardViewerScrollRef,
    draggingRef,
    setDragging,
    setSelectionByKind,
  })

  const keyToOriginal = (row: any, key: string): number => {
    switch (key) {
      case 'individuals': return Number(row.individual_count || 0)
      case 'households': return Number(row.household_count || 0)
      case 'male': return Number(row.male_count || 0)
      case 'female': return Number(row.female_count || 0)
      case 'under18_male': return Number(row.under18_male || 0)
      case 'under18_female': return Number(row.under18_female || 0)
      case 'people_with_disabilities': return Number(row.people_with_disabilities || 0)
      default: return 0
    }
  }

  const keyAdjustedValue = (row: any, key: string): number | undefined => {
    // Handle row-based adjustments
    const obj = row?.adjusted_counts || {}
    const entry = obj ? obj[key] : undefined
    if (entry == null) return undefined
    // support both plain number and object shape { v, note }
    const raw = typeof entry === 'object' && entry !== null && 'v' in entry ? (entry as any).v : entry
    const n = Number(raw)
    return isNaN(n) ? undefined : n
  }

  const keyAdjustedNote = (row: any, key: string): string | undefined => {
    // Handle row-based adjustments
    const obj = row?.adjusted_counts || {}
    const entry = obj ? obj[key] : undefined
    if (entry && typeof entry === 'object' && 'note' in entry) {
      return (entry as any).note || undefined
    }
    return undefined
  }

  const keyEffective = (row: any, key: string): number => {
    const adj = keyAdjustedValue(row, key)
    return adj != null ? Number(adj) : keyToOriginal(row, key)
  }

  const deltaInfo = (row: any, key: string): string => {
    const adj = keyAdjustedValue(row, key)
    if (adj == null) return ''
    const orig = keyToOriginal(row, key)
    const noteForKey = keyAdjustedNote(row, key)
    const note = noteForKey ? `\nNote: ${noteForKey}` : ''
    return `${orig} → ${adj}${note}`
  }

  const openAdjustFor = (rowIdx: number | null, key: string) => {
    if (rowIdx == null) return
    
    const row = reachDraft[rowIdx]
    const current = keyAdjustedValue(row, key)
    const note = keyAdjustedNote(row, key)
    
    setAdjustTempValue(current == null ? '' : Number(current))
    setAdjustTempNote(note || '')
    setAdjustOpen({ row: rowIdx, key })
    const titleMap: Record<string, string> = {
      individuals: 'Adjusted individuals',
      households: 'Adjusted households',
      male: 'Adjusted male',
      female: 'Adjusted female',
      under18_male: 'Adjusted male \u003c 18',
      under18_female: 'Adjusted female \u003c 18',
      people_with_disabilities: 'Adjusted People with Disabilities'
    }
    setAdjustDialogTitle(titleMap[key] || 'Adjustment')
    setAdjustDialogOpen(true)
  }

  const saveAdjust = () => {
    if (!adjustOpen || adjustOpen.row == null) return
    const { row, key } = adjustOpen
    
    // Handle row-based adjustments
    const arr = [...reachDraft]
    const r = { ...(arr[row] || {}) }
    const counts = { ...(r.adjusted_counts || {}) } as any
    if (adjustTempValue === '' || adjustTempValue == null) {
      delete counts[key]
    } else {
      counts[key] = adjustTempNote ? { v: Number(adjustTempValue), note: adjustTempNote } : { v: Number(adjustTempValue) }
    }
    r.adjusted_counts = counts
    arr[row] = r
    setReachDraft(arr)
    
    setAdjustOpen(null)
    setAdjustDialogOpen(false)
  }

  const resetAdjust = () => {
    if (!adjustOpen || adjustOpen.row == null) return
    const { row, key } = adjustOpen
    
    // Handle row-based adjustments
    const arr = [...reachDraft]
    const r = { ...(arr[row] || {}) }
    const counts = { ...(r.adjusted_counts || {}) }
    delete counts[key]
    r.adjusted_counts = counts
    arr[row] = r
    setReachDraft(arr)
    
    setAdjustTempValue('')
    setAdjustOpen(null)
    setAdjustDialogOpen(false)
  }

  useEffect(() => {
    if (!open) return
    ;(async () => {
      const { data } = await supabase
        .from('err_projects')
        .select('state')
        .eq('status', 'active')
      const uniq = Array.from(new Set(((data as any[]) || []).map((r:any)=>r.state).filter(Boolean))) as string[]
      setStates(uniq)
    })()
  }, [open])

  // Try restore from snapshot when opening
  useEffect(() => {
    if (!open) return
    // If opening fresh (not via restore flags), proactively clear any stale snapshot and reset state
    try {
      const sp = (typeof window !== 'undefined') ? new URLSearchParams(window.location.search) : null
      const hasRestoreParam = sp?.get('restore')
      const hasLocalRestore = (typeof window !== 'undefined') ? (window.localStorage.getItem('err_restore') || window.localStorage.getItem('err_minimized_modal')) : null
      if (!hasRestoreParam && !hasLocalRestore) {
        try { window.localStorage.removeItem('err_minimized_payload'); window.dispatchEvent(new CustomEvent('err_minimized_modal_change')) } catch {}
        // Ensure fresh state for new uploads - reset all form fields
        setStep('select')
        setProjectId('')
        setFile(null)
        setReportDate('')
        setSelectedState('')
        setSelectedRoomId('')
        setSummaryDraft(null)
        setReachDraft([])
        setTempKey('')
        setFileUrl('')
        setWizardProgress({ activities: false, demographics: false, questions: false })
        setSelectionByKind({ activities: [], demographics: [], questions: [] })
        setWizardKind('activities')
        setWizardPages([])
        setViewerMode('unsupported')
        setIsRenderingPages(false)
        setEntryMode('upload')
        setAttachmentFile(null)
        return
      }
    } catch {}
    try {
      const raw = window.localStorage.getItem('err_minimized_payload')
      const type = window.localStorage.getItem('err_minimized_modal')
      if (raw && type === 'f5') {
        const p = JSON.parse(raw)
        if (p?.type === 'f5') {
          isRestoringRef.current = true
          setIsRestoring(true)
          if (p.step) {
            setStep(p.step)
            if (p.step === 'wizard') setIsRenderingPages(true)
          }
          if (p.summaryDraft) {
            const sd = { ...p.summaryDraft }
            if (sd.report_date) {
              sd.report_date = clampDateInputToToday(normalizeReportDateInput(sd.report_date))
            }
            setSummaryDraft(sd)
          }
          if (Array.isArray(p.reachDraft)) setReachDraft(p.reachDraft)
          if (p.reportDate) setReportDate(clampDateInputToToday(p.reportDate))
          if (p.selectedState) setSelectedState(p.selectedState)
          if (p.selectedRoomId) setSelectedRoomId(p.selectedRoomId)
          if (p.projectId) setProjectId(p.projectId)
          if (p.tempKey) {
            setTempKey(p.tempKey)
            ;(async () => {
              try {
                const { data: signed } = await supabase.storage.from('images').createSignedUrl(p.tempKey, 3600)
                if (signed?.signedUrl) setFileUrl(signed.signedUrl)
              } catch {}
            })()
          } else if (p.fileUrl) {
            setFileUrl(p.fileUrl)
          }
          // Clear snapshot after restoring and reset restore flag after state updates
          try { window.localStorage.removeItem('err_minimized_modal'); window.localStorage.removeItem('err_minimized_payload'); window.dispatchEvent(new CustomEvent('err_minimized_modal_change')) } catch {}
          // Reset restore flag after a brief delay to allow all state updates to propagate
          setTimeout(() => { 
            isRestoringRef.current = false
            setIsRestoring(false)
          }, 500)
        }
      }
    } catch {}
  }, [open])

  // Auto-select project when initialProjectId is provided
  useEffect(() => {
    if (!open || !initialProjectId) {
      // Ensure projectId is cleared if modal opens without initialProjectId
      if (!isRestoringRef.current) setProjectId('')
      return
    }
    
    // Set projectId immediately to avoid race conditions
    const isHistorical = String(initialProjectId).startsWith('historical_')
    if (isHistorical) {
      setProjectId(initialProjectId)
    } else {
      setProjectId(initialProjectId)
    }
    
    ;(async () => {
      try {
        if (isHistorical) {
          // Load historical project from activities_raw_import
          const realUuid = String(initialProjectId).replace('historical_', '')
          const { data: historicalData, error } = await supabase
            .from('activities_raw_import')
            .select('id, "State", "ERR CODE", "ERR Name"')
            .eq('id', realUuid)
            .single()
          
          if (error || !historicalData) {
            console.error('Failed to load historical project:', error)
            return
          }
          
          setSelectedState(historicalData['State'] || '')
          // projectId already set above
        } else {
          // Load regular portal project
          const { data: projectData, error } = await supabase
            .from('err_projects')
            .select('id, state, emergency_room_id, emergency_rooms (id, name, name_ar, err_code)')
            .eq('id', initialProjectId)
            .eq('status', 'active')
            .single()
          
          if (error || !projectData) {
            console.error('Failed to load portal project:', error)
            return
          }
          
          setSelectedState(projectData.state || '')
          setSelectedRoomId(projectData.emergency_room_id || '')
          // projectId already set above
        }
      } catch (e) {
        console.error('Failed to load initial project', e)
      }
    })()
  }, [open, initialProjectId])

  useEffect(() => {
    if (!selectedState) { 
      if (!isRestoringRef.current) {
        setRooms([]); 
        setSelectedRoomId(''); 
        setProjects([]); 
        setProjectId('')
      }
      return 
    }
    ;(async () => {
      const { data } = await supabase
        .from('err_projects')
        .select('emergency_room_id, emergency_rooms (id, name, name_ar, err_code)')
        .eq('status', 'active')
        .eq('state', selectedState)
      const map = new Map<string, { id: string; label: string }>()
      for (const r of (data as any[]) || []) {
        const room = r.emergency_rooms
        if (room?.id && !map.has(room.id)) {
          const label = room.name || room.name_ar || room.err_code || room.id
          map.set(room.id, { id: room.id, label })
        }
      }
      setRooms(Array.from(map.values()))
      if (!isRestoringRef.current) {
        setSelectedRoomId('')
        setProjects([])
        setProjectId('')
      }
    })()
  }, [selectedState])

  useEffect(() => {
    if (!selectedRoomId) { 
      if (!isRestoringRef.current) {
        setProjects([]); 
        setProjectId('')
      }
      return 
    }
    ;(async () => {
      const { data } = await supabase
        .from('err_projects')
        .select('id, project_name, submitted_at, locality, planned_activities, expenses')
        .eq('status', 'active')
        .eq('emergency_room_id', selectedRoomId)
        .or('f5_status.is.null,f5_status.neq.completed')
        .order('submitted_at', { ascending: false })
      setProjects(((data as any[]) || []).map((p:any)=> {
        // Extract category from first planned activity
        let category = ''
        try {
          const plannedArr = Array.isArray(p.planned_activities)
            ? p.planned_activities
            : (typeof p.planned_activities === 'string' ? JSON.parse(p.planned_activities || '[]') : [])
          if (Array.isArray(plannedArr) && plannedArr.length > 0 && plannedArr[0]?.category) {
            category = plannedArr[0].category
          }
        } catch {}
        
        // Calculate total from planned_activities (for ERR App submissions)
        let fromPlanned = 0
        try {
          const plannedArr = Array.isArray(p.planned_activities)
            ? p.planned_activities
            : (typeof p.planned_activities === 'string' ? JSON.parse(p.planned_activities || '[]') : [])
          fromPlanned = (Array.isArray(plannedArr) ? plannedArr : []).reduce((s: number, pa: any) => {
            const inner = Array.isArray(pa?.expenses) ? pa.expenses : []
            return s + inner.reduce((ss: number, ie: any) => ss + (Number(ie.total) || 0), 0)
          }, 0)
        } catch {}
        
        // Calculate total from expenses (for mutual_aid_portal submissions)
        let fromExpenses = 0
        try {
          const expensesArr = Array.isArray(p.expenses)
            ? p.expenses
            : (typeof p.expenses === 'string' ? JSON.parse(p.expenses || '[]') : [])
          fromExpenses = (Array.isArray(expensesArr) ? expensesArr : []).reduce((s: number, ex: any) => {
            return s + (Number(ex.total_cost) || 0)
          }, 0)
        } catch {}
        
        // Use expenses total if it exists (mutual_aid_portal), otherwise use planned_activities total (ERR App)
        const total = fromExpenses > 0 ? fromExpenses : fromPlanned
        
        const locality = p.locality || ''
        const totalFormatted = total > 0 ? ` (${total.toLocaleString()})` : ''
        const label = category 
          ? `${locality} - ${category}${totalFormatted}` 
          : (locality ? `${locality}${totalFormatted}` : (p.project_name || p.id))
        return { id: p.id, label }
      }))
    })()
  }, [selectedRoomId])

  const handleUploadAndParse = async () => {
    const actualProjectId = projectId || initialProjectId
    if (!actualProjectId || !file) return
    if (!isValidReportDate(reportDate)) {
      alert(t('f5.modal.report_date_required'))
      return
    }
    setIsLoading(true)
    try {
      const ext = (file.name.split('.').pop() || 'pdf').toLowerCase()
      const { file_key_temp: key } = await f5UploadInit(actualProjectId, ext)
      setTempKey(key)
      const { error: upErr } = await supabase.storage.from('images').upload(key, file, { upsert: true })
      if (upErr) throw upErr

      // Get signed URL for file viewing
      const { data: signedUrl } = await supabase.storage.from('images').createSignedUrl(key, 3600)
      if (signedUrl?.signedUrl) {
        setFileUrl(signedUrl.signedUrl)
      }

      setSummaryDraft((prev:any) => ({
        ...(prev || {}),
        report_date: reportDate || prev?.report_date || '',
        reporting_person: prev?.reporting_person || '',
        positive_changes: prev?.positive_changes || '',
        negative_results: prev?.negative_results || '',
        unexpected_results: prev?.unexpected_results || '',
        lessons_learned: prev?.lessons_learned || '',
        suggestions: prev?.suggestions || '',
      }))
      setReachDraft([])
      setWizardProgress({ activities: false, demographics: false, questions: false })
      setSelectionByKind({ activities: [], demographics: [], questions: [] })
      setWizardKind('activities')
      setIsRenderingPages(true)
      setStep('wizard')
    } catch (e) {
      console.error(e)
      alert('Failed to process file')
    } finally {
      setIsLoading(false)
    }
  }

  useF5WizardViewerPages({
    step,
    fileUrl,
    file,
    tempKey,
    setViewerMode,
    setWizardPages,
    setIsRenderingPages,
  })

  const expectedWizardKind: F5WizardKind =
    !wizardProgress.activities ? 'activities' : !wizardProgress.demographics ? 'demographics' : 'questions'

  useEffect(() => {
    if (wizardKind !== expectedWizardKind) setWizardKind(expectedWizardKind)
  }, [expectedWizardKind, wizardKind])

  const normalizeActivityName = (value: unknown) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')

  const mergeDemographicsIntoReach = (incoming: any[]) => {
    setReachDraft((prev) => {
      const next = [...prev]
      for (let i = 0; i < incoming.length; i++) {
        const row = incoming[i] || {}
        const targetName = normalizeActivityName(row.activity_name)
        let idx = targetName ? next.findIndex((r: any) => normalizeActivityName(r?.activity_name) === targetName) : -1
        if (idx < 0 && i < next.length) idx = i
        if (idx < 0) {
          next.push({
            activity_name: row.activity_name ? String(row.activity_name) : '',
            activity_goal: '',
            location: '',
            start_date: '',
            end_date: '',
            individual_count: null,
            household_count: null,
            male_count: row.male_count ?? null,
            female_count: row.female_count ?? null,
            under18_male: row.under18_male ?? null,
            under18_female: row.under18_female ?? null,
            people_with_disabilities: row.people_with_disabilities ?? null,
            is_draft: true,
          })
          continue
        }
        const existing = next[idx] || {}
        next[idx] = {
          ...existing,
          male_count: row.male_count ?? existing.male_count ?? null,
          female_count: row.female_count ?? existing.female_count ?? null,
          under18_male: row.under18_male ?? existing.under18_male ?? null,
          under18_female: row.under18_female ?? existing.under18_female ?? null,
          people_with_disabilities: row.people_with_disabilities ?? existing.people_with_disabilities ?? null,
        }
      }
      return next
    })
  }

  const parseSnips = async (kind: F5WizardKind, overrideFiles?: File[]) => {
    const actualProjectId = projectId || initialProjectId
    if (!actualProjectId) return
    if (kind !== expectedWizardKind) {
      alert(`Please complete the ${expectedWizardKind} step first.`)
      return
    }
    const files = overrideFiles || []
    if (!files.length) {
      alert('Please highlight at least one region first.')
      return
    }
    setWizardLoading(kind)
    try {
      const form = new FormData()
      form.append('kind', kind)
      form.append('project_id', String(actualProjectId))
      files.forEach((f) => form.append('files', f))
      const json = (await f5ParseSnips(form)) as Record<string, unknown>

      if (kind === 'activities') {
        const rows = Array.isArray(json.reach) ? json.reach : []
        setReachDraft(rows.map((r: any) => ({
          activity_name: r.activity_name != null ? String(r.activity_name) : '',
          activity_goal: r.activity_goal != null ? String(r.activity_goal) : '',
          location: r.location != null ? String(r.location) : '',
          start_date: r.start_date != null ? String(r.start_date) : '',
          end_date: r.end_date != null ? String(r.end_date) : '',
          individual_count: r.individual_count != null ? Number(r.individual_count) : null,
          household_count: r.household_count != null ? Number(r.household_count) : null,
          male_count: null,
          female_count: null,
          under18_male: null,
          under18_female: null,
          people_with_disabilities: null,
          is_draft: true,
        })))
        setWizardProgress(prev => ({ ...prev, activities: true }))
        setWizardKind('demographics')
      } else if (kind === 'demographics') {
        const rows = Array.isArray(json.reach) ? json.reach : []
        mergeDemographicsIntoReach(rows as any[])
        setWizardProgress(prev => ({ ...prev, demographics: true }))
        setWizardKind('questions')
      } else {
        setSummaryDraft((prev: any) => ({
          ...(prev || {}),
          positive_changes: json.positive_changes ?? prev?.positive_changes ?? '',
          negative_results: json.negative_results ?? prev?.negative_results ?? '',
          unexpected_results: json.unexpected_results ?? prev?.unexpected_results ?? '',
          lessons_learned: json.lessons_learned ?? prev?.lessons_learned ?? '',
          suggestions: json.suggestions ?? prev?.suggestions ?? '',
          reporting_person: json.reporting_person ?? prev?.reporting_person ?? '',
        }))
        setWizardProgress(prev => ({ ...prev, questions: true }))
      }
    } catch (e) {
      console.error('[F5 wizard] snippet parse failed', e)
      alert('Failed to parse snippet files')
    } finally {
      setWizardLoading(null)
    }
  }

  const runWizardStep = async (kind: F5WizardKind) => {
    const files = await buildSnippetFilesFromSelections(kind, wizardPages, selectionByKind[kind] ?? [])
    await parseSnips(kind, files)
  }

  const handleContinueToForm = async () => {
    const actualProjectId = projectId || initialProjectId
    if (!actualProjectId) return
    if (!isValidReportDate(reportDate)) {
      alert(t('f5.modal.report_date_required'))
      return
    }
    setIsLoading(true)
    try {
      if (attachmentFile) {
        const ext = (attachmentFile.name.split('.').pop() || 'pdf').toLowerCase()
        const { file_key_temp: key } = await f5UploadInit(actualProjectId, ext)
        const { error: upErr } = await supabase.storage.from('images').upload(key, attachmentFile, { upsert: true })
        if (upErr) throw upErr
        setTempKey(key)
      } else {
        setTempKey('')
      }
      setSummaryDraft({
        report_date: reportDate || '',
        reporting_person: '',
        positive_changes: '',
        negative_results: '',
        unexpected_results: '',
        lessons_learned: '',
        suggestions: ''
      })
      setReachDraft([{
        activity_name: '',
        activity_goal: '',
        location: '',
        start_date: '',
        end_date: '',
        individual_count: null,
        household_count: null,
        male_count: null,
        female_count: null,
        under18_male: null,
        under18_female: null,
        people_with_disabilities: null,
        is_draft: true
      }])
      setStep('preview')
    } catch (e) {
      console.error(e)
      alert('Failed to continue')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    if (isRestoring || isRestoringRef.current) {
      console.warn('Cannot save while restoring state')
      return
    }
    const actualProjectId = projectId || initialProjectId
    if (!actualProjectId || !summaryDraft) {
      console.warn('Missing required fields:', { projectId: actualProjectId, hasSummaryDraft: !!summaryDraft })
      return
    }
    const previewDate = normalizeReportDateInput(summaryDraft?.report_date ?? reportDate)
    if (!isValidReportDate(previewDate)) {
      alert(t('f5.modal.report_date_required'))
      return
    }
    setIsLoading(true)
    try {
      const summaryToSave = { ...summaryDraft }
      await f5Save({ project_id: actualProjectId, summary: summaryToSave, reach: reachDraft, file_key_temp: tempKey })
      try { window.localStorage.removeItem('err_minimized_modal') } catch {}
      onOpenChange(false)
      onSaved()
    } catch (e) {
      console.error(e)
      alert('Failed to save F5')
    } finally {
      setIsLoading(false)
    }
  }

  const reset = () => {
    setProjectId('')
    setFile(null)
    setReportDate('')
    setSelectedState('')
    setSelectedRoomId('')
    setSummaryDraft(null)
    setReachDraft([])
    setStep('select')
    setTempKey('')
    setFileUrl('')
    setWizardProgress({ activities: false, demographics: false, questions: false })
    setSelectionByKind({ activities: [], demographics: [], questions: [] })
    setWizardKind('activities')
    setWizardPages([])
    setViewerMode('unsupported')
    setIsRenderingPages(false)
    setEntryMode('upload')
    setAttachmentFile(null)
  }

  const reportDateInputMax = getTodayDateInputValue()
  const isSelectReportDateValid = isValidReportDate(reportDate)
  const effectivePreviewReportDate = normalizeReportDateInput(summaryDraft?.report_date ?? reportDate)
  const isPreviewReportDateValid = isValidReportDate(effectivePreviewReportDate)

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { 
      onOpenChange(v); 
      if (!v) {
        if (isMinimizingRef.current) {
          // Close caused by minimize path, keep snapshot/minimized bar
          isMinimizingRef.current = false
        } else {
          // Explicit close (X or cancel) -> clear minimized state and snapshot
          try { 
            window.localStorage.removeItem('err_minimized_modal'); 
            window.localStorage.removeItem('err_minimized_payload'); 
            window.dispatchEvent(new CustomEvent('err_minimized_modal_change')) 
          } catch {}
          // Also reset local modal state to pre-processing defaults - reset all form fields
          setStep('select')
          setProjectId('')
          setFile(null)
          setReportDate('')
          setSelectedState('')
          setSelectedRoomId('')
          setSummaryDraft(null)
          setReachDraft([])
          setTempKey('')
          setFileUrl('')
          setWizardProgress({ activities: false, demographics: false, questions: false })
          setSelectionByKind({ activities: [], demographics: [], questions: [] })
          setWizardKind('activities')
          setWizardPages([])
          setViewerMode('unsupported')
          setIsRenderingPages(false)
          setEntryMode('upload')
          setAttachmentFile(null)
        }
      }
    }}>
      <DialogContent 
        className="max-w-7xl w-[95vw] max-h-[85vh] overflow-y-auto select-text"
        onInteractOutside={(e:any)=>{ 
          // If the adjustment dialog is open, don't minimize; keep parent modal active
          if (adjustDialogOpen) { e.preventDefault(); return }
          e.preventDefault(); 
          try {
            const snapshot = JSON.stringify({ type: 'f5', step, summaryDraft, reachDraft, reportDate, selectedState, selectedRoomId, projectId, tempKey, fileUrl })
            window.localStorage.setItem('err_minimized_modal','f5')
            window.localStorage.setItem('err_minimized_payload', snapshot)
            window.dispatchEvent(new CustomEvent('err_minimized_modal_change', { detail: 'f5' } as any))
          } catch {}
          isMinimizingRef.current = true
          onOpenChange(false) 
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('f5.modal.title')}</DialogTitle>
        </DialogHeader>
        {step === 'select' && !initialProjectId ? (
          <div className="space-y-4">
            <div className="flex gap-2 p-1 rounded-lg border bg-muted/30 w-fit">
              <Button type="button" variant={entryMode === 'upload' ? 'default' : 'ghost'} size="sm" onClick={() => setEntryMode('upload')}>{t('f5.modal.entry_mode_upload')}</Button>
              <Button type="button" variant={entryMode === 'manual' ? 'default' : 'ghost'} size="sm" onClick={() => setEntryMode('manual')}>{t('f5.modal.entry_mode_manual')}</Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>{t('f5.modal.state')}</Label>
                <Select value={selectedState} onValueChange={(v)=>{ setSelectedState(v); }}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t('f5.modal.state_placeholder') as string} /></SelectTrigger>
                  <SelectContent>
                    {states.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t('f5.modal.err')}</Label>
                <Select value={selectedRoomId} onValueChange={(v)=>{ setSelectedRoomId(v); }} disabled={!selectedState}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t('f5.modal.err_placeholder') as string} /></SelectTrigger>
                  <SelectContent>
                    {rooms.map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t('f5.modal.project')}</Label>
                <Select value={projectId} onValueChange={setProjectId} disabled={!selectedRoomId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t('f5.modal.project_placeholder') as string} /></SelectTrigger>
                  <SelectContent>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>{t('f5.modal.report_date')} *</Label>
              <Input
                type="date"
                max={reportDateInputMax}
                value={reportDate}
                onChange={(e) => setReportDate(clampDateInputToToday(e.target.value))}
                required
              />
            </div>
            {entryMode === 'upload' ? (
              <>
                <div className="space-y-1">
                  <Label>{t('f5.modal.report_file')}</Label>
                  <Input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                  <div className="text-xs text-muted-foreground">{t('f5.modal.choose_file_hint')}</div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>{t('f5.modal.cancel')}</Button>
                  <Button onClick={handleUploadAndParse} disabled={!projectId || !file || isLoading || !isSelectReportDateValid}>{isLoading ? 'Processing…' : t('f5.modal.process')}</Button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <Label>{t('f5.modal.attachment_optional')}</Label>
                  <Input type="file" accept=".pdf,image/*" onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)} />
                  {attachmentFile && <span className="text-xs text-muted-foreground">{attachmentFile.name}</span>}
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>{t('f5.modal.cancel')}</Button>
                  <Button onClick={handleContinueToForm} disabled={!projectId || isLoading || !isSelectReportDateValid}>{isLoading ? '…' : t('f5.modal.continue_to_form')}</Button>
                </div>
              </>
            )}
          </div>
        ) : (
          // When project is pre-selected (from project management), show simplified file upload form
          step === 'select' && initialProjectId ? (
            <div className="space-y-4">
              <div className="flex gap-2 p-1 rounded-lg border bg-muted/30 w-fit">
                <Button type="button" variant={entryMode === 'upload' ? 'default' : 'ghost'} size="sm" onClick={() => setEntryMode('upload')}>{t('f5.modal.entry_mode_upload')}</Button>
                <Button type="button" variant={entryMode === 'manual' ? 'default' : 'ghost'} size="sm" onClick={() => setEntryMode('manual')}>{t('f5.modal.entry_mode_manual')}</Button>
              </div>
              <div className="space-y-1">
                <Label>{t('f5.modal.report_date')} *</Label>
                <Input
                  type="date"
                  max={reportDateInputMax}
                  value={reportDate}
                  onChange={(e) => setReportDate(clampDateInputToToday(e.target.value))}
                  required
                />
              </div>
              {entryMode === 'upload' ? (
                <>
                  <div className="space-y-1">
                    <Label>{t('f5.modal.report_file')}</Label>
                    <Input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                    <div className="text-xs text-muted-foreground">{t('f5.modal.choose_file_hint')}</div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>{t('f5.modal.cancel')}</Button>
                    <Button onClick={handleUploadAndParse} disabled={(!projectId && !initialProjectId) || !file || isLoading || !isSelectReportDateValid}>{isLoading ? 'Processing…' : t('f5.modal.process')}</Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <Label>{t('f5.modal.attachment_optional')}</Label>
                    <Input type="file" accept=".pdf,image/*" onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)} />
                    {attachmentFile && <span className="text-xs text-muted-foreground">{attachmentFile.name}</span>}
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>{t('f5.modal.cancel')}</Button>
                    <Button onClick={handleContinueToForm} disabled={(!projectId && !initialProjectId) || isLoading || !isSelectReportDateValid}>{isLoading ? '…' : t('f5.modal.continue_to_form')}</Button>
                  </div>
                </>
              )}
            </div>
          ) : step === 'wizard' ? (
            <div className="flex flex-col gap-2 min-h-0 max-h-[82vh]">
              <div className="sticky top-0 z-30 shrink-0 rounded-md border bg-background/95 px-2 py-1.5 shadow-sm supports-[backdrop-filter]:backdrop-blur-sm">
                <p className="text-[11px] leading-snug text-muted-foreground pb-1.5 border-b border-border/70 mb-1.5">
                  Highlight a section directly on the document viewer, then run extraction for this step.
                </p>
                <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
                  <div className="flex items-center gap-1 shrink-0">
                    <span className={`inline-flex h-7 items-center gap-0.5 rounded border px-1.5 text-[11px] leading-none ${wizardProgress.activities ? 'bg-green-50 border-green-300 text-green-800' : expectedWizardKind === 'activities' ? 'bg-sky-50 border-sky-300 text-sky-800' : 'bg-muted/30 text-muted-foreground'}`}>
                      1) Activities
                      {wizardProgress.activities && <Check className="h-3.5 w-3.5 shrink-0 text-green-700" strokeWidth={2.5} aria-hidden />}
                    </span>
                    <span className={`inline-flex h-7 items-center gap-0.5 rounded border px-1.5 text-[11px] leading-none ${wizardProgress.demographics ? 'bg-green-50 border-green-300 text-green-800' : expectedWizardKind === 'demographics' ? 'bg-sky-50 border-sky-300 text-sky-800' : 'bg-muted/30 text-muted-foreground'}`}>
                      2) Demographics
                      {wizardProgress.demographics && <Check className="h-3.5 w-3.5 shrink-0 text-green-700" strokeWidth={2.5} aria-hidden />}
                    </span>
                    <span className={`inline-flex h-7 items-center gap-0.5 rounded border px-1.5 text-[11px] leading-none ${wizardProgress.questions ? 'bg-green-50 border-green-300 text-green-800' : expectedWizardKind === 'questions' ? 'bg-sky-50 border-sky-300 text-sky-800' : 'bg-muted/30 text-muted-foreground'}`}>
                      3) Questions
                      {wizardProgress.questions && <Check className="h-3.5 w-3.5 shrink-0 text-green-700" strokeWidth={2.5} aria-hidden />}
                    </span>
                  </div>
                  <span className="text-[11px] leading-tight text-muted-foreground whitespace-nowrap shrink-0">
                    · Draw on one or more pages · Step <strong className="font-semibold text-foreground">{expectedWizardKind}</strong> · {selectionByKind[expectedWizardKind].length} selection(s)
                  </span>
                  <div className="flex-1 min-w-[8px] shrink" aria-hidden />
                  <div className="flex flex-nowrap items-center gap-1.5 shrink-0">
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 px-2.5 text-[11px]"
                      onClick={() => runWizardStep(expectedWizardKind)}
                      disabled={wizardLoading != null || selectionByKind[expectedWizardKind].length === 0}
                    >
                      {wizardLoading === expectedWizardKind ? 'Processing…' : `Process ${expectedWizardKind}`}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2.5 text-[11px]"
                      onClick={() => setSelectionByKind(prev => ({ ...prev, [expectedWizardKind]: [] }))}
                      disabled={wizardLoading != null || selectionByKind[expectedWizardKind].length === 0}
                    >
                      Clear current step selections
                    </Button>
                    {expectedWizardKind === 'activities' && (
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">Rows: {reachDraft.length}</span>
                    )}
                  </div>
                </div>
              </div>

              {viewerMode === 'unsupported' && !isRenderingPages && (
                <div className="shrink-0 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
                  This file type cannot be rendered for in-modal selection yet. Please use PDF or image files for guided snip/highlight extraction.
                </div>
              )}

              <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border">
                <CardHeader className="shrink-0 py-2 pb-1.5">
                  <CardTitle className="text-sm font-semibold">Document viewer — drag to select regions</CardTitle>
                </CardHeader>
                <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0 px-6 pb-6 pt-0">
                  <div ref={wizardViewerScrollRef} className="min-h-0 flex-1 overflow-auto pr-1">
                    {isRenderingPages ? (
                      <div className="w-full min-h-[280px] border rounded flex items-center justify-center text-muted-foreground text-sm">Rendering document pages…</div>
                    ) : wizardPages.length > 0 ? (
                      <div className="space-y-4 pb-2">
                        {wizardPages.map((raw, pageIndex) => {
                          const page = normalizeWizardPage(raw)
                          if (!page?.dataUrl) return null
                          const keySuffix = page.dataUrl.length > 32 ? page.dataUrl.slice(0, 32) : page.dataUrl
                          return (
                            <div
                              key={`${pageIndex}-${keySuffix}`}
                              className="mx-auto w-fit max-w-full border rounded overflow-hidden bg-white"
                            >
                              <div
                                ref={(el) => {
                                  wizardPageWrapRefs.current[pageIndex] = el
                                }}
                                className="relative inline-block max-w-full select-none touch-none"
                                onMouseDown={(e) => startDragOnPage(pageIndex, e)}
                              >
                                <img
                                  src={page.dataUrl}
                                  alt={`Page ${pageIndex + 1}`}
                                  width={page.displayWidth || undefined}
                                  height={page.displayHeight || undefined}
                                  className="max-w-full h-auto w-auto select-none pointer-events-none block"
                                  style={{
                                    width: page.displayWidth ? `${page.displayWidth}px` : undefined,
                                    maxWidth: '100%',
                                    height: 'auto',
                                  }}
                                />
                                {selectionByKind[expectedWizardKind]
                                  .filter(s => s.pageIndex === pageIndex)
                                  .map((s, idx) => (
                                    <div
                                      key={`sel-${expectedWizardKind}-${pageIndex}-${idx}`}
                                      className="absolute border-2 border-sky-500 bg-sky-300/15 pointer-events-none"
                                      style={{ left: s.x, top: s.y, width: s.w, height: s.h }}
                                    />
                                  ))}
                                {dragging && dragging.pageIndex === pageIndex && (
                                  <div
                                    className="absolute border-2 border-orange-500 bg-orange-300/20 pointer-events-none"
                                    style={{
                                      left: Math.min(dragging.sx, dragging.cx),
                                      top: Math.min(dragging.sy, dragging.cy),
                                      width: Math.abs(dragging.cx - dragging.sx),
                                      height: Math.abs(dragging.cy - dragging.sy),
                                    }}
                                  />
                                )}
                                <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded pointer-events-none">
                                  Page {pageIndex + 1}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="w-full h-[400px] border rounded flex items-center justify-center text-muted-foreground">
                        No renderable pages available
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <div className="shrink-0 flex justify-between border-t pt-3">
                <Button variant="outline" onClick={() => setStep('select')} disabled={!!initialProjectId || wizardLoading != null}>Back</Button>
                <Button onClick={() => setStep('preview')} disabled={wizardLoading != null || !wizardProgress.activities || !wizardProgress.demographics || !wizardProgress.questions || !isSelectReportDateValid}>
                  Continue to preview
                </Button>
              </div>
            </div>
          ) : step === 'preview' ? (
            <div className="space-y-4">
              {/* Edit Form - Collapsible Section */}
            <CollapsibleRow title={t('f5.preview.tabs.edit_form')} defaultOpen={true}>
              <div className="space-y-6 select-text">
            {/* Summary */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="select-text" style={{ userSelect: 'text' }}>{t('f5.preview.summary.report_date')} *</Label>
                  <Input
                    className="select-text"
                    type="date"
                    max={reportDateInputMax}
                    value={effectivePreviewReportDate || ''}
                    onChange={(e) =>
                      setSummaryDraft((s: any) => ({
                        ...(s || {}),
                        report_date: clampDateInputToToday(e.target.value),
                      }))
                    }
                    required
                  />
                </div>
                <div>
                  <Label className="select-text" style={{ userSelect: 'text' }}>{t('f5.preview.summary.reporting_person')}</Label>
                  <Input 
                    className="select-text selection:bg-blue-200 selection:text-blue-900 dark:selection:bg-blue-800 dark:selection:text-blue-100" 
                    style={selectableInputStyle}
                    value={summaryDraft?.reporting_person ?? ''} 
                    onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), reporting_person: e.target.value }))} 
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label className="select-text" style={{ userSelect: 'text' }}>{t('f5.preview.summary.positive_changes')}</Label>
                  <Textarea
                    className="min-h-[100px] select-text selection:bg-blue-200 selection:text-blue-900 dark:selection:bg-blue-800 dark:selection:text-blue-100 resize-y"
                    style={selectableInputStyle}
                    rows={4}
                    value={summaryDraft?.positive_changes ?? ''}
                    onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), positive_changes: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="select-text" style={{ userSelect: 'text' }}>{t('f5.preview.summary.negative_results')}</Label>
                  <Textarea
                    className="min-h-[100px] select-text selection:bg-blue-200 selection:text-blue-900 dark:selection:bg-blue-800 dark:selection:text-blue-100 resize-y"
                    style={selectableInputStyle}
                    rows={4}
                    value={summaryDraft?.negative_results ?? ''}
                    onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), negative_results: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="select-text" style={{ userSelect: 'text' }}>{t('f5.preview.summary.unexpected_results')}</Label>
                  <Textarea
                    className="min-h-[100px] select-text selection:bg-blue-200 selection:text-blue-900 dark:selection:bg-blue-800 dark:selection:text-blue-100 resize-y"
                    style={selectableInputStyle}
                    rows={4}
                    value={summaryDraft?.unexpected_results ?? ''}
                    onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), unexpected_results: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="select-text" style={{ userSelect: 'text' }}>{t('f5.preview.summary.lessons_learned')}</Label>
                  <Textarea
                    className="min-h-[100px] select-text selection:bg-blue-200 selection:text-blue-900 dark:selection:bg-blue-800 dark:selection:text-blue-100 resize-y"
                    style={selectableInputStyle}
                    rows={4}
                    value={summaryDraft?.lessons_learned ?? ''}
                    onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), lessons_learned: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="select-text" style={{ userSelect: 'text' }}>{t('f5.preview.summary.suggestions')}</Label>
                  <Textarea
                    className="min-h-[100px] select-text selection:bg-blue-200 selection:text-blue-900 dark:selection:bg-blue-800 dark:selection:text-blue-100 resize-y"
                    style={selectableInputStyle}
                    rows={4}
                    value={summaryDraft?.suggestions ?? ''}
                    onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), suggestions: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Activities Table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="select-text" style={{ userSelect: 'text' }}>{t('f5.preview.activities.title')}</Label>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setReachDraft(prev => ([...prev, {
                    activity_name: '',
                    activity_goal: '',
                    location: '',
                    start_date: '',
                    end_date: '',
                    individual_count: null,
                    household_count: null,
                    male_count: null,
                    female_count: null,
                    under18_male: null,
                    under18_female: null,
                    people_with_disabilities: null,
                    is_draft: true
                  }]))}
                >{t('f5.preview.activities.add')}</Button>
              </div>
              <div className="border rounded overflow-hidden select-text">
                {reachDraft.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">{t('f5.preview.activities.empty')}</div>
                ) : (
                  <Table className="select-text">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="py-1 px-2 text-xs select-text" style={{ userSelect: 'text' }}>{t('f5.preview.activities.cols.activity_name')}</TableHead>
                        <TableHead className="py-1 px-2 text-xs select-text" style={{ userSelect: 'text' }}>{t('f5.preview.activities.cols.activity_goal')}</TableHead>
                        <TableHead className="py-1 px-2 text-xs select-text" style={{ userSelect: 'text' }}>{t('f5.preview.activities.cols.location')}</TableHead>
                        <TableHead className="py-1 px-2 text-xs select-text" style={{ userSelect: 'text' }}>{t('f5.preview.activities.cols.start')}</TableHead>
                        <TableHead className="py-1 px-2 text-xs select-text" style={{ userSelect: 'text' }}>{t('f5.preview.activities.cols.end')}</TableHead>
                        <TableHead className="py-1 px-2 text-xs select-text" style={{ userSelect: 'text' }}>{t('f5.preview.activities.cols.beneficiaries_individuals')}</TableHead>
                        <TableHead className="py-1 px-2 text-xs select-text" style={{ userSelect: 'text' }}>{t('f5.preview.activities.cols.beneficiaries_families')}</TableHead>
                        <TableHead className="py-1 px-2 text-xs text-right select-text" style={{ userSelect: 'text' }}>{t('f5.preview.activities.cols.actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reachDraft.map((row, idx) => (
                        <TableRow key={idx} className="text-sm">
                          <TableCell className="py-1 px-2" style={{ userSelect: 'text' }}>
                            <Input 
                              className="h-8 select-text selection:bg-blue-200 selection:text-blue-900 dark:selection:bg-blue-800 dark:selection:text-blue-100" 
                              style={selectableInputStyle}
                              placeholder={t('f5.preview.activities.cols.activity_name') as string} 
                              value={row.activity_name || ''} 
                              onChange={(e)=>{ const arr=[...reachDraft]; arr[idx]={...arr[idx], activity_name: e.target.value}; setReachDraft(arr) }} 
                            />
                          </TableCell>
                          <TableCell className="py-1 px-2" style={{ userSelect: 'text' }}>
                            <Input 
                              className="h-8 select-text selection:bg-blue-200 selection:text-blue-900 dark:selection:bg-blue-800 dark:selection:text-blue-100" 
                              style={selectableInputStyle}
                              placeholder={t('f5.preview.activities.cols.activity_goal') as string} 
                              value={row.activity_goal || ''} 
                              onChange={(e)=>{ const arr=[...reachDraft]; arr[idx]={...arr[idx], activity_goal: e.target.value}; setReachDraft(arr) }} 
                            />
                          </TableCell>
                          <TableCell className="py-1 px-2" style={{ userSelect: 'text' }}>
                            <Input 
                              className="h-8 select-text selection:bg-blue-200 selection:text-blue-900 dark:selection:bg-blue-800 dark:selection:text-blue-100" 
                              style={selectableInputStyle}
                              placeholder={t('f5.preview.activities.cols.location') as string} 
                              value={row.location || ''} 
                              onChange={(e)=>{ const arr=[...reachDraft]; arr[idx]={...arr[idx], location: e.target.value}; setReachDraft(arr) }} 
                            />
                          </TableCell>
                          <TableCell className="py-1 px-2" style={{ userSelect: 'text' }}>
                            <Input 
                              className="h-8 select-text" 
                              type="date" 
                              value={row.start_date || ''} 
                              onChange={(e)=>{ const arr=[...reachDraft]; arr[idx]={...arr[idx], start_date: e.target.value}; setReachDraft(arr) }} 
                            />
                          </TableCell>
                          <TableCell className="py-1 px-2" style={{ userSelect: 'text' }}>
                            <Input 
                              className="h-8 select-text" 
                              type="date" 
                              value={row.end_date || ''} 
                              onChange={(e)=>{ const arr=[...reachDraft]; arr[idx]={...arr[idx], end_date: e.target.value}; setReachDraft(arr) }} 
                            />
                          </TableCell>
                          <TableCell className="py-1 px-2" style={{ userSelect: 'text' }}>
                            <div className="relative flex items-center gap-2">
                              <Input 
                                className="h-8 select-text selection:bg-blue-200 selection:text-blue-900 dark:selection:bg-blue-800 dark:selection:text-blue-100" 
                                style={selectableInputStyle}
                                type="number" 
                                value={row.individual_count ?? ''} 
                                onChange={(e)=>{ const arr=[...reachDraft]; arr[idx]={...arr[idx], individual_count: parseInt(e.target.value)||0}; setReachDraft(arr) }} 
                              />
                              {keyAdjustedValue(row, 'individuals') != null && (
                                <span className="absolute right-10 top-1.5 z-10 cursor-help pointer-events-auto" title={deltaInfo(row, 'individuals')}>
                                  <Flag className="h-3.5 w-3.5 text-red-500" />
                                </span>
                              )}
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={()=>openAdjustFor(idx,'individuals')}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              {/* adjustment handled via modal */}
                            </div>
                          </TableCell>
                          <TableCell className="py-1 px-2" style={{ userSelect: 'text' }}>
                            <div className="relative flex items-center gap-2">
                              <Input 
                                className="h-8 select-text selection:bg-blue-200 selection:text-blue-900 dark:selection:bg-blue-800 dark:selection:text-blue-100" 
                                style={selectableInputStyle}
                                type="number" 
                                value={row.household_count ?? ''} 
                                onChange={(e)=>{ const arr=[...reachDraft]; arr[idx]={...arr[idx], household_count: parseInt(e.target.value)||0}; setReachDraft(arr) }} 
                              />
                              {keyAdjustedValue(row, 'households') != null && (
                                <span className="absolute right-10 top-1.5 z-10 cursor-help pointer-events-auto" title={deltaInfo(row, 'households')}>
                                  <Flag className="h-3.5 w-3.5 text-red-500" />
                                </span>
                              )}
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={()=>openAdjustFor(idx,'households')}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              {/* adjustment handled via modal */}
                            </div>
                          </TableCell>
                          <TableCell className="py-1 px-2 text-right">
                            <Button variant="destructive" size="sm" onClick={()=>{ const arr=[...reachDraft]; arr.splice(idx,1); setReachDraft(arr) }}>{t('f5.preview.activities.cols.delete')}</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>

            {/* Demographics Breakdown Table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="select-text" style={{ userSelect: 'text' }}>{t('f5.preview.demographics.title')}</Label>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setReachDraft(prev => ([...prev, {
                    activity_name: '',
                    activity_goal: '',
                    location: '',
                    start_date: '',
                    end_date: '',
                    individual_count: null,
                    household_count: null,
                    male_count: null,
                    female_count: null,
                    under18_male: null,
                    under18_female: null,
                    is_draft: true
                  }]))}
                >{t('f5.preview.activities.add')}</Button>
              </div>
              <div className="border rounded overflow-hidden select-text">
                {reachDraft.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">{t('f5.preview.demographics.empty')}</div>
                ) : (
                  <Table className="select-text">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="py-1 px-2 text-xs select-text" style={{ userSelect: 'text' }}>{t('f5.preview.demographics.cols.activity')}</TableHead>
                        <TableHead className="py-1 px-2 text-xs select-text" style={{ userSelect: 'text' }}>{t('f5.preview.demographics.cols.male')}</TableHead>
                        <TableHead className="py-1 px-2 text-xs select-text" style={{ userSelect: 'text' }}>{t('f5.preview.demographics.cols.female')}</TableHead>
                        <TableHead className="py-1 px-2 text-xs select-text" style={{ userSelect: 'text' }}>{t('f5.preview.demographics.cols.male_u18')}</TableHead>
                        <TableHead className="py-1 px-2 text-xs select-text" style={{ userSelect: 'text' }}>{t('f5.preview.demographics.cols.female_u18')}</TableHead>
                        <TableHead className="py-1 px-2 text-xs select-text" style={{ userSelect: 'text' }}>{t('f5.preview.demographics.cols.pwd')}</TableHead>
                        <TableHead className="py-1 px-2 text-xs text-right select-text" style={{ userSelect: 'text' }}>{t('f5.preview.activities.cols.actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reachDraft.map((row, idx) => (
                        <TableRow key={idx} className="text-sm">
                          <TableCell className="py-1 px-2 select-text" style={{ userSelect: 'text' }}>
                            <Input 
                              className="h-8 select-text selection:bg-blue-200 selection:text-blue-900 dark:selection:bg-blue-800 dark:selection:text-blue-100" 
                              style={selectableInputStyle}
                              placeholder={t('f5.preview.demographics.cols.activity') as string} 
                              value={row.activity_name || ''} 
                              onChange={(e)=>{ const arr=[...reachDraft]; arr[idx]={...arr[idx], activity_name: e.target.value}; setReachDraft(arr) }} 
                            />
                          </TableCell>
                          <TableCell className="py-1 px-2" style={{ userSelect: 'text' }}>
                            <div className="relative flex items-center gap-2">
                              <Input 
                                className="h-8 select-text selection:bg-blue-200 selection:text-blue-900 dark:selection:bg-blue-800 dark:selection:text-blue-100" 
                                style={selectableInputStyle}
                                type="number" 
                                value={row.male_count ?? ''} 
                                onChange={(e)=>{ const arr=[...reachDraft]; arr[idx]={...arr[idx], male_count: parseInt(e.target.value)||0}; setReachDraft(arr) }} 
                              />
                              {keyAdjustedValue(row,'male') != null && (
                                <span className="absolute right-10 top-1.5 z-10 cursor-help pointer-events-auto" title={deltaInfo(row,'male')}>
                                  <Flag className="h-3.5 w-3.5 text-red-500" />
                                </span>
                              )}
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={()=>openAdjustFor(idx,'male')}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              {/* adjustment handled via modal */}
                            </div>
                          </TableCell>
                          <TableCell className="py-1 px-2" style={{ userSelect: 'text' }}>
                            <div className="relative flex items-center gap-2">
                              <Input 
                                className="h-8 select-text selection:bg-blue-200 selection:text-blue-900 dark:selection:bg-blue-800 dark:selection:text-blue-100" 
                                style={selectableInputStyle}
                                type="number" 
                                value={row.female_count ?? ''} 
                                onChange={(e)=>{ const arr=[...reachDraft]; arr[idx]={...arr[idx], female_count: parseInt(e.target.value)||0}; setReachDraft(arr) }} 
                              />
                              {keyAdjustedValue(row,'female') != null && (
                                <span className="absolute right-10 top-1.5 z-10 cursor-help pointer-events-auto" title={deltaInfo(row,'female')}>
                                  <Flag className="h-3.5 w-3.5 text-red-500" />
                                </span>
                              )}
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={()=>openAdjustFor(idx,'female')}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              {/* adjustment handled via modal */}
                            </div>
                          </TableCell>
                          <TableCell className="py-1 px-2" style={{ userSelect: 'text' }}>
                            <div className="relative flex items-center gap-2">
                              <Input 
                                className="h-8 select-text selection:bg-blue-200 selection:text-blue-900 dark:selection:bg-blue-800 dark:selection:text-blue-100" 
                                style={selectableInputStyle}
                                type="number" 
                                value={row.under18_male ?? ''} 
                                onChange={(e)=>{ const arr=[...reachDraft]; arr[idx]={...arr[idx], under18_male: parseInt(e.target.value)||0}; setReachDraft(arr) }} 
                              />
                              {keyAdjustedValue(row,'under18_male') != null && (
                                <span className="absolute right-10 top-1.5 z-10 cursor-help pointer-events-auto" title={deltaInfo(row,'under18_male')}>
                                  <Flag className="h-3.5 w-3.5 text-red-500" />
                                </span>
                              )}
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={()=>openAdjustFor(idx,'under18_male')}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              {/* adjustment handled via modal */}
                            </div>
                          </TableCell>
                          <TableCell className="py-1 px-2" style={{ userSelect: 'text' }}>
                            <div className="relative flex items-center gap-2">
                              <Input 
                                className="h-8 select-text selection:bg-blue-200 selection:text-blue-900 dark:selection:bg-blue-800 dark:selection:text-blue-100" 
                                style={selectableInputStyle}
                                type="number" 
                                value={row.under18_female ?? ''} 
                                onChange={(e)=>{ const arr=[...reachDraft]; arr[idx]={...arr[idx], under18_female: parseInt(e.target.value)||0}; setReachDraft(arr) }} 
                              />
                              {keyAdjustedValue(row,'under18_female') != null && (
                                <span className="absolute right-10 top-1.5 z-10 cursor-help pointer-events-auto" title={deltaInfo(row,'under18_female')}>
                                  <Flag className="h-3.5 w-3.5 text-red-500" />
                                </span>
                              )}
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={()=>openAdjustFor(idx,'under18_female')}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              {/* adjustment handled via modal */}
                            </div>
                          </TableCell>
                          <TableCell className="py-1 px-2" style={{ userSelect: 'text' }}>
                            <div className="relative flex items-center gap-2">
                              <Input 
                                className="h-8 select-text selection:bg-blue-200 selection:text-blue-900 dark:selection:bg-blue-800 dark:selection:text-blue-100" 
                                style={selectableInputStyle}
                                type="number" 
                                value={row.people_with_disabilities ?? ''} 
                                onChange={(e)=>{ const arr=[...reachDraft]; arr[idx]={...arr[idx], people_with_disabilities: parseInt(e.target.value)||0}; setReachDraft(arr) }} 
                              />
                              {keyAdjustedValue(row, 'people_with_disabilities') != null && (
                                <span className="absolute right-10 top-1.5 z-10 cursor-help pointer-events-auto" title={deltaInfo(row, 'people_with_disabilities')}>
                                  <Flag className="h-3.5 w-3.5 text-red-500" />
                                </span>
                              )}
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={()=>openAdjustFor(idx, 'people_with_disabilities')}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              {/* adjustment handled via modal */}
                            </div>
                          </TableCell>
                          <TableCell className="py-1 px-2 text-right">
                            <Button variant="destructive" size="sm" onClick={()=>{ const arr=[...reachDraft]; arr.splice(idx,1); setReachDraft(arr) }}>{t('f5.preview.activities.cols.delete')}</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={()=>setStep('select')}>{t('f5.preview.buttons.back')}</Button>
              <Button onClick={handleSave} disabled={isLoading || isRestoring || !isPreviewReportDateValid}>{isLoading ? t('f5.preview.buttons.saving') : t('f5.preview.buttons.save')}</Button>
            </div>
              </div>
            </CollapsibleRow>

            {/* View File - Collapsible Section */}
            <CollapsibleRow title={t('f5.preview.tabs.view_file')} defaultOpen={false}>
              <Card>
                <CardHeader>
                  <CardTitle>Uploaded File</CardTitle>
                </CardHeader>
                <CardContent>
                  {fileUrl ? (
                    <div className="w-full h-[600px] border rounded">
                      {(file?.type === 'application/pdf' || /\.pdf$/i.test(String(tempKey || ''))) ? (
                        <iframe 
                          src={fileUrl} 
                          className="w-full h-full rounded"
                          title="F5 Report PDF"
                        />
                      ) : (
                        <img 
                          src={fileUrl} 
                          alt="F5 Report" 
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

          </div>
          ) : null
        )
        }
      </DialogContent>
    </Dialog>

    {minimized && (
      <div className="fixed bottom-4 right-4 z-50 w-80 rounded border bg-background shadow-lg">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="text-sm font-medium">{t('f5.modal.title')}</div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => { setMinimized(false); onOpenChange(true) }}>Restore</Button>
            <Button size="sm" variant="ghost" onClick={() => { 
              setMinimized(false); 
              try { window.localStorage.removeItem('err_minimized_modal'); window.localStorage.removeItem('err_minimized_payload'); window.dispatchEvent(new CustomEvent('err_minimized_modal_change')) } catch {}; 
              reset() 
            }}>X</Button>
          </div>
        </div>
      </div>
    )}

    {/* Adjustment modal */}
    <Dialog open={adjustDialogOpen} onOpenChange={(v)=>{ setAdjustDialogOpen(v); if (!v) { setAdjustOpen(null) } }}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>{adjustDialogTitle || 'Adjustment'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">New value</Label>
            <Input className="h-9" type="number" value={adjustTempValue} onChange={(e)=>setAdjustTempValue(e.target.value===''?'':parseInt(e.target.value)||0)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Note (optional)</Label>
            <Input className="h-9" value={adjustTempNote} onChange={(e)=>setAdjustTempNote(e.target.value)} />
          </div>
          {adjustOpen && adjustOpen.row != null && (
            <div className="text-xs text-muted-foreground">
              Original: {keyToOriginal(reachDraft[adjustOpen.row], adjustOpen.key)}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={resetAdjust}>Reset</Button>
            <Button onClick={saveAdjust}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  )
}


