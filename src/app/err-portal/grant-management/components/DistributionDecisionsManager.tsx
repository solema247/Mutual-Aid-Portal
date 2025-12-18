'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Plus, ChevronDown, ChevronUp, RefreshCw, Upload, FileSpreadsheet, FileText, Pencil, Save, X, Trash2 } from 'lucide-react'
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
}

type Allocation = {
  allocation_id: string
  decision_id: string
  state: string | null
  amount: number | null
  percent_of_decision: number | null
}

const decisionSchema = z.object({
  // User enters proposed; we’ll mirror to decision_id on submit
  decision_id_proposed: z.string().min(1, 'Decision ID (proposed) is required'),
  decision_id: z.string().optional(),
  decision_amount: z.coerce.number().positive('Amount must be > 0'),
  decision_date: z.string().optional(),
  partner: z.string().optional(),
  decision_maker: z.string().optional(),
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
  const [allocRows, setAllocRows] = useState<Array<{ state: string; amount: string }>>([{ state: '', amount: '' }])
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
  const [manualFile, setManualFile] = useState<File | null>(null)
  const [isParsingCsv, setIsParsingCsv] = useState(false)
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string } | null>(null)
  const [editingAllocation, setEditingAllocation] = useState<string | null>(null)
  const [editAllocationState, setEditAllocationState] = useState<string>('')
  const [editAllocationAmount, setEditAllocationAmount] = useState<string>('')
  const [isUpdatingAllocation, setIsUpdatingAllocation] = useState(false)
  const [isDeletingAllocation, setIsDeletingAllocation] = useState<string | null>(null)

  const decisionForm = useForm<z.infer<typeof decisionSchema>>({
    resolver: zodResolver(decisionSchema),
    defaultValues: {
      decision_id_proposed: '',
      decision_id: '',
      decision_amount: 0,
      decision_date: '',
      partner: '',
      decision_maker: '',
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
        const uniques = Array.from(new Set((data || []).map((s: any) => s.state_name).filter(Boolean)))
        uniques.sort()
        setStateOptions(uniques)
      } catch (e) {
        console.error('Failed to load states', e)
      }
    }
    loadStates()
  }, [])

  const handleCreateDecision = async (values: z.infer<typeof decisionSchema>) => {
    try {
      let fileLink: string | null = null
      let fileName: string | null = null
      
      // Upload file if provided (either CSV for processing or manual file)
      const fileToUpload = useCsvUpload ? csvFile : manualFile
      if (fileToUpload) {
        const decisionId = values.decision_id_proposed || values.decision_id || ''
        fileLink = await uploadFileToStorage(fileToUpload, decisionId)
        fileName = fileToUpload.name
      }
      
      // If user only enters proposed ID, use it for both fields
      const payload = {
        ...values,
        decision_id: values.decision_id_proposed, // mirror proposed into decision_id
        file_name: fileName,
        file_link: fileLink,
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
          const validRows = allocRows
            .map(r => ({ state: r.state.trim(), amount: Number(r.amount) }))
            .filter(r => r.state && !Number.isNaN(r.amount) && r.amount > 0)
          
          if (validRows.length > 0) {
            const allocRes = await fetch(`/api/distribution-decisions/${decisionKey}/allocations`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ allocations: validRows }),
            })
            
            if (!allocRes.ok) {
              const allocErr = await allocRes.json()
              console.error('Failed to add allocations:', allocErr)
              // Don't throw - decision was created successfully
            }
          }
        } catch (allocError) {
          console.error('Error adding allocations:', allocError)
          // Don't throw - decision was created successfully
        }
      }
      
      setIsCreateOpen(false)
      decisionForm.reset()
      setUseCsvUpload(false)
      setCsvFile(null)
      setManualFile(null)
      setAllocRows([{ state: '', amount: '' }])
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
      const res = await fetch(`/api/distribution-decisions/${decisionKey}`, { method: 'DELETE' })
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
    const validRows = allocRows
      .map(r => ({ state: r.state.trim(), amount: Number(r.amount) }))
      .filter(r => r.state && !Number.isNaN(r.amount) && r.amount > 0)

    if (validRows.length === 0) {
      alert('Please add at least one allocation with State and Amount.')
      return
    }

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
      setAllocRows([{ state: '', amount: '' }])
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
      return
    }
    setExpandedDecisionId(rowId)
    setExpandedDecisionKey(decisionKey)
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
      'Al Jazirah': 'Al Jazeera', // CSV uses "Al Jazirah", system uses "Al Jazeera"
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
          complete: (results) => {
            try {
              // B2 = row index 1, column index 1 (0-based: row 2, col B)
              let totalAmount: number | null = null
              if (results.data[1]?.[1]) {
                totalAmount = parseCurrency(results.data[1][1])
              }
              
              // C3:P3 = row index 2, columns C-P (indices 2-15, 0-based)
              const stateNames = (results.data[2]?.slice(2, 16) || []).map((s: any) => String(s || '').trim())
              
              // C36:P36 = row index 35, columns C-P (indices 2-15, 0-based)
              const amounts = (results.data[35]?.slice(2, 16) || []).map((a: any) => {
                return parseCurrency(a)
              })
              
              const allocations = stateNames
                .map((stateName, idx) => {
                  const systemState = mapCsvStateToSystemState(stateName)
                  const amount = amounts[idx] || 0
                  return { state: systemState, amount }
                })
                .filter(a => a.state && a.amount > 0)
              
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
        .filter(a => a.state && a.amount > 0)
      
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
    const fileName = `${decisionId}.${fileExt}`
    const filePath = `f0-distribution-decisions/${fileName}`
    
    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true
      })
    
    if (uploadError) {
      throw uploadError
    }
    
    return filePath
  }

  const sortedDecisions = useMemo(() => {
    return [...decisions].sort((a, b) => {
      const da = a.decision_date ? new Date(a.decision_date).getTime() : 0
      const db = b.decision_date ? new Date(b.decision_date).getTime() : 0
      return db - da
    })
  }, [decisions])

  const totalPages = Math.ceil(sortedDecisions.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedDecisions = sortedDecisions.slice(startIndex, endIndex)

  // Reset to page 1 when decisions change
  useEffect(() => {
    setCurrentPage(1)
  }, [decisions.length])

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
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={fetchDecisions} disabled={isLoading}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            {currentUser?.role === 'admin' && (
              <Dialog open={isCreateOpen} onOpenChange={(open) => {
                setIsCreateOpen(open)
                if (!open) {
                  // Reset form and file states when closing
                  decisionForm.reset()
                  setUseCsvUpload(false)
                  setCsvFile(null)
                  setManualFile(null)
                  setAllocRows([{ state: '', amount: '' }])
                }
              }}>
                <DialogTrigger asChild>
                  <Button className="bg-[#007229] hover:bg-[#007229]/90 text-white">
                    <Plus className="h-4 w-4 mr-2" />
                    New Decision
                  </Button>
                </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create Distribution Decision</DialogTitle>
                </DialogHeader>
                <Form {...decisionForm}>
                  <form className="space-y-4" onSubmit={decisionForm.handleSubmit(handleCreateDecision)}>
                    {/* Allocation Input Method - Moved to top */}
                    <div className="space-y-4">
                      <FormLabel>Allocation Input Method</FormLabel>
                      <Tabs 
                        value={useCsvUpload ? 'csv' : 'manual'} 
                        onValueChange={(value) => {
                          const isCsv = value === 'csv'
                          setUseCsvUpload(isCsv)
                          if (isCsv) {
                            setManualFile(null)
                          } else {
                            setCsvFile(null)
                            setAllocRows([{ state: '', amount: '' }])
                          }
                        }}
                        className="w-full"
                      >
                        <TabsList className="grid w-full grid-cols-2">
                          <TabsTrigger value="manual">Manual Entry</TabsTrigger>
                          <TabsTrigger value="csv">Upload CSV/Excel</TabsTrigger>
                        </TabsList>
                        
                        <TabsContent value="csv" className="mt-4">
                          <div className="space-y-2 p-4 border rounded-md">
                            <FormLabel>Upload CSV/Excel File</FormLabel>
                            <div className="flex items-center gap-2">
                              <Input
                                type="file"
                                accept=".csv,.xlsx,.xls"
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
                              <div className="text-sm text-muted-foreground flex items-center gap-2">
                                <FileSpreadsheet className="h-4 w-4" />
                                {csvFile.name}
                              </div>
                            )}
                            <p className="text-xs text-muted-foreground">
                              File structure: B2 = Total Amount, C3:P3 = State Names, C36:P36 = Amounts
                            </p>
                          </div>
                        </TabsContent>
                        
                        <TabsContent value="manual" className="mt-4">
                          <div className="space-y-2">
                            <FormLabel>Upload File (Optional - for storage only)</FormLabel>
                            <Input
                              type="file"
                              accept=".csv,.xlsx,.xls,.pdf"
                              onChange={(e) => {
                                setManualFile(e.target.files?.[0] || null)
                              }}
                            />
                            {manualFile && (
                              <div className="text-sm text-muted-foreground flex items-center gap-2">
                                <Upload className="h-4 w-4" />
                                {manualFile.name}
                              </div>
                            )}
                          </div>
                        </TabsContent>
                      </Tabs>
                    </div>

                    <FormField
                      control={decisionForm.control}
                      name="decision_id_proposed"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Decision ID (proposed)</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {/* Only keep proposed Decision ID as the user input field */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={decisionForm.control}
                        name="decision_amount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Decision Amount *</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={decisionForm.control}
                        name="decision_date"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Decision Date</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={decisionForm.control}
                        name="partner"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Partner</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={decisionForm.control}
                        name="decision_maker"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Decision Maker</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={decisionForm.control}
                      name="restriction"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Restriction</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={decisionForm.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notes</FormLabel>
                          <FormControl>
                            <Textarea rows={3} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex justify-end gap-2">
                      <Button 
                        variant="outline" 
                        type="button" 
                        onClick={() => {
                          setIsCreateOpen(false)
                          decisionForm.reset()
                          setUseCsvUpload(false)
                          setCsvFile(null)
                          setManualFile(null)
                          setAllocRows([{ state: '', amount: '' }])
                        }}
                      >
                        Cancel
                      </Button>
                      <Button 
                        type="submit" 
                        className="bg-[#007229] hover:bg-[#007229]/90 text-white"
                        disabled={useCsvUpload && !csvFile}
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
        </div>
      </CardHeader>
      {!isCollapsed && (
        <CardContent>
        {isLoading ? (
          <div className="py-6 text-center text-muted-foreground">Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <TableHead>Decision ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Allocated</TableHead>
                  <TableHead>Remaining</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Restriction</TableHead>
                  <TableHead className="w-[60px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedDecisions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
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
                    return (
                      <React.Fragment key={decision.id}>
                        <TableRow>
                          <TableCell className="w-10">
                            <Button variant="ghost" size="icon" onClick={() => toggleExpanded(decision.id, fetchKey)}>
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
                              <Badge variant="secondary">{decision.restriction}</Badge>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {currentUser?.role === 'admin' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive/80"
                                onClick={() => handleDeleteClick(fetchKey)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow>
                            <TableCell colSpan={8} className="bg-muted/40">
                              <div className="space-y-4">
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
                                {isAllocLoading[fetchKey] ? (
                                  <div className="text-muted-foreground">Loading allocations...</div>
                                ) : (
                                  <div className="space-y-2">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>State</TableHead>
                                          <TableHead className="text-right">Amount</TableHead>
                                          <TableHead className="text-right">% of Decision</TableHead>
                                          <TableHead className="w-[140px] text-right"></TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {(allocationsByDecision[fetchKey] || []).length === 0 ? (
                                          <TableRow>
                                            <TableCell colSpan={4} className="text-muted-foreground text-sm">
                                              No allocations yet
                                            </TableCell>
                                          </TableRow>
                                        ) : (
                                          <>
                                            {(allocationsByDecision[fetchKey] || []).map((alloc) => {
                                              const isEditing = editingAllocation === alloc.allocation_id
                                              return (
                                                <TableRow key={alloc.allocation_id}>
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
                                                  <TableCell className="text-right">
                                                    {currentUser?.role === 'admin' && (
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
                                                  <TableCell className="text-right font-semibold">{formatCurrency(totalAmount)}</TableCell>
                                                  <TableCell className="text-right font-semibold">
                                                    {totalPercent !== '—' ? `${totalPercent}%` : '—'}
                                                  </TableCell>
                                                  <TableCell />
                                                </TableRow>
                                              )
                                            })()}
                                          </>
                                        )}
                                        {allocRows.map((row, idx) => (
                                          <TableRow key={`new-${idx}`}>
                                            <TableCell>
                                              <Select
                                                value={row.state}
                                                onValueChange={(val) =>
                                                  setAllocRows((prev) =>
                                                    prev.map((r, i) => (i === idx ? { ...r, state: val } : r))
                                                  )
                                                }
                                              >
                                                <SelectTrigger>
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
                                            <TableCell className="text-right">
                                              <div className="flex justify-end gap-2">
                                                {allocRows.length > 1 && (
                                                  <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() =>
                                                      setAllocRows((prev) => prev.filter((_, i) => i !== idx))
                                                    }
                                                  >
                                                    Remove
                                                  </Button>
                                                )}
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
                                    <div className="flex justify-end mt-3">
                                      <Button
                                        type="button"
                                        className="bg-[#007229] hover:bg-[#007229]/90 text-white"
                                        onClick={() => handleAddAllocation(fetchKey)}
                                      >
                                        Save allocations
                                      </Button>
                                    </div>
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

