'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Plus, ChevronDown, ChevronUp, RefreshCw, Upload, FileSpreadsheet, FileText, Pencil, Save, X, Trash2, ExternalLink, Eye } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabaseClient'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  isExternalDecisionDocLink,
  resolveDecisionDocumentUrl,
  type DecisionDocument,
} from '@/lib/grantManagement/decisionDocument'

type Decision = {
  id: string
  decision_id: string
  decision_id_proposed?: string | null
  partner?: string | null
  grant_name?: string | null
  decision_amount: number | null
  sum_allocation_amount: number | null
  decision_date?: string | null
  notes?: string | null
  restriction?: string | null
  file_name?: string | null
  file_link?: string | null
  documents?: DecisionDocument[]
}

function decisionDocuments(decision: Decision): DecisionDocument[] {
  if (Array.isArray(decision.documents) && decision.documents.length > 0) {
    return decision.documents
  }
  if (decision.file_link?.trim()) {
    return [
      {
        id: `legacy-${decision.id}`,
        file_name: decision.file_name?.trim() || 'Document',
        file_link: decision.file_link.trim(),
        source: isExternalDecisionDocLink(decision.file_link) ? 'airtable' : 'portal',
      },
    ]
  }
  return []
}

type Allocation = {
  allocation_id: string
  decision_id: string
  state: string | null
  amount: number | null
  percent_of_decision: number | null
  notes?: string | null
}

/** Prefer the review / missing-funds lines when Notes also has other text. */
function displayNoteLines(notes: string | null | undefined): string[] {
  if (!notes?.trim()) return []
  const lines = notes
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
  const priority = lines.filter(
    (l) =>
      /Please Review:/i.test(l) ||
      /Mutual Aid Calculator/i.test(l) ||
      /missing a funds request/i.test(l) ||
      /missing in Lohub Tracker/i.test(l) ||
      /missing Google Sheet code/i.test(l) ||
      /Allocation does not match decision document/i.test(l) ||
      /amount mismatch/i.test(l) ||
      /state mismatch/i.test(l) ||
      /\$300,000 tranche/i.test(l) ||
      /full \$2,000,000/i.test(l) ||
      /Decision envelope/i.test(l) ||
      /First tranche/i.test(l) ||
      /later tranches/i.test(l)
  )
  return priority.length ? priority : lines
}

function hasReviewNote(notes: string | null | undefined): boolean {
  return displayNoteLines(notes).some((l) =>
    /Please Review:|Mutual Aid|missing a funds|missing in Lohub|missing Google Sheet|does not match|amount mismatch|state mismatch/i.test(
      l
    )
  )
}

function hasInfoNote(notes: string | null | undefined): boolean {
  return displayNoteLines(notes).some((l) =>
    /Decision envelope|First tranche|later tranches|tranche/i.test(l)
  )
}

function NotesCallout({ notes }: { notes: string | null | undefined }) {
  const lines = displayNoteLines(notes)
  if (!lines.length) {
    return <span className="text-muted-foreground">—</span>
  }
  const review = hasReviewNote(notes)
  const info = !review && hasInfoNote(notes)
  const className = review
    ? 'rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-amber-950 text-xs leading-snug space-y-1 max-w-md'
    : info
      ? 'rounded-md border border-sky-200 bg-sky-50 px-2 py-1.5 text-sky-950 text-xs leading-snug space-y-1 max-w-md'
      : 'rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-amber-950 text-xs leading-snug space-y-1 max-w-md'
  return (
    <div className={className}>
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  )
}

const decisionSchema = z.object({
  // Auto-generated from partner + date + serial; shown read-only in the form
  decision_id_proposed: z.string().optional(),
  decision_id: z.string().optional(),
  decision_amount: z.coerce.number().positive('Amount must be > 0'),
  decision_date: z.string().min(1, 'Decision date is required'),
  partner: z.string().min(1, 'Partner is required'),
  decision_maker: z.string().optional(),
  flow_oversight: z.string().optional(),
  restriction: z.string().optional(),
  notes: z.string().optional(),
})

export default function DistributionDecisionsManager() {
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [expandedDecisionId, setExpandedDecisionId] = useState<string | null>(null) // master table UUID
  const [expandedDecisionKey, setExpandedDecisionKey] = useState<string | null>(null) // decision_id used for API
  const [allocationsByDecision, setAllocationsByDecision] = useState<Record<string, Allocation[]>>({})
  const [isAllocLoading, setIsAllocLoading] = useState<Record<string, boolean>>({})
  const [allocRows, setAllocRows] = useState<Array<{ state: string; amount: string }>>([])
  const [stateOptions, setStateOptions] = useState<string[]>([])
  const [isDeleting, setIsDeleting] = useState<Record<string, boolean>>({})
  const [isCollapsed, setIsCollapsed] = useState(true)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [decisionToDelete, setDecisionToDelete] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10
  const [useCsvUpload, setUseCsvUpload] = useState(false)
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [manualFiles, setManualFiles] = useState<File[]>([])
  const [extraCreateFiles, setExtraCreateFiles] = useState<File[]>([])
  const [isParsingCsv, setIsParsingCsv] = useState(false)
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string } | null>(null)
  const [editingAllocation, setEditingAllocation] = useState<string | null>(null)
  const [editAllocationState, setEditAllocationState] = useState<string>('')
  const [editAllocationAmount, setEditAllocationAmount] = useState<string>('')
  const [isUpdatingAllocation, setIsUpdatingAllocation] = useState(false)
  const [isDeletingAllocation, setIsDeletingAllocation] = useState<string | null>(null)
  const [dateSortOrder, setDateSortOrder] = useState<'desc' | 'asc'>('desc')
  const [isUploadingDoc, setIsUploadingDoc] = useState<Record<string, boolean>>({})
  const [isOpeningDoc, setIsOpeningDoc] = useState<Record<string, boolean>>({})
  const [opsPartnerOptions, setOpsPartnerOptions] = useState<string[]>([])
  const [decisionMakerOptions, setDecisionMakerOptions] = useState<string[]>([])
  const [flowOversightOptions, setFlowOversightOptions] = useState<string[]>([])
  const [restrictionOptions, setRestrictionOptions] = useState<string[]>([])
  const [addingPartner, setAddingPartner] = useState(false)
  const [newPartnerName, setNewPartnerName] = useState('')
  const [addingDecisionMaker, setAddingDecisionMaker] = useState(false)
  const [newDecisionMakerName, setNewDecisionMakerName] = useState('')
  const [addingFlowOversight, setAddingFlowOversight] = useState(false)
  const [newFlowOversightName, setNewFlowOversightName] = useState('')
  const [addingRestriction, setAddingRestriction] = useState(false)
  const [newRestrictionName, setNewRestrictionName] = useState('')
  const [isSavingLookup, setIsSavingLookup] = useState(false)
  const [previewDecisionId, setPreviewDecisionId] = useState<string | null>(null)
  const [isPreviewingId, setIsPreviewingId] = useState(false)

  const canEditAllocations =
    currentUser?.role === 'support' ||
    currentUser?.role === 'admin' ||
    currentUser?.role === 'superadmin'

  const validPendingAllocRows = (rows: Array<{ state: string; amount: string }>) =>
    rows
      .map((r) => ({ state: r.state.trim(), amount: Number(r.amount) }))
      .filter((r) => r.state && !Number.isNaN(r.amount) && r.amount > 0)

  const decisionForm = useForm<z.infer<typeof decisionSchema>>({
    resolver: zodResolver(decisionSchema),
    defaultValues: {
      decision_id_proposed: '',
      decision_id: '',
      decision_amount: 0,
      decision_date: '',
      partner: '',
      decision_maker: '',
      flow_oversight: '',
      restriction: '',
      notes: '',
    },
  })

  const fetchDecisions = async () => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/distribution-decisions')
      if (!res.ok) throw new Error('Failed to load decisions')
      const data = await res.json()
      setDecisions(data || [])
    } catch (error) {
      console.error(error)
      alert('Failed to load distribution decisions')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchDecisions()
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/users/me')
      if (res.ok) {
        const userData = await res.json()
        setCurrentUser(userData)
      }
    } catch (error) {
      console.error('Auth check error:', error)
    }
  }

  useEffect(() => {
    const loadStates = async () => {
      try {
        const res = await fetch('/api/states')
        if (!res.ok) throw new Error('Failed to load states')
        const data = await res.json()
        const uniques = Array.from(new Set((data || []).map((s: any) => s.state_name).filter(Boolean))) as string[]
        uniques.sort()
        setStateOptions(uniques)
      } catch (e) {
        console.error('Failed to load states', e)
      }
    }
    const loadOpsPartners = async () => {
      try {
        const res = await fetch('/api/ops-partners')
        if (!res.ok) throw new Error('Failed to load ops partners')
        const data = await res.json()
        const names = (data || [])
          .map((p: { name?: string }) => p.name)
          .filter((n: unknown): n is string => typeof n === 'string' && Boolean(n.trim()))
        setOpsPartnerOptions(names)
      } catch (e) {
        console.error('Failed to load ops partners', e)
      }
    }
    const loadDecisionMakers = async () => {
      try {
        const res = await fetch('/api/distribution-decision-makers')
        if (!res.ok) throw new Error('Failed to load decision makers')
        const data = await res.json()
        const names = (data || [])
          .map((p: { name?: string }) => p.name)
          .filter((n: unknown): n is string => typeof n === 'string' && Boolean(n.trim()))
        setDecisionMakerOptions(names)
      } catch (e) {
        console.error('Failed to load decision makers', e)
      }
    }
    const loadFlowOversightOptions = async () => {
      try {
        const res = await fetch('/api/flow-oversight-options')
        if (!res.ok) throw new Error('Failed to load flow oversight options')
        const data = await res.json()
        const names = (data || [])
          .map((p: { name?: string }) => p.name)
          .filter((n: unknown): n is string => typeof n === 'string' && Boolean(n.trim()))
        setFlowOversightOptions(names)
      } catch (e) {
        console.error('Failed to load flow oversight options', e)
      }
    }
    const loadRestrictionOptions = async () => {
      try {
        const res = await fetch('/api/distribution-restriction-options')
        if (!res.ok) throw new Error('Failed to load restriction options')
        const data = await res.json()
        const names = (data || [])
          .map((p: { name?: string }) => p.name)
          .filter((n: unknown): n is string => typeof n === 'string' && Boolean(n.trim()))
        setRestrictionOptions(names)
      } catch (e) {
        console.error('Failed to load restriction options', e)
      }
    }
    loadStates()
    loadOpsPartners()
    loadDecisionMakers()
    loadFlowOversightOptions()
    loadRestrictionOptions()
  }, [])

  const handleAddOpsPartner = async () => {
    const name = newPartnerName.trim()
    if (!name) return
    try {
      setIsSavingLookup(true)
      const res = await fetch('/api/ops-partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to add partner')
      }
      const created = await res.json()
      const createdName = created.name || name
      setOpsPartnerOptions((prev) =>
        prev.includes(createdName) ? prev : [...prev, createdName].sort((a, b) => a.localeCompare(b))
      )
      decisionForm.setValue('partner', createdName)
      setNewPartnerName('')
      setAddingPartner(false)
    } catch (error: any) {
      alert(error.message || 'Failed to add partner')
    } finally {
      setIsSavingLookup(false)
    }
  }

  const handleAddDecisionMaker = async () => {
    const name = newDecisionMakerName.trim()
    if (!name) return
    try {
      setIsSavingLookup(true)
      const res = await fetch('/api/distribution-decision-makers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to add decision maker')
      }
      const created = await res.json()
      const createdName = created.name || name
      setDecisionMakerOptions((prev) =>
        prev.includes(createdName) ? prev : [...prev, createdName].sort((a, b) => a.localeCompare(b))
      )
      decisionForm.setValue('decision_maker', createdName)
      setNewDecisionMakerName('')
      setAddingDecisionMaker(false)
    } catch (error: any) {
      alert(error.message || 'Failed to add decision maker')
    } finally {
      setIsSavingLookup(false)
    }
  }

  const handleAddFlowOversight = async () => {
    const name = newFlowOversightName.trim()
    if (!name) return
    try {
      setIsSavingLookup(true)
      const res = await fetch('/api/flow-oversight-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to add flow oversight option')
      }
      const created = await res.json()
      const createdName = created.name || name
      setFlowOversightOptions((prev) =>
        prev.includes(createdName) ? prev : [...prev, createdName].sort((a, b) => a.localeCompare(b))
      )
      decisionForm.setValue('flow_oversight', createdName)
      setNewFlowOversightName('')
      setAddingFlowOversight(false)
    } catch (error: any) {
      alert(error.message || 'Failed to add flow oversight option')
    } finally {
      setIsSavingLookup(false)
    }
  }

  const handleAddRestriction = async () => {
    const name = newRestrictionName.trim()
    if (!name) return
    try {
      setIsSavingLookup(true)
      const res = await fetch('/api/distribution-restriction-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to add restriction option')
      }
      const created = await res.json()
      const createdName = created.name || name
      setRestrictionOptions((prev) =>
        prev.includes(createdName) ? prev : [...prev, createdName].sort((a, b) => a.localeCompare(b))
      )
      decisionForm.setValue('restriction', createdName)
      setNewRestrictionName('')
      setAddingRestriction(false)
    } catch (error: any) {
      alert(error.message || 'Failed to add restriction option')
    } finally {
      setIsSavingLookup(false)
    }
  }

  const watchedPartner = decisionForm.watch('partner')
  const watchedDate = decisionForm.watch('decision_date')

  useEffect(() => {
    let cancelled = false
    const partner = watchedPartner?.trim()
    const date = watchedDate?.trim()
    if (!partner || !date) {
      setPreviewDecisionId(null)
      return
    }

    const t = setTimeout(async () => {
      try {
        setIsPreviewingId(true)
        const params = new URLSearchParams({ partner, date })
        const res = await fetch(`/api/distribution-decisions/next-id?${params}`)
        if (!res.ok) {
          if (!cancelled) setPreviewDecisionId(null)
          return
        }
        const data = await res.json()
        if (!cancelled) {
          const id = typeof data.decision_id_proposed === 'string' ? data.decision_id_proposed : null
          setPreviewDecisionId(id)
          if (id) decisionForm.setValue('decision_id_proposed', id)
        }
      } catch {
        if (!cancelled) setPreviewDecisionId(null)
      } finally {
        if (!cancelled) setIsPreviewingId(false)
      }
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [watchedPartner, watchedDate, decisionForm])

  const handleCreateDecision = async (values: z.infer<typeof decisionSchema>) => {
    try {
      if (!values.partner?.trim() || !values.decision_date?.trim()) {
        alert('Partner and Decision Date are required to generate the Decision ID')
        return
      }

      const decisionId = previewDecisionId || values.decision_id_proposed || ''
      const filesToUpload: File[] = useCsvUpload
        ? [...(csvFile ? [csvFile] : []), ...extraCreateFiles]
        : [...manualFiles]

      const documents: Array<{ file_name: string; file_link: string }> = []
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i]
        const fileLink = await uploadFileToStorage(file, `${decisionId || 'decision'}-${i}`)
        documents.push({ file_name: file.name, file_link: fileLink })
      }

      const payload = {
        ...values,
        documents,
      }
      const res = await fetch('/api/distribution-decisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create decision')
      }
      
      const createdDecision = await res.json()
      const decisionKey = createdDecision.decision_id_proposed || createdDecision.decision_id
      
      // If CSV was used, automatically add allocations
      if (useCsvUpload && csvFile && allocRows.length > 0) {
        try {
          const validRows = validPendingAllocRows(allocRows)
          
          if (validRows.length > 0) {
            const allocRes = await fetch(`/api/distribution-decisions/${decisionKey}/allocations`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ allocations: validRows }),
            })
            
            if (!allocRes.ok) {
              const allocErr = await allocRes.json()
              console.error('Failed to add allocations:', allocErr)
            }
          }
        } catch (allocError) {
          console.error('Error adding allocations:', allocError)
        }
      }
      
      setIsCreateOpen(false)
      decisionForm.reset()
      setUseCsvUpload(false)
      setCsvFile(null)
      setManualFiles([])
      setExtraCreateFiles([])
      setAllocRows([])
      setPreviewDecisionId(null)
      fetchDecisions()
    } catch (error: any) {
      console.error(error)
      alert(error.message || 'Failed to create decision')
    }
  }

  const handleDeleteClick = (decisionKey: string) => {
    setDecisionToDelete(decisionKey)
    setDeleteConfirmOpen(true)
    setDeleteConfirmText('')
  }

  const handleDeleteConfirm = async () => {
    if (deleteConfirmText !== 'Confirm') {
      alert('Please type "Confirm" to delete this distribution decision')
      return
    }

    if (!decisionToDelete) return

    await handleDeleteDecision(decisionToDelete)
    setDeleteConfirmOpen(false)
    setDeleteConfirmText('')
    setDecisionToDelete(null)
  }

  const handleDeleteDecision = async (decisionKey: string) => {
    try {
      setIsDeleting((prev) => ({ ...prev, [decisionKey]: true }))
      // Trim the decisionKey to remove any whitespace before sending to API
      const trimmedKey = decisionKey.trim()
      const res = await fetch(`/api/distribution-decisions/${encodeURIComponent(trimmedKey)}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to delete decision')
      }
      setExpandedDecisionId(null)
      setExpandedDecisionKey(null)
      fetchDecisions()
    } catch (error: any) {
      console.error('[DD] delete error', error)
      alert(error.message || 'Failed to delete decision')
    } finally {
      setIsDeleting((prev) => ({ ...prev, [decisionKey]: false }))
    }
  }

  const fetchAllocations = async (decisionId: string) => {
    try {
      setIsAllocLoading((prev) => ({ ...prev, [decisionId]: true }))
      const res = await fetch(`/api/distribution-decisions/${decisionId}/allocations`)
      if (!res.ok) throw new Error('Failed to load allocations')
      const data = await res.json()
      setAllocationsByDecision((prev) => ({ ...prev, [decisionId]: data || [] }))
    } catch (error) {
      alert('Failed to load allocations')
    } finally {
      setIsAllocLoading((prev) => ({ ...prev, [decisionId]: false }))
    }
  }

  const handleAddAllocation = async (decisionKey: string) => {
    const validRows = validPendingAllocRows(allocRows)

    if (validRows.length === 0) return

    try {
      const res = await fetch(`/api/distribution-decisions/${decisionKey}/allocations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allocations: validRows }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to add allocation')
      }
      setAllocRows([])
      fetchAllocations(decisionKey)
      fetchDecisions()
    } catch (error: any) {
      alert(error.message || 'Failed to add allocation')
    }
  }

  const toggleExpanded = (rowId: string, decisionKey: string) => {
    if (expandedDecisionId === rowId) {
      setExpandedDecisionId(null)
      setExpandedDecisionKey(null)
      setAllocRows([])
      return
    }
    setExpandedDecisionId(rowId)
    setExpandedDecisionKey(decisionKey)
    setAllocRows([])
    if (!allocationsByDecision[decisionKey]) {
      fetchAllocations(decisionKey)
    }
  }

  const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) return '—'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
  }

  // Map CSV state names to system state names
  const mapCsvStateToSystemState = (csvState: string): string | null => {
    if (!csvState) return null
    const normalized = String(csvState).trim()
    
    const mapping: Record<string, string> = {
      'Khartoum': 'Khartoum',
      'North Darfur': 'North Darfur',
      'South Darfur': 'South Darfur',
      'East Darfur': 'East Darfur',
      'Central Darfur': 'Central Darfur',
      'West Darfur': 'West Darfur',
      'Kassala': 'Kassala',
      'Al Jazeera': 'Al Jazirah', // Normalize to Al Jazirah (states table spelling)
      'Sennar': 'Sennar',
      'North Kordofan': 'North Kordofan',
      'South Kordofan': 'South Kordofan',
      'West Kordofan': 'West Kordofan',
      'River Nile': 'River Nile',
      'Blue Nile': 'Blue Nile'
    }
    
    return mapping[normalized] || normalized
  }

  // Helper function to parse currency values (removes $, commas, and converts to number)
  const parseCurrency = (value: any): number => {
    if (!value) return 0
    const str = String(value).trim()
    // Remove $, commas, and any whitespace
    const cleaned = str.replace(/[$,\s]/g, '')
    const num = Number(cleaned)
    return isNaN(num) ? 0 : num
  }

  const parseCsvFile = async (file: File): Promise<{ totalAmount: number | null; allocations: Array<{ state: string; amount: number }> }> => {
    const ext = file.name.split('.').pop()?.toLowerCase()
    
    if (ext === 'csv') {
      return new Promise((resolve, reject) => {
        Papa.parse(file, {
          complete: (results: any) => {
            try {
              const data = results.data as any[][]
              // B2 = row index 1, column index 1 (0-based: row 2, col B)
              let totalAmount: number | null = null
              if (data[1]?.[1]) {
                totalAmount = parseCurrency(data[1][1])
              }
              
              // C3:P3 = row index 2, columns C-P (indices 2-15, 0-based)
              const stateNames = (data[2]?.slice(2, 16) || []).map((s: any) => String(s || '').trim())
              
              // C36:P36 = row index 35, columns C-P (indices 2-15, 0-based)
              const amounts = (data[35]?.slice(2, 16) || []).map((a: any) => {
                return parseCurrency(a)
              })
              
              const allocations = stateNames
                .map((stateName, idx) => {
                  const systemState = mapCsvStateToSystemState(stateName)
                  const amount = amounts[idx] || 0
                  return { state: systemState, amount }
                })
                .filter((a): a is { state: string; amount: number } => Boolean(a.state) && a.amount > 0)
              
              resolve({ totalAmount, allocations })
            } catch (error) {
              reject(error)
            }
          },
          error: reject
        })
      })
    } else if (ext === 'xlsx' || ext === 'xls') {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      
      // B2 = cell B2
      const totalAmount = sheet['B2']?.v ? parseCurrency(sheet['B2'].v) : null
      
      // C3:P3 and C36:P36
      const stateNames: string[] = []
      const amounts: number[] = []
      
      // Excel columns: A=1, B=2, C=3, ..., P=16
      const colLetters = ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P']
      
      for (const colLetter of colLetters) {
        const stateName = sheet[`${colLetter}3`]?.v ? String(sheet[`${colLetter}3`].v).trim() : ''
        const amount = sheet[`${colLetter}36`]?.v ? parseCurrency(sheet[`${colLetter}36`].v) : 0
        stateNames.push(stateName)
        amounts.push(amount)
      }
      
      const allocations = stateNames
        .map((stateName, idx) => {
          const systemState = mapCsvStateToSystemState(stateName)
          const amount = amounts[idx] || 0
          return { state: systemState, amount }
        })
        .filter((a): a is { state: string; amount: number } => Boolean(a.state) && a.amount > 0)
      
      return { totalAmount, allocations }
    } else {
      throw new Error('Unsupported file format. Please upload CSV or Excel file.')
    }
  }

  const handleCsvFileSelect = async (file: File | null) => {
    if (!file) {
      setCsvFile(null)
      return
    }
    
    setIsParsingCsv(true)
    try {
      const { totalAmount, allocations } = await parseCsvFile(file)
      
      // Set decision amount if empty
      if (totalAmount && !decisionForm.getValues('decision_amount')) {
        decisionForm.setValue('decision_amount', totalAmount)
      }
      
      // Populate allocation rows
      if (allocations.length > 0) {
        const rows = allocations.map(a => ({
          state: a.state || '',
          amount: a.amount.toString()
        }))
        setAllocRows(rows)
        setCsvFile(file)
      } else {
        alert('No valid allocations found in the CSV file.')
        setCsvFile(null)
      }
    } catch (error: any) {
      alert(error.message || 'Failed to parse CSV file. Please check the file format.')
      setCsvFile(null)
    } finally {
      setIsParsingCsv(false)
    }
  }

  const uploadFileToStorage = async (file: File, decisionId: string): Promise<string> => {
    const fileExt = file.name.split('.').pop()
    // Add timestamp to make filename unique and prevent overwriting
    const timestamp = Date.now()
    const fileName = `${decisionId}-${timestamp}.${fileExt}`
    const filePath = `f0-distribution-decisions/${fileName}`
    
    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(filePath, file, {
        cacheControl: '3600'
        // Removed upsert: true to prevent overwriting existing files
      })
    
    if (uploadError) {
      throw uploadError
    }
    
    return filePath
  }

  const handleViewDecisionDocument = async (decisionId: string, doc: DecisionDocument) => {
    if (!doc.file_link) return
    const openKey = `${decisionId}:${doc.id}`
    try {
      setIsOpeningDoc((prev) => ({ ...prev, [openKey]: true }))
      const url = await resolveDecisionDocumentUrl(doc.file_link)
      if (!url) {
        alert('Could not open decision document')
        return
      }
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error: any) {
      console.error(error)
      alert(error.message || 'Failed to open decision document')
    } finally {
      setIsOpeningDoc((prev) => ({ ...prev, [openKey]: false }))
    }
  }

  const handleAddDecisionDocuments = async (decision: Decision, files: FileList | File[] | null) => {
    const list = files ? Array.from(files) : []
    if (list.length === 0) return
    const fetchKey = decision.decision_id_proposed || decision.decision_id || decision.id
    try {
      setIsUploadingDoc((prev) => ({ ...prev, [decision.id]: true }))
      const add_documents: Array<{ file_name: string; file_link: string }> = []
      for (let i = 0; i < list.length; i++) {
        const file = list[i]
        const fileLink = await uploadFileToStorage(file, `${fetchKey}-${i}`)
        add_documents.push({ file_name: file.name, file_link: fileLink })
      }
      const res = await fetch(`/api/distribution-decisions/${encodeURIComponent(fetchKey.trim())}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ add_documents }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to add decision documents')
      }
      const updated = await res.json()
      setDecisions((prev) =>
        prev.map((d) =>
          d.id === decision.id
            ? {
                ...d,
                file_name: updated.file_name ?? d.file_name,
                file_link: updated.file_link ?? d.file_link,
                documents: updated.documents ?? d.documents,
              }
            : d
        )
      )
    } catch (error: any) {
      console.error(error)
      alert(error.message || 'Failed to upload decision documents')
    } finally {
      setIsUploadingDoc((prev) => ({ ...prev, [decision.id]: false }))
    }
  }

  const handleRemoveDecisionDocument = async (decision: Decision, documentId: string) => {
    const fetchKey = decision.decision_id_proposed || decision.decision_id || decision.id
    try {
      setIsUploadingDoc((prev) => ({ ...prev, [decision.id]: true }))
      const res = await fetch(`/api/distribution-decisions/${encodeURIComponent(fetchKey.trim())}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remove_document_ids: [documentId] }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to remove decision document')
      }
      const updated = await res.json()
      setDecisions((prev) =>
        prev.map((d) =>
          d.id === decision.id
            ? {
                ...d,
                file_name: updated.file_name ?? null,
                file_link: updated.file_link ?? null,
                documents: updated.documents ?? [],
              }
            : d
        )
      )
    } catch (error: any) {
      console.error(error)
      alert(error.message || 'Failed to remove decision document')
    } finally {
      setIsUploadingDoc((prev) => ({ ...prev, [decision.id]: false }))
    }
  }

  const sortedDecisions = useMemo(() => {
    return [...decisions].sort((a, b) => {
      const hasA = Boolean(a.decision_date)
      const hasB = Boolean(b.decision_date)
      if (!hasA && !hasB) return 0
      if (!hasA) return 1
      if (!hasB) return -1
      const da = new Date(a.decision_date!).getTime()
      const db = new Date(b.decision_date!).getTime()
      return dateSortOrder === 'desc' ? db - da : da - db
    })
  }, [decisions, dateSortOrder])

  const totalPages = Math.ceil(sortedDecisions.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedDecisions = sortedDecisions.slice(startIndex, endIndex)

  // Reset to page 1 when decisions change or sort order changes
  useEffect(() => {
    setCurrentPage(1)
  }, [decisions.length, dateSortOrder])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle 
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            <FileText className="h-5 w-5" />
            Distribution Decisions
            {isCollapsed && decisions.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground ml-2">
                ({decisions.length} {decisions.length === 1 ? 'decision' : 'decisions'})
              </span>
            )}
            {isCollapsed ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </CardTitle>
          {!isCollapsed && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={fetchDecisions} disabled={isLoading}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            {(currentUser?.role === 'support' || currentUser?.role === 'admin' || currentUser?.role === 'superadmin') && (
              <Dialog open={isCreateOpen} onOpenChange={(open) => {
                setIsCreateOpen(open)
                if (!open) {
                  // Reset form and file states when closing
                  decisionForm.reset()
                  setUseCsvUpload(false)
                  setCsvFile(null)
                  setManualFiles([])
                  setExtraCreateFiles([])
                  setAllocRows([])
                  setAddingPartner(false)
                  setNewPartnerName('')
                  setAddingDecisionMaker(false)
                  setNewDecisionMakerName('')
                  setAddingFlowOversight(false)
                  setNewFlowOversightName('')
                  setAddingRestriction(false)
                  setNewRestrictionName('')
                }
              }}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    New Decision
                  </Button>
                </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create Distribution Decision</DialogTitle>
                </DialogHeader>
                <Form {...decisionForm}>
                  <form className="space-y-2" onSubmit={decisionForm.handleSubmit(handleCreateDecision)}>
                    {/* Allocation Input Method - Moved to top */}
                    <div className="space-y-1.5">
                      <FormLabel className="text-sm">Allocation Input Method</FormLabel>
                      <Tabs 
                        value={useCsvUpload ? 'csv' : 'manual'} 
                        onValueChange={(value) => {
                          const isCsv = value === 'csv'
                          setUseCsvUpload(isCsv)
                          if (isCsv) {
                            setManualFiles([])
                          } else {
                            setCsvFile(null)
                            setExtraCreateFiles([])
                            setAllocRows([])
                          }
                        }}
                        className="w-full"
                      >
                        <TabsList className="grid w-full grid-cols-2 h-8">
                          <TabsTrigger value="manual" className="text-xs">Manual Entry</TabsTrigger>
                          <TabsTrigger value="csv" className="text-xs">Upload CSV/Excel</TabsTrigger>
                        </TabsList>
                        
                        <TabsContent value="csv" className="mt-2">
                          <div className="space-y-2 p-2.5 border rounded-md">
                            <div className="space-y-1">
                              <FormLabel className="text-sm">Upload CSV/Excel File</FormLabel>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="file"
                                  accept=".csv,.xlsx,.xls"
                                  className="h-8 text-xs"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0] || null
                                    handleCsvFileSelect(file)
                                  }}
                                  disabled={isParsingCsv}
                                />
                                {isParsingCsv && (
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                )}
                              </div>
                              {csvFile && (
                                <div className="text-xs text-muted-foreground flex items-center gap-2">
                                  <FileSpreadsheet className="h-3.5 w-3.5" />
                                  {csvFile.name}
                                </div>
                              )}
                              <p className="text-[11px] text-muted-foreground">
                                B2 = Total Amount, C3:P3 = States, C36:P36 = Amounts. File is also stored as a document.
                              </p>
                            </div>
                            <div className="space-y-1">
                              <FormLabel className="text-sm">Additional documents (optional)</FormLabel>
                              <Input
                                type="file"
                                accept=".csv,.xlsx,.xls,.pdf"
                                multiple
                                className="h-8 text-xs"
                                onChange={(e) => {
                                  setExtraCreateFiles(Array.from(e.target.files || []))
                                }}
                              />
                              {extraCreateFiles.length > 0 && (
                                <ul className="text-xs text-muted-foreground space-y-0.5">
                                  {extraCreateFiles.map((f) => (
                                    <li key={f.name} className="flex items-center gap-1">
                                      <Upload className="h-3 w-3" />
                                      {f.name}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        </TabsContent>
                        
                        <TabsContent value="manual" className="mt-2">
                          <div className="space-y-1">
                            <FormLabel className="text-sm">Decision documents (optional)</FormLabel>
                            <Input
                              type="file"
                              accept=".csv,.xlsx,.xls,.pdf"
                              multiple
                              className="h-8 text-xs"
                              onChange={(e) => {
                                setManualFiles(Array.from(e.target.files || []))
                              }}
                            />
                            {manualFiles.length > 0 && (
                              <ul className="text-xs text-muted-foreground space-y-0.5">
                                {manualFiles.map((f) => (
                                  <li key={f.name} className="flex items-center gap-1.5">
                                    <Upload className="h-3.5 w-3.5" />
                                    {f.name}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </TabsContent>
                      </Tabs>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-1.5">
                      <FormField
                        control={decisionForm.control}
                        name="decision_amount"
                        render={({ field }) => (
                          <FormItem className="gap-0.5">
                            <FormLabel className="text-xs">Decision Amount *</FormLabel>
                            <FormControl>
                              <Input type="number" className="h-8" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={decisionForm.control}
                        name="decision_date"
                        render={({ field }) => (
                          <FormItem className="gap-0.5">
                            <FormLabel className="text-xs">Decision Date *</FormLabel>
                            <FormControl>
                              <Input type="date" className="h-8" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-1.5">
                      <FormField
                        control={decisionForm.control}
                        name="partner"
                        render={({ field }) => (
                          <FormItem className="gap-0.5">
                            <FormLabel className="text-xs">Partner *</FormLabel>
                            {addingPartner ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  value={newPartnerName}
                                  onChange={(e) => setNewPartnerName(e.target.value)}
                                  placeholder="New partner name"
                                  className="h-8"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault()
                                      handleAddOpsPartner()
                                    }
                                    if (e.key === 'Escape') {
                                      setAddingPartner(false)
                                      setNewPartnerName('')
                                    }
                                  }}
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-8"
                                  disabled={isSavingLookup || !newPartnerName.trim()}
                                  onClick={handleAddOpsPartner}
                                >
                                  Save
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    setAddingPartner(false)
                                    setNewPartnerName('')
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <Select
                                  value={field.value || undefined}
                                  onValueChange={field.onChange}
                                >
                                  <FormControl>
                                    <SelectTrigger size="sm" className="h-8 w-full">
                                      <SelectValue placeholder="Select partner" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {opsPartnerOptions.map((name) => (
                                      <SelectItem key={name} value={name}>
                                        {name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 shrink-0"
                                  title="Add partner"
                                  onClick={() => setAddingPartner(true)}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={decisionForm.control}
                        name="decision_maker"
                        render={({ field }) => (
                          <FormItem className="gap-0.5">
                            <FormLabel className="text-xs">Decision Maker</FormLabel>
                            {addingDecisionMaker ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  value={newDecisionMakerName}
                                  onChange={(e) => setNewDecisionMakerName(e.target.value)}
                                  placeholder="New decision maker"
                                  className="h-8"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault()
                                      handleAddDecisionMaker()
                                    }
                                    if (e.key === 'Escape') {
                                      setAddingDecisionMaker(false)
                                      setNewDecisionMakerName('')
                                    }
                                  }}
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-8"
                                  disabled={isSavingLookup || !newDecisionMakerName.trim()}
                                  onClick={handleAddDecisionMaker}
                                >
                                  Save
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    setAddingDecisionMaker(false)
                                    setNewDecisionMakerName('')
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <Select
                                  value={field.value || undefined}
                                  onValueChange={field.onChange}
                                >
                                  <FormControl>
                                    <SelectTrigger size="sm" className="h-8 w-full">
                                      <SelectValue placeholder="Select decision maker" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {decisionMakerOptions.map((name) => (
                                      <SelectItem key={name} value={name}>
                                        {name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 shrink-0"
                                  title="Add decision maker"
                                  onClick={() => setAddingDecisionMaker(true)}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={decisionForm.control}
                        name="flow_oversight"
                        render={({ field }) => (
                          <FormItem className="gap-0.5">
                            <FormLabel className="text-xs">Flow Oversight</FormLabel>
                            {addingFlowOversight ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  value={newFlowOversightName}
                                  onChange={(e) => setNewFlowOversightName(e.target.value)}
                                  placeholder="New flow oversight"
                                  className="h-8"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault()
                                      handleAddFlowOversight()
                                    }
                                    if (e.key === 'Escape') {
                                      setAddingFlowOversight(false)
                                      setNewFlowOversightName('')
                                    }
                                  }}
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-8"
                                  disabled={isSavingLookup || !newFlowOversightName.trim()}
                                  onClick={handleAddFlowOversight}
                                >
                                  Save
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    setAddingFlowOversight(false)
                                    setNewFlowOversightName('')
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <Select
                                  value={field.value || undefined}
                                  onValueChange={field.onChange}
                                >
                                  <FormControl>
                                    <SelectTrigger size="sm" className="h-8 w-full">
                                      <SelectValue placeholder="Select flow oversight" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {flowOversightOptions.map((name) => (
                                      <SelectItem key={name} value={name}>
                                        {name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 shrink-0"
                                  title="Add flow oversight"
                                  onClick={() => setAddingFlowOversight(true)}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={decisionForm.control}
                        name="restriction"
                        render={({ field }) => (
                          <FormItem className="gap-0.5">
                            <FormLabel className="text-xs">Restriction</FormLabel>
                            {addingRestriction ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  value={newRestrictionName}
                                  onChange={(e) => setNewRestrictionName(e.target.value)}
                                  placeholder="New restriction"
                                  className="h-8"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault()
                                      handleAddRestriction()
                                    }
                                    if (e.key === 'Escape') {
                                      setAddingRestriction(false)
                                      setNewRestrictionName('')
                                    }
                                  }}
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-8"
                                  disabled={isSavingLookup || !newRestrictionName.trim()}
                                  onClick={handleAddRestriction}
                                >
                                  Save
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    setAddingRestriction(false)
                                    setNewRestrictionName('')
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <Select
                                  value={field.value || undefined}
                                  onValueChange={field.onChange}
                                >
                                  <FormControl>
                                    <SelectTrigger size="sm" className="h-8 w-full">
                                      <SelectValue placeholder="Select restriction" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {restrictionOptions.map((name) => (
                                      <SelectItem key={name} value={name}>
                                        {name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 shrink-0"
                                  title="Add restriction"
                                  onClick={() => setAddingRestriction(true)}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="space-y-0.5">
                      <FormLabel className="text-xs">Decision ID (auto)</FormLabel>
                      <div className="h-8 px-2.5 rounded-md border bg-muted/40 flex items-center text-xs font-mono">
                        {isPreviewingId ? (
                          <span className="text-muted-foreground flex items-center gap-1.5">
                            <RefreshCw className="h-3 w-3 animate-spin" />
                            Generating…
                          </span>
                        ) : previewDecisionId ? (
                          previewDecisionId
                        ) : (
                          <span className="text-muted-foreground">
                            Select partner and date to generate (LCC.AD.Partner.YY-MM-DD-N)
                          </span>
                        )}
                      </div>
                    </div>

                    <FormField
                      control={decisionForm.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem className="gap-0.5">
                          <FormLabel className="text-xs">Notes</FormLabel>
                          <FormControl>
                            <Textarea rows={2} className="text-sm" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex justify-end gap-2 pt-1">
                      <Button 
                        variant="outline" 
                        type="button"
                        size="sm"
                        onClick={() => {
                          setIsCreateOpen(false)
                          decisionForm.reset()
                          setUseCsvUpload(false)
                          setCsvFile(null)
                          setManualFiles([])
                          setExtraCreateFiles([])
                          setAllocRows([])
                          setAddingPartner(false)
                          setNewPartnerName('')
                          setAddingDecisionMaker(false)
                          setNewDecisionMakerName('')
                          setAddingFlowOversight(false)
                          setNewFlowOversightName('')
                          setAddingRestriction(false)
                          setNewRestrictionName('')
                          setPreviewDecisionId(null)
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        size="sm"
                        disabled={
                          (useCsvUpload && !csvFile) ||
                          !watchedPartner ||
                          !watchedDate ||
                          !previewDecisionId
                        }
                      >
                        Create
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
            )}
          </div>
          )}
        </div>
      </CardHeader>
      {!isCollapsed && (
        <CardContent>
        {isLoading ? (
          <div className="py-6 text-center text-muted-foreground">Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="text-xs [&_th]:py-1.5 [&_th]:px-2 [&_td]:py-1 [&_td]:px-2">
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <TableHead>Decision ID</TableHead>
                  <TableHead>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 font-medium hover:text-foreground"
                      onClick={() => setDateSortOrder((order) => (order === 'desc' ? 'asc' : 'desc'))}
                    >
                      Date
                      {dateSortOrder === 'desc' ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronUp className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </TableHead>
                  <TableHead>Decision amount</TableHead>
                  <TableHead>Allocated</TableHead>
                  <TableHead>Remaining</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Restriction</TableHead>
                  <TableHead className="min-w-[200px]">Notes</TableHead>
                  <TableHead className="min-w-[140px]">Decision Documents</TableHead>
                  <TableHead className="w-[60px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedDecisions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-muted-foreground py-4">
                      No distribution decisions found
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedDecisions.map((decision) => {
                    const allocated = decision.sum_allocation_amount || 0
                    const displayId = decision.decision_id_proposed || decision.decision_id || '—'
                    const fetchKey = decision.decision_id_proposed || decision.decision_id || decision.id
                    const remaining =
                      decision.decision_amount !== null && decision.decision_amount !== undefined
                        ? decision.decision_amount - allocated
                        : null
                    const isOpen = expandedDecisionId === decision.id
                    const docs = decisionDocuments(decision)
                    const hasDoc = docs.length > 0
                    const primaryDoc = docs[0]
                    return (
                      <React.Fragment key={decision.id}>
                        <TableRow>
                          <TableCell className="w-10 py-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleExpanded(decision.id, fetchKey)}>
                              {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                          </TableCell>
                          <TableCell className="font-medium">{displayId}</TableCell>
                          <TableCell>{decision.decision_date ? new Date(decision.decision_date).toLocaleDateString() : '—'}</TableCell>
                          <TableCell>{formatCurrency(decision.decision_amount)}</TableCell>
                          <TableCell className="text-green-700">{formatCurrency(allocated)}</TableCell>
                          <TableCell className="text-orange-700">{formatCurrency(remaining)}</TableCell>
                          <TableCell>{decision.partner || '—'}</TableCell>
                          <TableCell>
                            {decision.restriction ? (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{decision.restriction}</Badge>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell>
                            <NotesCallout notes={decision.notes} />
                          </TableCell>
                          <TableCell>
                            {hasDoc && primaryDoc ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 max-w-[160px]"
                                onClick={() => handleViewDecisionDocument(decision.id, primaryDoc)}
                                disabled={isOpeningDoc[`${decision.id}:${primaryDoc.id}`]}
                                title={
                                  docs.length > 1
                                    ? `${docs.length} documents — open first`
                                    : primaryDoc.file_name || primaryDoc.file_link
                                }
                              >
                                {isOpeningDoc[`${decision.id}:${primaryDoc.id}`] ? (
                                  <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" />
                                ) : isExternalDecisionDocLink(primaryDoc.file_link) ? (
                                  <ExternalLink className="h-3.5 w-3.5 mr-1 shrink-0" />
                                ) : (
                                  <Eye className="h-3.5 w-3.5 mr-1 shrink-0" />
                                )}
                                <span className="truncate text-xs">
                                  {docs.length > 1
                                    ? `${docs.length} files`
                                    : primaryDoc.file_name || 'View'}
                                </span>
                              </Button>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {(currentUser?.role === 'support' || currentUser?.role === 'admin' || currentUser?.role === 'superadmin') && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive/80"
                                onClick={() => handleDeleteClick(fetchKey)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow>
                            <TableCell colSpan={11} className="bg-muted/40 py-2 px-2">
                              <div className="space-y-4">
                                <div className="space-y-1.5">
                                  <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <span className="font-medium text-muted-foreground shrink-0">
                                      Documents{docs.length ? ` (${docs.length})` : ''}:
                                    </span>
                                    {!hasDoc && (
                                      <span className="text-muted-foreground">None</span>
                                    )}
                                    {canEditAllocations && (
                                      <>
                                        <input
                                          id={`decision-doc-${decision.id}`}
                                          type="file"
                                          accept=".csv,.xlsx,.xls,.pdf"
                                          multiple
                                          className="sr-only"
                                          disabled={isUploadingDoc[decision.id]}
                                          onChange={(e) => {
                                            handleAddDecisionDocuments(decision, e.target.files)
                                            e.target.value = ''
                                          }}
                                        />
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-6 px-2 text-xs"
                                          disabled={isUploadingDoc[decision.id]}
                                          onClick={() =>
                                            document.getElementById(`decision-doc-${decision.id}`)?.click()
                                          }
                                        >
                                          {isUploadingDoc[decision.id] ? (
                                            <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                                          ) : (
                                            <Upload className="h-3 w-3 mr-1" />
                                          )}
                                          Add
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                  {docs.map((doc) => {
                                    const openKey = `${decision.id}:${doc.id}`
                                    return (
                                      <div
                                        key={doc.id}
                                        className="flex flex-wrap items-center gap-1.5 text-xs pl-1"
                                      >
                                        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                        <span className="truncate max-w-[220px]" title={doc.file_name}>
                                          {doc.file_name || 'Attached'}
                                        </span>
                                        {isExternalDecisionDocLink(doc.file_link) && (
                                          <Badge variant="outline" className="text-[10px] px-1 py-0 h-5">
                                            External
                                          </Badge>
                                        )}
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 px-1.5"
                                          onClick={() => handleViewDecisionDocument(decision.id, doc)}
                                          disabled={isOpeningDoc[openKey]}
                                        >
                                          {isOpeningDoc[openKey] ? (
                                            <RefreshCw className="h-3 w-3 animate-spin" />
                                          ) : (
                                            <Eye className="h-3 w-3" />
                                          )}
                                          <span className="ml-1">View</span>
                                        </Button>
                                        {canEditAllocations && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 px-1.5 text-destructive hover:text-destructive"
                                            disabled={isUploadingDoc[decision.id]}
                                            onClick={() => handleRemoveDecisionDocument(decision, doc.id)}
                                          >
                                            <X className="h-3 w-3" />
                                            <span className="ml-1">Remove</span>
                                          </Button>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                                <div className="flex items-center justify-between">
                                  <div className="font-semibold">State Allocations</div>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => fetchAllocations(fetchKey)}
                                    disabled={isAllocLoading[fetchKey]}
                                  >
                                    <RefreshCw className="h-4 w-4 mr-2" />
                                    Refresh
                                  </Button>
                                </div>
                                {remaining != null && remaining > 0 && (
                                  <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sky-950 text-xs leading-snug">
                                    <p>
                                      Decision amount{' '}
                                      <span className="font-semibold">{formatCurrency(decision.decision_amount)}</span>
                                      {' '}· allocated{' '}
                                      <span className="font-semibold">{formatCurrency(allocated)}</span>
                                      {' '}· remaining to allocate{' '}
                                      <span className="font-semibold">{formatCurrency(remaining)}</span>.
                                    </p>
                                    <p className="mt-0.5 text-sky-900/80">
                                      You can add more state allocations below until they total the decision amount (e.g. later funding tranches).
                                    </p>
                                  </div>
                                )}
                                {remaining != null && remaining < 0 && (
                                  <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950 text-xs">
                                    Allocations exceed the decision amount by{' '}
                                    <span className="font-semibold">{formatCurrency(Math.abs(remaining))}</span>.
                                  </div>
                                )}
                                {isAllocLoading[fetchKey] ? (
                                  <div className="text-muted-foreground">Loading allocations...</div>
                                ) : (
                                  <div className="space-y-2">
                                    {(() => {
                                      const rows = allocationsByDecision[fetchKey] || []
                                      const flagged = rows.filter((a) => hasReviewNote(a.notes))
                                      if (!flagged.length && !hasReviewNote(decision.notes)) return null
                                      return (
                                        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950 text-xs space-y-1">
                                          {hasReviewNote(decision.notes) && (
                                            <p className="font-medium">{displayNoteLines(decision.notes).join(' · ')}</p>
                                          )}
                                          {flagged.length > 0 ? (
                                            <ul className="list-disc pl-4 space-y-1">
                                              {flagged.map((a) => (
                                                <li key={a.allocation_id}>
                                                  <span className="font-medium">
                                                    {a.state || '—'}
                                                  </span>
                                                  <span className="text-amber-900/70">
                                                    {' '}
                                                    ({a.allocation_id})
                                                  </span>
                                                  {displayNoteLines(a.notes).map((line) => (
                                                    <div key={line} className="font-normal">
                                                      {line}
                                                    </div>
                                                  ))}
                                                </li>
                                              ))}
                                            </ul>
                                          ) : (
                                            <p className="text-amber-900/80">
                                              No specific allocation is flagged yet — expand Notes below or mark the mismatched state row.
                                            </p>
                                          )}
                                        </div>
                                      )
                                    })()}
                                    <Table className="text-xs [&_th]:py-1 [&_th]:px-2 [&_td]:py-0.5 [&_td]:px-2">
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Allocation ID</TableHead>
                                          <TableHead>State</TableHead>
                                          <TableHead className="text-right">Amount</TableHead>
                                          <TableHead className="text-right">% of Decision</TableHead>
                                          <TableHead className="min-w-[220px]">Notes</TableHead>
                                          <TableHead className="w-[140px] text-right"></TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {(allocationsByDecision[fetchKey] || []).length === 0 ? (
                                          <TableRow>
                                            <TableCell colSpan={6} className="text-muted-foreground text-sm">
                                              No allocations yet
                                            </TableCell>
                                          </TableRow>
                                        ) : (
                                          <>
                                            {(allocationsByDecision[fetchKey] || []).map((alloc) => {
                                              const isEditing = editingAllocation === alloc.allocation_id
                                              const flagged = hasReviewNote(alloc.notes)
                                              return (
                                                <TableRow
                                                  key={alloc.allocation_id}
                                                  className={flagged ? 'bg-amber-50/90 border-l-2 border-l-amber-500' : undefined}
                                                >
                                                  <TableCell className="font-mono text-[10px] max-w-[160px] truncate" title={alloc.allocation_id}>
                                                    {alloc.allocation_id}
                                                  </TableCell>
                                                  <TableCell className="font-medium">
                                                    {isEditing ? (
                                                      <Select
                                                        value={editAllocationState}
                                                        onValueChange={setEditAllocationState}
                                                      >
                                                        <SelectTrigger className="w-full">
                                                          <SelectValue placeholder="Select state" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                          {stateOptions.map((s) => (
                                                            <SelectItem key={s} value={s}>
                                                              {s}
                                                            </SelectItem>
                                                          ))}
                                                        </SelectContent>
                                                      </Select>
                                                    ) : (
                                                      alloc.state || '—'
                                                    )}
                                                  </TableCell>
                                                  <TableCell className="text-right">
                                                    {isEditing ? (
                                                      <Input
                                                        type="number"
                                                        value={editAllocationAmount}
                                                        onChange={(e) => setEditAllocationAmount(e.target.value)}
                                                        className="w-32 ml-auto"
                                                      />
                                                    ) : (
                                                      formatCurrency(alloc.amount)
                                                    )}
                                                  </TableCell>
                                                  <TableCell className="text-right">
                                                    {isEditing ? (
                                                      editAllocationAmount && decision.decision_amount
                                                        ? `${((Number(editAllocationAmount) / Number(decision.decision_amount)) * 100).toFixed(1)}%`
                                                        : '—'
                                                    ) : (
                                                      alloc.amount !== null && alloc.amount !== undefined && decision.decision_amount
                                                        ? `${((Number(alloc.amount) / Number(decision.decision_amount)) * 100).toFixed(1)}%`
                                                        : '—'
                                                    )}
                                                  </TableCell>
                                                  <TableCell>
                                                    <NotesCallout notes={alloc.notes} />
                                                  </TableCell>
                                                  <TableCell className="text-right">
                                                    {(currentUser?.role === 'support' || currentUser?.role === 'admin' || currentUser?.role === 'superadmin') && (
                                                      <div className="flex items-center justify-end gap-1">
                                                        {isEditing ? (
                                                          <>
                                                            <Button
                                                              variant="ghost"
                                                              size="icon"
                                                              className="h-7 w-7"
                                                              onClick={async () => {
                                                                if (!editAllocationState || !editAllocationAmount || Number(editAllocationAmount) <= 0) {
                                                                  alert('Please enter a valid state and amount')
                                                                  return
                                                                }
                                                                setIsUpdatingAllocation(true)
                                                                try {
                                                                  const res = await fetch(`/api/distribution-decisions/allocations/${alloc.allocation_id}`, {
                                                                    method: 'PUT',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify({
                                                                      state: editAllocationState,
                                                                      amount: Number(editAllocationAmount)
                                                                    })
                                                                  })
                                                                  if (!res.ok) {
                                                                    const err = await res.json()
                                                                    throw new Error(err.error || 'Failed to update allocation')
                                                                  }
                                                                  setEditingAllocation(null)
                                                                  setEditAllocationState('')
                                                                  setEditAllocationAmount('')
                                                                  fetchAllocations(fetchKey)
                                                                  fetchDecisions()
                                                                } catch (error: any) {
                                                                  alert(error.message || 'Failed to update allocation')
                                                                } finally {
                                                                  setIsUpdatingAllocation(false)
                                                                }
                                                              }}
                                                              disabled={isUpdatingAllocation}
                                                            >
                                                              <Save className="h-3 w-3" />
                                                            </Button>
                                                            <Button
                                                              variant="ghost"
                                                              size="icon"
                                                              className="h-7 w-7"
                                                              onClick={() => {
                                                                setEditingAllocation(null)
                                                                setEditAllocationState('')
                                                                setEditAllocationAmount('')
                                                              }}
                                                              disabled={isUpdatingAllocation}
                                                            >
                                                              <X className="h-3 w-3" />
                                                            </Button>
                                                          </>
                                                        ) : (
                                                          <>
                                                            <Button
                                                              variant="ghost"
                                                              size="icon"
                                                              className="h-7 w-7"
                                                              onClick={() => {
                                                                setEditingAllocation(alloc.allocation_id)
                                                                setEditAllocationState(alloc.state || '')
                                                                setEditAllocationAmount(alloc.amount?.toString() || '')
                                                              }}
                                                            >
                                                              <Pencil className="h-3 w-3" />
                                                            </Button>
                                                            <Button
                                                              variant="ghost"
                                                              size="icon"
                                                              className="h-7 w-7 text-destructive hover:text-destructive/80"
                                                              onClick={async () => {
                                                                if (!confirm(`Delete allocation for ${alloc.state || 'this state'}?`)) return
                                                                setIsDeletingAllocation(alloc.allocation_id)
                                                                try {
                                                                  const res = await fetch(`/api/distribution-decisions/allocations/${alloc.allocation_id}`, {
                                                                    method: 'DELETE'
                                                                  })
                                                                  if (!res.ok) {
                                                                    const err = await res.json()
                                                                    throw new Error(err.error || 'Failed to delete allocation')
                                                                  }
                                                                  fetchAllocations(fetchKey)
                                                                  fetchDecisions()
                                                                } catch (error: any) {
                                                                  alert(error.message || 'Failed to delete allocation')
                                                                } finally {
                                                                  setIsDeletingAllocation(null)
                                                                }
                                                              }}
                                                              disabled={isDeletingAllocation === alloc.allocation_id}
                                                            >
                                                              <Trash2 className="h-3 w-3" />
                                                            </Button>
                                                          </>
                                                        )}
                                                      </div>
                                                    )}
                                                  </TableCell>
                                                </TableRow>
                                              )
                                            })}
                                            {/* Totals Row */}
                                            {(() => {
                                              const allocations = allocationsByDecision[fetchKey] || []
                                              const totalAmount = allocations.reduce((sum, alloc) => {
                                                const amount = Number(alloc.amount) || 0
                                                return sum + amount
                                              }, 0)
                                              const totalPercent = decision.decision_amount && totalAmount
                                                ? ((totalAmount / Number(decision.decision_amount)) * 100).toFixed(1)
                                                : '—'
                                              
                                              return (
                                                <TableRow className="bg-muted/50 font-semibold">
                                                  <TableCell className="font-semibold">Total</TableCell>
                                                  <TableCell />
                                                  <TableCell className="text-right font-semibold">{formatCurrency(totalAmount)}</TableCell>
                                                  <TableCell className="text-right font-semibold">
                                                    {totalPercent !== '—' ? `${totalPercent}%` : '—'}
                                                  </TableCell>
                                                  <TableCell />
                                                  <TableCell />
                                                </TableRow>
                                              )
                                            })()}
                                          </>
                                        )}
                                        {canEditAllocations &&
                                          allocRows.map((row, idx) => (
                                          <TableRow key={`new-${idx}`}>
                                            <TableCell className="text-muted-foreground text-[10px]">New</TableCell>
                                            <TableCell>
                                              <Select
                                                value={row.state}
                                                onValueChange={(val) =>
                                                  setAllocRows((prev) =>
                                                    prev.map((r, i) => (i === idx ? { ...r, state: val } : r))
                                                  )
                                                }
                                              >
                                                <SelectTrigger className="h-8">
                                                  <SelectValue placeholder="Select state" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  {stateOptions.map((s) => (
                                                    <SelectItem key={s} value={s}>
                                                      {s}
                                                    </SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                            </TableCell>
                                            <TableCell className="text-right">
                                              <Input
                                                type="number"
                                                value={row.amount}
                                                onChange={(e) =>
                                                  setAllocRows((prev) =>
                                                    prev.map((r, i) => (i === idx ? { ...r, amount: e.target.value } : r))
                                                  )
                                                }
                                              />
                                            </TableCell>
                                            <TableCell className="text-right">—</TableCell>
                                            <TableCell />
                                            <TableCell className="text-right">
                                              <div className="flex justify-end gap-2">
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  size="sm"
                                                  onClick={() =>
                                                    allocRows.length > 1
                                                      ? setAllocRows((prev) => prev.filter((_, i) => i !== idx))
                                                      : setAllocRows([])
                                                  }
                                                >
                                                  {allocRows.length > 1 ? 'Remove' : 'Cancel'}
                                                </Button>
                                                {idx === allocRows.length - 1 && (
                                                  <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() =>
                                                      setAllocRows((prev) => [...prev, { state: '', amount: '' }])
                                                    }
                                                  >
                                                    Add row
                                                  </Button>
                                                )}
                                              </div>
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                    {canEditAllocations && (
                                      <div className="flex justify-end mt-3">
                                        {allocRows.length === 0 ? (
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-7 text-xs"
                                            onClick={() => setAllocRows([{ state: '', amount: '' }])}
                                          >
                                            <Plus className="h-3 w-3 mr-1" />
                                            Add state allocation
                                          </Button>
                                        ) : (
                                          validPendingAllocRows(allocRows).length > 0 && (
                                            <Button
                                              type="button"
                                              size="sm"
                                              className="h-7 text-xs"
                                              onClick={() => handleAddAllocation(fetchKey)}
                                            >
                                              Save allocations
                                            </Button>
                                          )
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
        {sortedDecisions.length > itemsPerPage && (
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-muted-foreground">
              Showing {startIndex + 1}-{Math.min(endIndex, sortedDecisions.length)} of {sortedDecisions.length}
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
              <div className="text-sm">
                Page {currentPage} of {totalPages}
              </div>
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
      </CardContent>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete Distribution Decision</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete this distribution decision and all its allocations? This action cannot be undone.
            </p>
            <p className="text-sm font-medium">
              Type <span className="font-bold text-destructive">Confirm</span> to proceed:
            </p>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type 'Confirm' here"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteConfirmOpen(false)
                  setDeleteConfirmText('')
                  setDecisionToDelete(null)
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteConfirm}
                disabled={deleteConfirmText !== 'Confirm'}
              >
                Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

