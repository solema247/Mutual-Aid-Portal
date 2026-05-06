'use client'

import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabaseClient'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CollapsibleRow } from '@/components/ui/collapsible'
import type { RegionSelection, WizardKind, WizardPageEntry } from '../f4Wizard/types'
import { normalizeWizardPage } from '../f4Wizard/types'
import { buildSnippetFilesFromSelections } from '../f4Wizard/buildSnippetFiles'
import { f4ParseSnips, f4Save, f4UploadInit } from '../f4Wizard/f4WizardApi'
import { useF4WizardViewerPages } from '../f4Wizard/useF4WizardViewerPages'
import { useF4WizardDrag, type WizardDragState } from '../f4Wizard/useF4WizardDrag'

interface UploadF4ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  initialProjectId?: string | null
}

export default function UploadF4Modal({ open, onOpenChange, onSaved, initialProjectId }: UploadF4ModalProps) {
  const { t } = useTranslation(['f4f5'])
  
  // Style object to ensure text is selectable in inputs with visible selection
  const selectableInputStyle: React.CSSProperties = {
    userSelect: 'text',
    WebkitUserSelect: 'text',
    MozUserSelect: 'text',
    msUserSelect: 'text',
    cursor: 'text',
    // Add explicit selection styling for better visibility
    // Using CSS custom properties that will be applied via className
  }

  const [states, setStates] = useState<string[]>([])
  const [selectedState, setSelectedState] = useState('')
  const [rooms, setRooms] = useState<Array<{ id: string; label: string }>>([])
  const [selectedRoomId, setSelectedRoomId] = useState('')
  const [projects, setProjects] = useState<Array<{ id: string; label: string }>>([])
  const [projectId, setProjectId] = useState('')
  const [projectMeta, setProjectMeta] = useState<any | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [reportDate, setReportDate] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [step, setStep] = useState<'select'|'wizard'|'preview'>('select')
  const [summaryDraft, setSummaryDraft] = useState<any | null>(null)
  const [expensesDraft, setExpensesDraft] = useState<any[]>([])
  const [tempKey, setTempKey] = useState<string>('')
  const [fxRate, setFxRate] = useState<number | null>(null)
  const [fileUrl, setFileUrl] = useState<string>('')
  const [minimized, setMinimized] = useState(false)
  const isMinimizingRef = useRef(false)
  const isRestoringRef = useRef(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [entryMode, setEntryMode] = useState<'upload' | 'manual'>('upload')
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [wizardLoading, setWizardLoading] = useState<WizardKind | null>(null)
  const [receiptValidation, setReceiptValidation] = useState<any | null>(null)
  const [wizardKind, setWizardKind] = useState<WizardKind>('table')
  const [wizardProgress, setWizardProgress] = useState<{ table: boolean; questions: boolean; receipts: boolean }>({
    table: false,
    questions: false,
    receipts: false,
  })
  const [viewerMode, setViewerMode] = useState<'pdf' | 'image' | 'unsupported'>('unsupported')
  const [wizardPages, setWizardPages] = useState<WizardPageEntry[]>([])
  const [isRenderingPages, setIsRenderingPages] = useState(false)
  const [selectionByKind, setSelectionByKind] = useState<Record<WizardKind, RegionSelection[]>>({
    table: [],
    questions: [],
    receipts: [],
  })
  const [dragging, setDragging] = useState<WizardDragState>(null)
  const saveInFlightRef = useRef(false)
  const wizardViewerScrollRef = useRef<HTMLDivElement | null>(null)
  const wizardPageWrapRefs = useRef<(HTMLDivElement | null)[]>([])
  const draggingRef = useRef<WizardDragState>(null)
  const wizardKindRef = useRef(wizardKind)
  wizardKindRef.current = wizardKind

  useEffect(() => {
    draggingRef.current = dragging
  }, [dragging])

  const { startDragOnPage } = useF4WizardDrag({
    open,
    step,
    wizardKindRef,
    wizardPageWrapRefs,
    wizardViewerScrollRef,
    draggingRef,
    setDragging,
    setSelectionByKind,
  })

  useEffect(() => {
    if (!open) return
    ;(async () => {
      // Load distinct states with active projects
      const { data } = await supabase
        .from('err_projects')
        .select('state')
        .eq('status', 'active')
      const uniq = Array.from(new Set(((data as any[]) || []).map((r:any)=>r.state).filter(Boolean))) as string[]
      setStates(uniq)
    })()
  }, [open])

  // Restore from minimized snapshot if present
  useEffect(() => {
    if (!open) return
    // If opening fresh (not via restore flags), clear any stale snapshot and reset state
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
        setExpensesDraft([])
        setTempKey('')
        setFileUrl('')
        setEntryMode('upload')
        setAttachmentFile(null)
        setReceiptValidation(null)
        setSelectionByKind({ table: [], questions: [], receipts: [] })
        setWizardKind('table')
        setWizardProgress({ table: false, questions: false, receipts: false })
        return
      }
    } catch {}
    try {
      const raw = window.localStorage.getItem('err_minimized_payload')
      const type = window.localStorage.getItem('err_minimized_modal')
      if (raw && type === 'f4') {
        const p = JSON.parse(raw)
        if (p?.type === 'f4') {
          isRestoringRef.current = true
          setIsRestoring(true)
          if (p.step) {
            setStep(p.step)
            if (p.step === 'wizard') setIsRenderingPages(true)
          }
          if (p.summaryDraft) setSummaryDraft(p.summaryDraft)
          if (Array.isArray(p.expensesDraft)) setExpensesDraft(p.expensesDraft)
          if (p.projectId) setProjectId(p.projectId)
          if (p.reportDate) setReportDate(p.reportDate)
          if (p.selectedState) setSelectedState(p.selectedState)
          if (p.selectedRoomId) setSelectedRoomId(p.selectedRoomId)
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

  // Initialize all input values when modal opens to prevent uncontrolled input warnings
  useEffect(() => {
    if (!open) return
    
    // Ensure all string inputs have defined values (empty strings) when modal opens
    // This prevents React warnings about uncontrolled inputs
    if (typeof reportDate !== 'string') setReportDate('')
    if (typeof projectId !== 'string') setProjectId('')
    if (typeof selectedState !== 'string') setSelectedState('')
    if (typeof selectedRoomId !== 'string') setSelectedRoomId('')
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
            .select('id, "State", "ERR CODE", "ERR Name", "USD", "Description of ERRs activity", "Target (Ind.)", "Target (Fam.)"')
            .eq('id', realUuid)
            .single()
          
          if (error || !historicalData) {
            console.error('Failed to load historical project:', error)
            setProjectMeta(null)
            return
          }
          
          setSelectedState(historicalData['State'] || '')
          
          // Set projectMeta with all necessary fields
          // Check for field name variations like the rollup API does
          const dataAny = historicalData as any
          const usd = Number(dataAny['USD'] || dataAny['usd'] || dataAny.USD || 0)
          const errCode = dataAny['ERR CODE'] || dataAny['ERR Name'] || dataAny['err_code'] || dataAny['err_name'] || ''
          const description = historicalData['Description of ERRs activity'] || ''
          const targetInd = historicalData['Target (Ind.)'] || null
          const targetFam = historicalData['Target (Fam.)'] || null
          
          console.log('Initial project load (historical) - loaded data:', {
            usd,
            errCode,
            description: description.substring(0, 50),
            targetInd,
            targetFam,
            rawData: historicalData
          })
          
          setProjectMeta({
            roomLabel: errCode,
            project_objectives: description,
            beneficiaries: targetInd || targetFam ? `${targetInd || 0} individuals, ${targetFam || 0} families` : '',
            total_grant_from_project: usd
          })
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

  // When state changes, load ERR rooms in that state with active projects
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

  // When room changes, load its active projects
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
        .or('f4_status.is.null,f4_status.neq.completed')
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

  // Load selected project meta
  useEffect(() => {
    const loadProject = async () => {
      if (!projectId) { 
        // Only clear projectMeta if we don't have initialProjectId either
        // This preserves projectMeta for historical projects loaded via initialProjectId
        if (!initialProjectId) {
          setProjectMeta(null)
        }
        return 
      }
      
      // Skip if this is being loaded from initialProjectId (let that useEffect handle it)
      // This prevents race conditions where both useEffects try to load the same data
      if (initialProjectId && String(projectId) === String(initialProjectId)) {
        // The initialProjectId useEffect will handle loading, so we skip here
        // But make sure projectMeta is preserved - don't clear it
        return
      }
      
      const isHistorical = String(projectId).startsWith('historical_')
      
      if (isHistorical) {
        // Load historical project metadata from activities_raw_import
        const realUuid = String(projectId).replace('historical_', '')
        const { data, error } = await supabase
          .from('activities_raw_import')
          .select('id, "ERR CODE", "ERR Name", "USD", "Description of ERRs activity", "Target (Ind.)", "Target (Fam.)"')
          .eq('id', realUuid)
          .single()
        
        if (error) { 
          console.error('loadProject meta (historical) - error:', error)
          console.error('loadProject meta (historical) - realUuid:', realUuid)
          setProjectMeta(null)
          return
        }
        
        if (!data) {
          console.error('loadProject meta (historical) - no data returned for UUID:', realUuid)
          setProjectMeta(null)
          return
        }
        
        // Check for field name variations like the rollup API does
        const dataAny = data as any
        const usd = Number(dataAny['USD'] || dataAny['usd'] || dataAny.USD || 0)
        const errCode = dataAny['ERR CODE'] || dataAny['ERR Name'] || dataAny['err_code'] || dataAny['err_name'] || ''
        const description = data['Description of ERRs activity'] || ''
        const targetInd = data['Target (Ind.)'] || null
        const targetFam = data['Target (Fam.)'] || null
        
        console.log('loadProject meta (historical) - loaded data:', {
          usd,
          errCode,
          description: description.substring(0, 50),
          targetInd,
          targetFam
        })
        
        setProjectMeta({
          roomLabel: errCode,
          project_objectives: description,
          beneficiaries: targetInd || targetFam ? `${targetInd || 0} individuals, ${targetFam || 0} families` : '',
          total_grant_from_project: usd
        })
      } else {
        // Load regular portal project metadata
        const { data, error } = await supabase
          .from('err_projects')
          .select(`
            id,
            project_objectives,
            intended_beneficiaries,
            estimated_beneficiaries,
            expenses,
            planned_activities,
            emergency_rooms (err_code, name, name_ar)
          `)
          .eq('id', projectId)
          .single()
        if (error) { console.error('loadProject meta', error); setProjectMeta(null); return }
        // Calculate total from planned_activities (for ERR App submissions)
        const plannedArr = Array.isArray((data as any)?.planned_activities)
          ? (data as any).planned_activities
          : (typeof (data as any)?.planned_activities === 'string' ? JSON.parse((data as any)?.planned_activities || '[]') : [])
        const fromPlanned = (Array.isArray(plannedArr) ? plannedArr : []).reduce((s: number, pa: any) => {
          const inner = Array.isArray(pa?.expenses) ? pa.expenses : []
          return s + inner.reduce((ss: number, ie: any) => ss + (Number(ie.total) || 0), 0)
        }, 0)

        // Calculate total from expenses (for mutual_aid_portal submissions)
        const expensesArr = Array.isArray((data as any)?.expenses)
          ? (data as any).expenses
          : (typeof (data as any)?.expenses === 'string' ? JSON.parse((data as any)?.expenses || '[]') : [])
        const fromExpenses = (Array.isArray(expensesArr) ? expensesArr : []).reduce((s: number, ex: any) => {
          return s + (Number(ex.total_cost) || 0)
        }, 0)

        // Use expenses total if it exists (mutual_aid_portal), otherwise use planned_activities total (ERR App)
        const grantSum = fromExpenses > 0 ? fromExpenses : fromPlanned
        const room = (data as any)?.emergency_rooms
        const roomLabel = room?.err_code || room?.name_ar || room?.name || ''
        setProjectMeta({
          roomLabel,
          project_objectives: (data as any)?.project_objectives || '',
          beneficiaries: (data as any)?.intended_beneficiaries || (data as any)?.estimated_beneficiaries || '',
          total_grant_from_project: grantSum
        })
      }
    }
    loadProject()
  }, [projectId, initialProjectId])

  const handleUploadAndParse = async () => {
    const actualProjectId = projectId || initialProjectId
    if (!actualProjectId || !file) return
    const uploadFlowStart = Date.now()
    setIsLoading(true)
    try {
      const ext = (file.name.split('.').pop() || 'pdf').toLowerCase()
      console.info('[F4 upload] start', {
        projectId: actualProjectId,
        fileName: file.name,
        fileBytes: file.size,
        ext,
      })
      // init temp key
      const { file_key_temp: key } = await f4UploadInit(actualProjectId, ext)
      setTempKey(key)
      // upload file to storage
      const { error: upErr } = await supabase.storage.from('images').upload(key, file, { upsert: true })
      if (upErr) throw upErr
      console.info('[F4 upload] stored temp file', { tempKey: key, msSinceStart: Date.now() - uploadFlowStart })
      // Get signed URL for file viewing
      const { data: signedUrl } = await supabase.storage.from('images').createSignedUrl(key, 3600)
      if (signedUrl?.signedUrl) {
        setFileUrl(signedUrl.signedUrl)
      }
      setSummaryDraft((prev:any) => ({
        ...(prev || {}),
        report_date: reportDate || prev?.report_date || '',
        beneficiaries: prev?.beneficiaries || projectMeta?.beneficiaries || '',
        lessons: prev?.lessons || '',
        training: prev?.training || '',
        project_objectives: prev?.project_objectives || projectMeta?.project_objectives || '',
        receipt_check: prev?.receipt_check || null,
      }))
      setExpensesDraft([])
      setReceiptValidation(null)
      setWizardProgress({ table: false, questions: false, receipts: false })
      setSelectionByKind({ table: [], questions: [], receipts: [] })
      setWizardKind('table')
      setIsRenderingPages(true)
      setStep('wizard')
    } catch (e) {
      console.error('[F4 upload] failed', e, { msSinceStart: Date.now() - uploadFlowStart })
      alert('Failed to process file')
    } finally {
      setIsLoading(false)
    }
  }

  useF4WizardViewerPages({
    step,
    fileUrl,
    file,
    tempKey,
    setViewerMode,
    setWizardPages,
    setIsRenderingPages,
  })

  const expectedWizardKind: WizardKind = !wizardProgress.table ? 'table' : !wizardProgress.questions ? 'questions' : 'receipts'
  useEffect(() => {
    if (wizardKind !== expectedWizardKind) setWizardKind(expectedWizardKind)
  }, [expectedWizardKind, wizardKind])

  const parseSnips = async (kind: WizardKind, overrideFiles?: File[]) => {
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
      if (kind === 'receipts') {
        const expenseAmounts = expensesDraft
          .map((r: any) => Number(r.expense_amount_sdg))
          .filter((n: number) => Number.isFinite(n) && n > 0)
        form.append('expense_amounts_sdg', JSON.stringify(expenseAmounts))
      }

      const json = (await f4ParseSnips(form)) as Record<string, unknown>

      if (kind === 'table') {
        const rows = Array.isArray(json.expenses) ? json.expenses : []
        setExpensesDraft(rows.map((ex: any) => ({
          expense_activity: ex.activity != null ? String(ex.activity) : '',
          expense_description: ex.description != null ? String(ex.description) : '',
          expense_amount_sdg: ex.amount_value != null ? Number(ex.amount_value) : null,
          expense_amount: null,
          payment_date: ex.payment_date != null ? String(ex.payment_date) : '',
          payment_method: ex.payment_method != null ? String(ex.payment_method) : 'Bank Transfer',
          receipt_no: ex.receipt_no != null ? String(ex.receipt_no) : '',
          seller: ex.seller != null ? String(ex.seller) : '',
          is_draft: true
        })))
        setSummaryDraft((prev: any) => ({
          ...(prev || {}),
          total_expenses: json.total_expenses_text != null ? Number(String(json.total_expenses_text).replace(/[,\s]/g, '')) || prev?.total_expenses || null : prev?.total_expenses || null,
          total_grant: json.total_grant_text != null ? Number(String(json.total_grant_text).replace(/[,\s]/g, '')) || prev?.total_grant || null : prev?.total_grant || null,
          total_other_sources: json.total_other_sources_text != null ? Number(String(json.total_other_sources_text).replace(/[,\s]/g, '')) || prev?.total_other_sources || null : prev?.total_other_sources || null,
          remainder: json.remainder_text != null ? Number(String(json.remainder_text).replace(/[,\s]/g, '')) || prev?.remainder || null : prev?.remainder || null,
        }))
        setWizardProgress(prev => ({ ...prev, table: true }))
        setWizardKind('questions')
      } else if (kind === 'questions') {
        setSummaryDraft((prev: any) => ({
          ...(prev || {}),
          excess_expenses: json.excess_expenses ?? prev?.excess_expenses ?? '',
          surplus_use: json.surplus_use ?? prev?.surplus_use ?? '',
          lessons: json.lessons ?? prev?.lessons ?? '',
          training: json.training ?? prev?.training ?? '',
        }))
        setWizardProgress(prev => ({ ...prev, questions: true }))
        setWizardKind('receipts')
      } else {
        setReceiptValidation(json)
        setSummaryDraft((prev: any) => ({
          ...(prev || {}),
          receipt_check: {
            receipts_total_sdg: Number(json?.receipts_total_sdg) || 0,
            receipts_detected_count: Number(json?.receipts_detected_count) || 0,
            expected_count: Number(json?.expected_count) || 0,
            expected_total_sdg: Number(json?.expected_total_sdg) || 0,
            receipts: Array.isArray(json?.receipts)
              ? json.receipts.map((r: any, idx: number) => ({
                  reference: r?.reference ? String(r.reference) : `receipt-${idx + 1}`,
                  amount_sdg: r?.amount_value != null ? Number(r.amount_value) : null,
                  currency: r?.currency ? String(r.currency) : 'SDG',
                  missing: r?.amount_value == null,
                }))
              : [],
            confirmed: false,
          },
        }))
        setWizardProgress(prev => ({ ...prev, receipts: true }))
      }
    } catch (e) {
      console.error('[F4 wizard] snippet parse failed', e)
      alert('Failed to parse snippet files')
    } finally {
      setWizardLoading(null)
    }
  }

  const handleContinueToForm = async () => {
    const actualProjectId = projectId || initialProjectId
    if (!actualProjectId) return
    setIsLoading(true)
    try {
      if (attachmentFile) {
        const ext = (attachmentFile.name.split('.').pop() || 'pdf').toLowerCase()
        const { file_key_temp: key } = await f4UploadInit(actualProjectId, ext)
        const { error: upErr } = await supabase.storage.from('images').upload(key, attachmentFile, { upsert: true })
        if (upErr) throw upErr
        setTempKey(key)
      } else {
        setTempKey('')
      }
      setSummaryDraft({
        report_date: reportDate || '',
        beneficiaries: projectMeta?.beneficiaries || '',
        lessons: '',
        training: '',
        project_objectives: projectMeta?.project_objectives || '',
        receipt_check: null,
      })
      setExpensesDraft([{
        expense_activity: '',
        expense_description: '',
        expense_amount_sdg: null,
        expense_amount: null,
        payment_date: '',
        payment_method: 'Bank Transfer',
        receipt_no: '',
        seller: '',
        is_draft: true
      } as any])
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
    if (saveInFlightRef.current) return
    const actualProjectId = projectId || initialProjectId
    if (!actualProjectId || !summaryDraft) {
      console.warn('Missing required fields:', { projectId: actualProjectId, hasSummaryDraft: !!summaryDraft })
      return
    }
    const receiptConfirmed = Boolean(summaryDraft?.receipt_check?.confirmed)
    if (!receiptConfirmed) {
      alert('Please confirm the receipt total check before saving.')
      return
    }
    saveInFlightRef.current = true
    setIsLoading(true)
    try {
      const totalExpensesSDG = expensesDraft.reduce((s, ex) => s + (Number(ex.expense_amount_sdg) || 0), 0)
      const totalExpensesUSD = expensesDraft.reduce((s, ex) => s + (Number(ex.expense_amount) || 0), 0)
      const totalGrantUSD = projectMeta?.total_grant_from_project ?? 0
      const remainderUSD = totalGrantUSD - totalExpensesUSD
      const receiptRows = Array.isArray(summaryDraft?.receipt_check?.receipts) ? summaryDraft.receipt_check.receipts : []
      const computedReceiptsTotalSDG = receiptRows.reduce((s: number, r: any) => {
        if (r?.missing) return s
        return s + (Number(r?.amount_sdg) || 0)
      }, 0)
      const missingReceiptsCount = receiptRows.reduce((s: number, r: any) => s + (r?.missing ? 1 : 0), 0)
      
      const summaryToSave = {
        ...summaryDraft,
        receipt_check: {
          ...(summaryDraft?.receipt_check || {}),
          receipts_total_sdg: computedReceiptsTotalSDG,
          receipts_detected_count: receiptRows.length,
          missing_receipts_count: missingReceiptsCount,
          variance_sdg: totalExpensesSDG - computedReceiptsTotalSDG,
        },
        total_grant: totalGrantUSD,
        total_expenses: totalExpensesUSD,
        total_expenses_sdg: totalExpensesSDG,
        remainder: remainderUSD
      }
      await f4Save({ project_id: actualProjectId, summary: summaryToSave, expenses: expensesDraft, file_key_temp: tempKey })
      try { window.localStorage.removeItem('err_minimized_modal') } catch {}
      onOpenChange(false)
      onSaved()
    } catch (e) {
      console.error(e)
      alert('Failed to save F4')
    } finally {
      setIsLoading(false)
      saveInFlightRef.current = false
    }
  }

  const runWizardStep = async (kind: WizardKind) => {
    const files = await buildSnippetFilesFromSelections(kind, wizardPages, selectionByKind[kind] ?? [])
    await parseSnips(kind, files)
  }

  const reset = () => {
    setProjectId('')
    setFile(null)
    setReportDate('')
    setSelectedState('')
    setSelectedRoomId('')
    setSummaryDraft(null)
    setExpensesDraft([])
    setStep('select')
    setTempKey('')
    setFileUrl('')
    setFxRate(null)
    setEntryMode('upload')
    setAttachmentFile(null)
    setReceiptValidation(null)
    setSelectionByKind({ table: [], questions: [], receipts: [] })
    setWizardKind('table')
    setWizardProgress({ table: false, questions: false, receipts: false })
  }

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { 
      onOpenChange(v); 
      if (!v) {
        if (isMinimizingRef.current) {
          isMinimizingRef.current = false
        } else {
          try { window.localStorage.removeItem('err_minimized_modal'); window.localStorage.removeItem('err_minimized_payload'); window.dispatchEvent(new CustomEvent('err_minimized_modal_change')) } catch {}
          // Reset all form fields on explicit close
          setStep('select')
          setProjectId('')
          setFile(null)
          setReportDate('')
          setSelectedState('')
          setSelectedRoomId('')
          setSummaryDraft(null)
          setExpensesDraft([])
          setTempKey('')
          setFileUrl('')
          setEntryMode('upload')
          setAttachmentFile(null)
          setReceiptValidation(null)
          setSelectionByKind({ table: [], questions: [], receipts: [] })
          setWizardKind('table')
          setWizardProgress({ table: false, questions: false, receipts: false })
        }
      }
    }}>
      <DialogContent 
        className="max-w-7xl w-[95vw] max-h-[85vh] overflow-y-auto select-text"
        onInteractOutside={(e:any)=>{ 
          e.preventDefault(); 
          try { 
            const snapshot = JSON.stringify({ type: 'f4', step, summaryDraft, expensesDraft, projectId, reportDate, selectedState, selectedRoomId, tempKey, fileUrl })
            window.localStorage.setItem('err_minimized_modal','f4'); 
            window.localStorage.setItem('err_minimized_payload', snapshot);
            window.dispatchEvent(new CustomEvent('err_minimized_modal_change', { detail: 'f4' } as any)) 
          } catch {} 
          isMinimizingRef.current = true
          onOpenChange(false) 
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('f4.modal.title')}</DialogTitle>
        </DialogHeader>
        {step === 'select' && !initialProjectId ? (
          <div className="space-y-4">
            <div className="flex gap-2 p-1 rounded-lg border bg-muted/30 w-fit">
              <Button type="button" variant={entryMode === 'upload' ? 'default' : 'ghost'} size="sm" onClick={() => setEntryMode('upload')}>{t('f4.modal.entry_mode_upload')}</Button>
              <Button type="button" variant={entryMode === 'manual' ? 'default' : 'ghost'} size="sm" onClick={() => setEntryMode('manual')}>{t('f4.modal.entry_mode_manual')}</Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>{t('f4.modal.state')}</Label>
                <Select value={selectedState} onValueChange={(v)=>{ setSelectedState(v); }}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t('f4.modal.state_placeholder') as string} /></SelectTrigger>
                  <SelectContent>
                    {states.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t('f4.modal.err')}</Label>
                <Select value={selectedRoomId} onValueChange={(v)=>{ setSelectedRoomId(v); }} disabled={!selectedState}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t('f4.modal.err_placeholder') as string} /></SelectTrigger>
                  <SelectContent>
                    {rooms.map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t('f4.modal.project')}</Label>
                <Select value={projectId} onValueChange={setProjectId} disabled={!selectedRoomId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t('f4.modal.project_placeholder') as string} /></SelectTrigger>
                  <SelectContent>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>{t('f4.modal.report_date')}</Label>
              <Input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
            </div>
            {entryMode === 'upload' ? (
              <>
                <div className="space-y-1">
                  <Label>{t('f4.modal.summary_file')}</Label>
                  <Input type="file" accept=".pdf,.doc,.docx,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                  <div className="text-xs text-muted-foreground">{t('f4.modal.choose_file_hint')}</div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>{t('f4.modal.cancel')}</Button>
                  <Button onClick={handleUploadAndParse} disabled={!projectId || !file || isLoading}>{isLoading ? 'Preparing…' : 'Start guided extraction'}</Button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <Label>{t('f4.modal.attachment_optional')}</Label>
                  <Input type="file" accept=".pdf,.doc,.docx,image/*" onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)} />
                  {attachmentFile && <span className="text-xs text-muted-foreground">{attachmentFile.name}</span>}
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>{t('f4.modal.cancel')}</Button>
                  <Button onClick={handleContinueToForm} disabled={!projectId || isLoading}>{isLoading ? '…' : t('f4.modal.continue_to_form')}</Button>
                </div>
              </>
            )}
          </div>
        ) : (
          // When project is pre-selected (from project management), show simplified file upload form
          step === 'select' && initialProjectId ? (
            <div className="space-y-4">
              <div className="flex gap-2 p-1 rounded-lg border bg-muted/30 w-fit">
                <Button type="button" variant={entryMode === 'upload' ? 'default' : 'ghost'} size="sm" onClick={() => setEntryMode('upload')}>{t('f4.modal.entry_mode_upload')}</Button>
                <Button type="button" variant={entryMode === 'manual' ? 'default' : 'ghost'} size="sm" onClick={() => setEntryMode('manual')}>{t('f4.modal.entry_mode_manual')}</Button>
              </div>
              <div className="space-y-1">
                <Label>{t('f4.modal.report_date')}</Label>
                <Input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
              </div>
              {entryMode === 'upload' ? (
                <>
                  <div className="space-y-1">
                    <Label>{t('f4.modal.summary_file')}</Label>
                    <Input type="file" accept=".pdf,.doc,.docx,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                    <div className="text-xs text-muted-foreground">{t('f4.modal.choose_file_hint')}</div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>{t('f4.modal.cancel')}</Button>
                    <Button onClick={handleUploadAndParse} disabled={(!projectId && !initialProjectId) || !file || isLoading}>{isLoading ? 'Preparing…' : 'Start guided extraction'}</Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <Label>{t('f4.modal.attachment_optional')}</Label>
                    <Input type="file" accept=".pdf,.doc,.docx,image/*" onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)} />
                    {attachmentFile && <span className="text-xs text-muted-foreground">{attachmentFile.name}</span>}
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>{t('f4.modal.cancel')}</Button>
                    <Button onClick={handleContinueToForm} disabled={(!projectId && !initialProjectId) || isLoading}>{isLoading ? '…' : t('f4.modal.continue_to_form')}</Button>
                  </div>
                </>
              )}
            </div>
          ) : step === 'wizard' ? (
          <div className="flex flex-col gap-2 min-h-0 max-h-[82vh]">
            {/* Instruction row + controls row */}
            <div className="sticky top-0 z-30 shrink-0 rounded-md border bg-background/95 px-2 py-1.5 shadow-sm supports-[backdrop-filter]:backdrop-blur-sm">
              <p className="text-[11px] leading-snug text-muted-foreground pb-1.5 border-b border-border/70 mb-1.5">
                Highlight a section directly on the document viewer, then run extraction for this step.
              </p>
              <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
              <div className="flex items-center gap-1 shrink-0">
                <span className={`inline-flex h-7 items-center rounded border px-1.5 text-[11px] leading-none ${wizardProgress.table ? 'bg-green-50 border-green-300 text-green-800' : expectedWizardKind === 'table' ? 'bg-sky-50 border-sky-300 text-sky-800' : 'bg-muted/30 text-muted-foreground'}`}>1) Expense table</span>
                <span className={`inline-flex h-7 items-center rounded border px-1.5 text-[11px] leading-none ${wizardProgress.questions ? 'bg-green-50 border-green-300 text-green-800' : expectedWizardKind === 'questions' ? 'bg-sky-50 border-sky-300 text-sky-800' : 'bg-muted/30 text-muted-foreground'}`}>2) Additional questions</span>
                <span className={`inline-flex h-7 items-center rounded border px-1.5 text-[11px] leading-none ${wizardProgress.receipts ? 'bg-green-50 border-green-300 text-green-800' : expectedWizardKind === 'receipts' ? 'bg-sky-50 border-sky-300 text-sky-800' : 'bg-muted/30 text-muted-foreground'}`}>3) Receipts</span>
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
                  disabled={
                    wizardLoading != null ||
                    selectionByKind[expectedWizardKind].length === 0 ||
                    (expectedWizardKind === 'receipts' && expensesDraft.length === 0)
                  }
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
                {expectedWizardKind === 'table' && (
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">Rows: {expensesDraft.length}</span>
                )}
                {expectedWizardKind === 'receipts' && receiptValidation && (
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    Receipts total (SDG): {(Number(receiptValidation.receipts_total_sdg) || 0).toLocaleString()} ({receiptValidation.receipts_detected_count ?? 0} detected)
                  </span>
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
                {/* Inner div holds ref: CardContent is not forwardRef, so ref must attach to a real DOM node for edge scroll */}
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
                          {/*
                            Inner box matches the &lt;img&gt; exactly so drag/snipping coords match overlay pixels.
                            (Border stays on the outer shell.)
                          */}
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
              <Button onClick={() => setStep('preview')} disabled={wizardLoading != null || !wizardProgress.table || !wizardProgress.questions || !wizardProgress.receipts}>
                Continue to review form
              </Button>
            </div>
          </div>
          ) : step === 'preview' ? (
          <div className="space-y-6 select-text">
            {/* Form Content */}
            <div className="space-y-6">
            {/* Summary Header */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('f4.preview.labels.err_room')}</Label>
                  <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{projectMeta?.roomLabel || '-'}</div>
                </div>
              <div>
                <Label>{t('f4.preview.labels.report_date')}</Label>
                <Input className="select-text" type="date" value={summaryDraft?.report_date || reportDate || ''} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), report_date: e.target.value }))} />
              </div>
              </div>
              <div>
                <Label>{t('f4.preview.labels.project_activities')}</Label>
                <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{projectMeta?.project_objectives || '-'}</div>
              </div>
              <div>
                <Label>{t('f4.preview.labels.beneficiaries')}</Label>
                <Input 
                  className="select-text selection:bg-blue-200 selection:text-blue-900 dark:selection:bg-blue-800 dark:selection:text-blue-100" 
                  style={selectableInputStyle}
                  value={summaryDraft?.beneficiaries || projectMeta?.beneficiaries || ''} 
                  onMouseDown={(e) => {
                    const input = e.target as HTMLInputElement
                    // Store the mouse down position for drag selection
                    const startPos = input.selectionStart ?? 0
                    ;(input as any).__dragStartPos = startPos
                    ;(input as any).__isDragging = true
                  }}
                  onMouseMove={(e) => {
                    const input = e.target as HTMLInputElement
                    if ((input as any).__isDragging && e.buttons === 1) {
                      // User is dragging to select - let browser handle it naturally
                      // Just log to see what's happening
                      if (input === document.activeElement) {
                        // Selection should be happening
                      }
                    }
                  }}
                  onMouseUp={(e) => {
                    const input = e.target as HTMLInputElement
                    ;(input as any).__isDragging = false
                    delete (input as any).__dragStartPos
                    // After mouse up, check if selection was created and preserve it
                    requestAnimationFrame(() => {
                      if (input.selectionStart !== null && input.selectionEnd !== null && input.selectionStart !== input.selectionEnd) {
                        const start = input.selectionStart
                        const end = input.selectionEnd
                        // Double-check after a brief delay to ensure selection persists
                        setTimeout(() => {
                          if (input.selectionStart !== start || input.selectionEnd !== end) {
                            input.setSelectionRange(start, end)
                          }
                        }, 10)
                      } else {
                      }
                    })
                  }}
                  onSelect={(e) => {
                    const input = e.target as HTMLInputElement
                    // Removed logging('Beneficiaries onSelect', input, e)
                  }}
                  onClick={(e) => {
                    // Removed logging('Beneficiaries onClick', e.target as HTMLInputElement, e)
                  }}
                  onFocus={(e) => {
                    const input = e.target as HTMLInputElement
                    // Removed logging('Beneficiaries onFocus', input, e)
                  }}
                  onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), beneficiaries: e.target.value }))} 
                />
              </div>
              {/* FX Rate (moved here) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="font-bold text-red-600">{t('f4.preview.labels.fx_rate')} *</Label>
                  <Input 
                    className="select-text selection:bg-blue-200 selection:text-blue-900 dark:selection:bg-blue-800 dark:selection:text-blue-100" 
                    style={selectableInputStyle}
                    type="number" 
                    value={fxRate != null ? String(fxRate) : ''} 
                    onMouseDown={(e) => {
                      // Removed logging('FX Rate onMouseDown', e.target as HTMLInputElement, e)
                    }}
                    onMouseUp={(e) => {
                      // Removed logging('FX Rate onMouseUp', e.target as HTMLInputElement, e)
                    }}
                    onSelect={(e) => {
                      // Removed logging('FX Rate onSelect', e.target as HTMLInputElement, e)
                    }}
                    onClick={(e) => {
                      // Removed logging('FX Rate onClick', e.target as HTMLInputElement, e)
                    }}
                    onFocus={(e) => {
                      // Removed logging('FX Rate onFocus', e.target as HTMLInputElement, e)
                    }}
                    onChange={(e)=>{
                    const v = parseFloat(e.target.value)
                    setFxRate(isNaN(v) ? null : v)
                    // When exchange rate is set, calculate USD from SDG for all expenses
                    if (!isNaN(v) && v > 0) {
                      setExpensesDraft(prev => prev.map((ex:any)=>{
                        const sdg = ex.expense_amount_sdg
                        if (typeof sdg === 'number' && sdg > 0) {
                          return {
                            ...ex,
                            expense_amount: +(sdg / v).toFixed(2)
                          }
                        }
                        return ex
                      }))
                    }
                  }} placeholder={t('f4.preview.labels.fx_placeholder') as string} />
                </div>
              </div>
            </div>

            {/* Expenses (move above Financials) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>{t('f4.preview.expenses.title')}</Label>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setExpensesDraft(prev => ([...prev, {
                    expense_activity: '',
                    expense_description: '',
                    expense_amount_sdg: null,
                    expense_amount: null,
                    payment_date: '',
                    payment_method: 'Bank Transfer',
                    receipt_no: '',
                    seller: '',
                    is_draft: true
                  } as any]))}
                >{t('f4.preview.expenses.add')}</Button>
              </div>
              <div className="border rounded overflow-hidden select-text">
                {expensesDraft.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">{t('f4.preview.expenses.empty')}</div>
                ) : (
                  <Table className="select-text">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[14%] py-1 px-2 text-xs">{t('f4.preview.expenses.cols.activity')}</TableHead>
                        <TableHead className="w-[20%] py-1 px-2 text-xs">{t('f4.preview.expenses.cols.description')}</TableHead>
                        <TableHead className="w-[10%] py-1 px-2 text-right text-xs">Amount (SDG)</TableHead>
                        <TableHead className="w-[10%] py-1 px-2 text-right text-xs">Amount (USD)</TableHead>
                        <TableHead className="w-[12%] py-1 px-2 text-xs">{t('f4.preview.expenses.cols.payment_date')}</TableHead>
                        <TableHead className="w-[10%] py-1 px-2 text-xs">{t('f4.preview.expenses.cols.method')}</TableHead>
                        <TableHead className="w-[10%] py-1 px-2 text-xs">{t('f4.preview.expenses.cols.receipt_no')}</TableHead>
                        <TableHead className="w-[14%] py-1 px-2 text-xs">{t('f4.preview.expenses.cols.seller')}</TableHead>
                        <TableHead className="w-[8%] py-1 px-2 text-xs text-right">{t('f4.preview.expenses.cols.actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expensesDraft.map((ex, idx) => (
                        <TableRow key={idx} className="text-sm">
                          <TableCell className="py-1 px-2" style={{ userSelect: 'text' }}>
                            <Input 
                              className="h-8 select-text selection:bg-blue-200 selection:text-blue-900 dark:selection:bg-blue-800 dark:selection:text-blue-100" 
                              style={selectableInputStyle}
                              placeholder={t('f4.preview.expenses.cols.activity') as string} 
                              value={ex.expense_activity || ''} 
                              onMouseDown={(e) => {
                                // Removed logging(`Expense ${idx} Activity onMouseDown`, e.target as HTMLInputElement, e)
                              }}
                              onMouseUp={(e) => {
                                // Removed logging(`Expense ${idx} Activity onMouseUp`, e.target as HTMLInputElement, e)
                              }}
                              onSelect={(e) => {
                                // Removed logging(`Expense ${idx} Activity onSelect`, e.target as HTMLInputElement, e)
                              }}
                              onClick={(e) => {
                                // Removed logging(`Expense ${idx} Activity onClick`, e.target as HTMLInputElement, e)
                              }}
                              onFocus={(e) => {
                                // Removed logging(`Expense ${idx} Activity onFocus`, e.target as HTMLInputElement, e)
                                // REMOVED: Don't interfere with browser's default selection behavior
                                // User can click once to select all, click again to place cursor, or drag to select
                              }}
                              onChange={(e)=>{
                                const arr=[...expensesDraft]; arr[idx]={...arr[idx], expense_activity: e.target.value}; setExpensesDraft(arr)
                              }} 
                            />
                          </TableCell>
                          <TableCell className="py-1 px-2" style={{ userSelect: 'text' }}>
                            <Input 
                              className="h-8 select-text selection:bg-blue-200 selection:text-blue-900 dark:selection:bg-blue-800 dark:selection:text-blue-100" 
                              style={selectableInputStyle}
                              placeholder={t('f4.preview.expenses.cols.description') as string} 
                              value={ex.expense_description || ''} 
                              onMouseDown={(e) => {
                                // Removed logging(`Expense ${idx} Description onMouseDown`, e.target as HTMLInputElement, e)
                              }}
                              onSelect={(e) => {
                                // Removed logging(`Expense ${idx} Description onSelect`, e.target as HTMLInputElement, e)
                              }}
                              onFocus={(e) => {
                                // Removed logging(`Expense ${idx} Description onFocus`, e.target as HTMLInputElement, e)
                              }}
                              onChange={(e)=>{
                                const arr=[...expensesDraft]; arr[idx]={...arr[idx], expense_description: e.target.value}; setExpensesDraft(arr)
                              }} 
                            />
                          </TableCell>
                          <TableCell className="py-1 px-2 text-right" style={{ userSelect: 'text' }}>
                            <Input 
                              className="h-8 select-text selection:bg-blue-200 selection:text-blue-900 dark:selection:bg-blue-800 dark:selection:text-blue-100" 
                              style={selectableInputStyle}
                              type="number" 
                              placeholder="SDG" 
                              value={ex.expense_amount_sdg != null ? String(ex.expense_amount_sdg) : ''} 
                              onMouseDown={(e) => {
                                // Removed logging(`Expense ${idx} SDG Amount onMouseDown`, e.target as HTMLInputElement, e)
                              }}
                              onSelect={(e) => {
                                // Removed logging(`Expense ${idx} SDG Amount onSelect`, e.target as HTMLInputElement, e)
                              }}
                              onFocus={(e) => {
                                // Removed logging(`Expense ${idx} SDG Amount onFocus`, e.target as HTMLInputElement, e)
                              }}
                              onChange={(e)=>{
                                const enteredValue = parseFloat(e.target.value) || 0
                                const arr = [...expensesDraft]
                                arr[idx] = {
                                  ...arr[idx],
                                  expense_amount_sdg: enteredValue || null,
                                  // Auto-calculate USD if exchange rate is set
                                  expense_amount: (fxRate && fxRate > 0 && enteredValue > 0) ? +(enteredValue / fxRate).toFixed(2) : arr[idx].expense_amount
                                }
                                setExpensesDraft(arr)
                              }} 
                            />
                          </TableCell>
                          <TableCell className="py-1 px-2 text-right" style={{ userSelect: 'text' }}>
                            <Input 
                              className="h-8 select-text selection:bg-blue-200 selection:text-blue-900 dark:selection:bg-blue-800 dark:selection:text-blue-100" 
                              style={selectableInputStyle}
                              type="number" 
                              placeholder="USD" 
                              value={ex.expense_amount != null ? String(ex.expense_amount) : ''} 
                              onMouseDown={(e) => {
                                // Removed logging(`Expense ${idx} USD Amount onMouseDown`, e.target as HTMLInputElement, e)
                              }}
                              onSelect={(e) => {
                                // Removed logging(`Expense ${idx} USD Amount onSelect`, e.target as HTMLInputElement, e)
                              }}
                              onFocus={(e) => {
                                // Removed logging(`Expense ${idx} USD Amount onFocus`, e.target as HTMLInputElement, e)
                              }}
                              onChange={(e)=>{
                                const enteredValue = parseFloat(e.target.value) || 0
                                const arr = [...expensesDraft]
                                arr[idx] = {
                                  ...arr[idx],
                                  expense_amount: enteredValue || null,
                                  // Auto-calculate SDG if exchange rate is set
                                  expense_amount_sdg: (fxRate && fxRate > 0 && enteredValue > 0) ? +(enteredValue * fxRate).toFixed(2) : arr[idx].expense_amount_sdg
                                }
                                setExpensesDraft(arr)
                              }} 
                            />
                          </TableCell>
                          <TableCell className="py-1 px-2" style={{ userSelect: 'text' }}>
                            <Input 
                              className="h-8 select-text selection:bg-blue-200 selection:text-blue-900 dark:selection:bg-blue-800 dark:selection:text-blue-100" 
                              style={selectableInputStyle}
                              type="date" 
                              placeholder={t('f4.preview.expenses.cols.payment_date') as string} 
                              value={ex.payment_date || ''} 
                              onMouseDown={(e) => {
                                // Removed logging(`Expense ${idx} Payment Date onMouseDown`, e.target as HTMLInputElement, e)
                              }}
                              onSelect={(e) => {
                                // Removed logging(`Expense ${idx} Payment Date onSelect`, e.target as HTMLInputElement, e)
                              }}
                              onFocus={(e) => {
                                // Removed logging(`Expense ${idx} Payment Date onFocus`, e.target as HTMLInputElement, e)
                              }}
                              onChange={(e)=>{
                                const arr=[...expensesDraft]; arr[idx]={...arr[idx], payment_date: e.target.value}; setExpensesDraft(arr)
                              }} 
                            />
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            <Select value={ex.payment_method || 'Bank Transfer'} onValueChange={(v)=>{
                              const arr=[...expensesDraft]; arr[idx]={...arr[idx], payment_method: v}; setExpensesDraft(arr)
                            }}>
                              <SelectTrigger className="h-8 w-full">
                                <SelectValue placeholder={t('f4.preview.expenses.cols.method') as string} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                                <SelectItem value="Cash">Cash</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="py-1 px-2" style={{ userSelect: 'text' }}>
                            <Input 
                              className="h-8 select-text selection:bg-blue-200 selection:text-blue-900 dark:selection:bg-blue-800 dark:selection:text-blue-100" 
                              style={selectableInputStyle}
                              placeholder={t('f4.preview.expenses.cols.receipt_no') as string} 
                              value={ex.receipt_no || ''} 
                              onMouseDown={(e) => {
                                // Removed logging(`Expense ${idx} Receipt No onMouseDown`, e.target as HTMLInputElement, e)
                              }}
                              onSelect={(e) => {
                                // Removed logging(`Expense ${idx} Receipt No onSelect`, e.target as HTMLInputElement, e)
                              }}
                              onFocus={(e) => {
                                // Removed logging(`Expense ${idx} Receipt No onFocus`, e.target as HTMLInputElement, e)
                              }}
                              onChange={(e)=>{
                                const arr=[...expensesDraft]; arr[idx]={...arr[idx], receipt_no: e.target.value}; setExpensesDraft(arr)
                              }} 
                            />
                          </TableCell>
                          <TableCell className="py-1 px-2" style={{ userSelect: 'text' }}>
                            <Input 
                              className="h-8 select-text selection:bg-blue-200 selection:text-blue-900 dark:selection:bg-blue-800 dark:selection:text-blue-100" 
                              style={selectableInputStyle}
                              placeholder={t('f4.preview.expenses.cols.seller') as string} 
                              value={ex.seller || ''} 
                              onMouseDown={(e) => {
                                // Removed logging(`Expense ${idx} Seller onMouseDown`, e.target as HTMLInputElement, e)
                              }}
                              onSelect={(e) => {
                                // Removed logging(`Expense ${idx} Seller onSelect`, e.target as HTMLInputElement, e)
                              }}
                              onFocus={(e) => {
                                // Removed logging(`Expense ${idx} Seller onFocus`, e.target as HTMLInputElement, e)
                              }}
                              onChange={(e)=>{
                                const arr=[...expensesDraft]; arr[idx]={...arr[idx], seller: e.target.value}; setExpensesDraft(arr)
                              }} 
                            />
                          </TableCell>
                          <TableCell className="py-1 px-2 text-right">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                const arr = [...expensesDraft]
                                arr.splice(idx, 1)
                                setExpensesDraft(arr)
                              }}
                            >{t('f4.preview.expenses.cols.delete')}</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>

            {/* Financials */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('f4.preview.financials.total_grant')} (USD)</Label>
                <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{(projectMeta?.total_grant_from_project ?? 0).toLocaleString()}</div>
              </div>
              <div>
                <Label>{t('f4.preview.financials.total_expenses')} (USD)</Label>
                <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{expensesDraft.reduce((s, ex) => s + (Number(ex.expense_amount) || 0), 0).toLocaleString()}</div>
              </div>
              <div>
                <Label>{t('f4.preview.financials.total_expenses')} (SDG)</Label>
                <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{expensesDraft.reduce((s, ex) => s + (Number(ex.expense_amount_sdg) || 0), 0).toLocaleString()}</div>
              </div>
              <div>
                <Label>{t('f4.preview.financials.remainder')} (USD)</Label>
                <Input className="select-text" type="number" value={String((projectMeta?.total_grant_from_project || 0) - expensesDraft.reduce((s, ex) => s + (Number(ex.expense_amount) || 0), 0))} readOnly />
              </div>
              <div>
                <Label>{t('f4.preview.financials.total_other_sources')}</Label>
                <Input 
                  className="select-text selection:bg-blue-200 selection:text-blue-900 dark:selection:bg-blue-800 dark:selection:text-blue-100" 
                  style={selectableInputStyle}
                  type="number" 
                  value={summaryDraft?.total_other_sources != null ? String(summaryDraft.total_other_sources) : ''} 
                  onFocus={(e) => {
                    // Removed logging('Total Other Sources onFocus', e.target as HTMLInputElement, e)
                  }}
                  onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), total_other_sources: parseFloat(e.target.value)||0 }))} 
                />
              </div>
              <div className="col-span-2">
                <Label>{t('f4.preview.financials.excess_expenses')}</Label>
                <Textarea 
                  className="select-text selection:bg-blue-200 selection:text-blue-900 dark:selection:bg-blue-800 dark:selection:text-blue-100 min-h-[100px]" 
                  style={selectableInputStyle}
                  value={summaryDraft?.excess_expenses != null ? String(summaryDraft.excess_expenses) : ''} 
                  onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), excess_expenses: e.target.value }))} 
                />
              </div>
              <div className="col-span-2">
                <Label>{t('f4.preview.financials.surplus_use')}</Label>
                <Textarea 
                  className="select-text selection:bg-blue-200 selection:text-blue-900 dark:selection:bg-blue-800 dark:selection:text-blue-100 min-h-[100px]" 
                  style={selectableInputStyle}
                  value={summaryDraft?.surplus_use != null ? String(summaryDraft.surplus_use) : ''} 
                  onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), surplus_use: e.target.value }))} 
                />
              </div>
              <div className="col-span-2">
                <Label>{t('f4.preview.financials.lessons_learned')}</Label>
                <Textarea 
                  className="select-text selection:bg-blue-200 selection:text-blue-900 dark:selection:bg-blue-800 dark:selection:text-blue-100 min-h-[100px]" 
                  style={selectableInputStyle}
                  value={summaryDraft?.lessons != null ? String(summaryDraft.lessons) : ''} 
                  onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), lessons: e.target.value }))} 
                />
              </div>
              <div className="col-span-2">
                <Label>{t('f4.preview.financials.training_needs')}</Label>
                <Textarea 
                  className="select-text selection:bg-blue-200 selection:text-blue-900 dark:selection:bg-blue-800 dark:selection:text-blue-100 min-h-[100px]" 
                  style={selectableInputStyle}
                  value={summaryDraft?.training != null ? String(summaryDraft.training) : ''} 
                  onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), training: e.target.value }))} 
                />
              </div>

              <div className="col-span-2 rounded border p-3 bg-muted/20 space-y-3">
                <div className="font-medium text-sm">Receipt Check</div>
                {(() => {
                  const receiptRows = Array.isArray(summaryDraft?.receipt_check?.receipts) ? summaryDraft.receipt_check.receipts : []
                  const expenseTotalSdg = expensesDraft.reduce((s, ex) => s + (Number(ex.expense_amount_sdg) || 0), 0)
                  const receiptsTotalSdg = receiptRows.reduce((s: number, r: any) => {
                    if (r?.missing) return s
                    return s + (Number(r?.amount_sdg) || 0)
                  }, 0)
                  const varianceSdg = expenseTotalSdg - receiptsTotalSdg
                  return (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                        <div>
                          <div className="text-muted-foreground">Expense table total (SDG)</div>
                          <div className="font-medium">{expenseTotalSdg.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Receipts extracted total (SDG)</div>
                          <div className="font-medium">{receiptsTotalSdg.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Variance (SDG)</div>
                          <div className="font-medium">{varianceSdg.toLocaleString()}</div>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Edit extracted receipt amounts as needed, add missing receipts manually, or mark unreadable receipts as missing.
                      </div>
                      <div className="border rounded overflow-hidden bg-background">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[40%]">Receipt / Reference</TableHead>
                              <TableHead className="w-[25%]">Amount (SDG)</TableHead>
                              <TableHead className="w-[20%]">Missing</TableHead>
                              <TableHead className="w-[15%] text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {receiptRows.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={4} className="text-sm text-muted-foreground">
                                  No receipt rows yet. Add rows manually if needed.
                                </TableCell>
                              </TableRow>
                            ) : (
                              receiptRows.map((row: any, idx: number) => (
                                <TableRow key={`receipt-row-${idx}`}>
                                  <TableCell>
                                    <Input
                                      value={row?.reference || ''}
                                      onChange={(e) => {
                                        const nextRows = [...receiptRows]
                                        nextRows[idx] = { ...nextRows[idx], reference: e.target.value }
                                        setSummaryDraft((s: any) => ({
                                          ...(s || {}),
                                          receipt_check: { ...(s?.receipt_check || {}), receipts: nextRows, confirmed: false },
                                        }))
                                      }}
                                      placeholder={`receipt-${idx + 1}`}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      value={row?.amount_sdg != null ? String(row.amount_sdg) : ''}
                                      onChange={(e) => {
                                        const nextRows = [...receiptRows]
                                        const num = parseFloat(e.target.value)
                                        nextRows[idx] = { ...nextRows[idx], amount_sdg: Number.isFinite(num) ? num : null }
                                        setSummaryDraft((s: any) => ({
                                          ...(s || {}),
                                          receipt_check: { ...(s?.receipt_check || {}), receipts: nextRows, confirmed: false },
                                        }))
                                      }}
                                      placeholder="0"
                                      disabled={Boolean(row?.missing)}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      <Checkbox
                                        checked={Boolean(row?.missing)}
                                        onCheckedChange={(checked) => {
                                          const nextRows = [...receiptRows]
                                          nextRows[idx] = {
                                            ...nextRows[idx],
                                            missing: Boolean(checked),
                                            amount_sdg: checked ? null : nextRows[idx]?.amount_sdg,
                                          }
                                          setSummaryDraft((s: any) => ({
                                            ...(s || {}),
                                            receipt_check: { ...(s?.receipt_check || {}), receipts: nextRows, confirmed: false },
                                          }))
                                        }}
                                      />
                                      <span className="text-xs text-muted-foreground">mark missing</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      onClick={() => {
                                        const nextRows = [...receiptRows]
                                        nextRows.splice(idx, 1)
                                        setSummaryDraft((s: any) => ({
                                          ...(s || {}),
                                          receipt_check: { ...(s?.receipt_check || {}), receipts: nextRows, confirmed: false },
                                        }))
                                      }}
                                    >
                                      Delete
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </div>
                      <div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const nextRows = [
                              ...receiptRows,
                              { reference: `manual-receipt-${receiptRows.length + 1}`, amount_sdg: null, currency: 'SDG', missing: false },
                            ]
                            setSummaryDraft((s: any) => ({
                              ...(s || {}),
                              receipt_check: { ...(s?.receipt_check || {}), receipts: nextRows, confirmed: false },
                            }))
                          }}
                        >
                          Add receipt row
                        </Button>
                      </div>
                    </>
                  )
                })()}
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="receipt-check-confirmed"
                    checked={Boolean(summaryDraft?.receipt_check?.confirmed)}
                    onCheckedChange={(checked) => {
                      setSummaryDraft((s: any) => ({
                        ...(s || {}),
                        receipt_check: {
                          ...(s?.receipt_check || {}),
                          confirmed: Boolean(checked),
                          confirmed_at: new Date().toISOString(),
                        },
                      }))
                    }}
                  />
                  <Label htmlFor="receipt-check-confirmed" className="text-sm">
                    I confirm the receipts total has been reviewed against the expense table total.
                  </Label>
                </div>
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={()=>setStep('select')} disabled={!!initialProjectId}>{t('f4.preview.buttons.back')}</Button>
              <Button onClick={handleSave} disabled={isLoading || isRestoring || !Boolean(summaryDraft?.receipt_check?.confirmed)}>{isLoading ? t('f4.preview.buttons.saving') : t('f4.preview.buttons.save')}</Button>
            </div>
            </div>

            {/* View File - Collapsible Section */}
            <CollapsibleRow title={t('f4.preview.tabs.view_file')} defaultOpen={false}>
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
                          title="F4 Report PDF"
                        />
                      ) : (
                        <img 
                          src={fileUrl} 
                          alt="F4 Report" 
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
        )}
      </DialogContent>
    </Dialog>
    {minimized && (
      <div className="fixed bottom-4 right-4 z-50 w-80 rounded border bg-background shadow-lg">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="text-sm font-medium">{t('f4.modal.title')}</div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => { setMinimized(false); onOpenChange(true) }}>Restore</Button>
            <Button size="sm" variant="ghost" onClick={() => { setMinimized(false); try { window.localStorage.removeItem('err_minimized_modal'); window.localStorage.removeItem('err_minimized_payload'); window.dispatchEvent(new CustomEvent('err_minimized_modal_change')) } catch {}; reset() }}>X</Button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}


