'use client'

import { useTranslation } from 'react-i18next'
import React, { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { CollapsibleRow } from '@/components/ui/collapsible'
import Papa from 'papaparse'
import { FileInput } from '@/components/ui/file-input'
import { ViewForecasts } from './components/ViewForecasts'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import { Plus, Trash2 } from 'lucide-react'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import '@/i18n/config'
import LanguageSwitch from '@/components/LanguageSwitch'
import * as XLSX from 'xlsx'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June', 
  'July', 'August', 'September', 'October', 'November', 'December'
]
const YEAR = '2025'

type CSVRow = {
  Month: string
  State: string
  Amount: string
  Localities: string
  'Org Name': string
  Intermediary: string
  'Transfer Method': string
  Source: string
  'Receiving MAG': string
  Status: string
  [key: string]: string
}

// Add new type for form entries
type ForecastEntry = {
  id: string
  month: string
  state: string
  amount: string
  localities: string
  org_name: string
  intermediary: string
  transfer_method: string
  source: string
  receiving_mag: string
  status: 'planned' | 'complete'
}

// Update DonorData type to include user_id
type DonorData = {
  donor_id: string
  user_id: string
  code: string
  org_type: string
  donors: {
    id: string
    name: string
    org_type: string
  }
}

// Add this type definition near other interfaces
interface DuplicateGroup {
  key: string
  entries: CSVRow[]
  totalAmount: number
}

// Function to consolidate duplicate forecasts
function findDuplicates(data: CSVRow[]): DuplicateGroup[] {
  const groups = new Map<string, CSVRow[]>()
  
  data.forEach(row => {
    const normalizedFields = {
      state_name: (row.State || '').trim().toLowerCase(),
      month: (row.Month || '').trim(),
      receiving_mag: (row['Receiving MAG'] || '').trim().toLowerCase(),
      source: (row.Source || '').trim().toLowerCase(),
      transfer_method: (row['Transfer Method'] || '').trim().toLowerCase()
    }

    // Create a key from only the fields in our unique constraint
    const key = [
      normalizedFields.state_name,
      normalizedFields.month,
      normalizedFields.receiving_mag,
      normalizedFields.source,
      normalizedFields.transfer_method
    ].join('|')

    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(row)
  })

  return Array.from(groups.entries())
    .filter(([, rows]) => rows.length > 1)
    .map(([, rows]) => ({
      key: rows[0].State + '-' + rows[0].Month,
      entries: rows,
      totalAmount: rows.reduce((sum, row) => {
        const amount = parseFloat(row.Amount.replace(/[^0-9.-]/g, ''))
        return sum + (isNaN(amount) ? 0 : amount)
      }, 0)
    }))
}

// Add this helper function to convert Excel date numbers to date strings
const convertExcelDate = (excelDate: number): string => {
  // Excel dates are number of days since 1900-01-01 (except for the 1900 leap year bug)
  const date = new Date((excelDate - 25569) * 86400 * 1000)
  const month = date.getMonth() + 1
  const year = date.getFullYear()
  return `${month.toString().padStart(2, '0')}-${year}`
}

// Update the parseDate function to handle the new date format
const parseDate = (dateStr: string): Date | null => {
  try {
    // Add handling for MM-YYYY format from Excel conversion
    if (dateStr.match(/^\d{2}-\d{4}$/)) {
      const [month, year] = dateStr.split('-')
      return new Date(parseInt(year), parseInt(month) - 1, 1)
    }

    // Case 1: Already in YYYY-MM-DD format
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const date = new Date(dateStr)
      return new Date(date.getFullYear(), date.getMonth(), 1)
    }

    // Case 2: MMM-YY format (e.g., "Jan-25")
    if (dateStr.match(/^[A-Za-z]{3}-\d{2}$/)) {
      const [month, year] = dateStr.split('-')
      const monthMap: { [key: string]: string } = {
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
        'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
        'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
      }
      const monthNum = monthMap[month.toLowerCase()]
      if (!monthNum) return null
      return new Date(`20${year}-${monthNum}-01`)
    }

    // Case 3: MM/DD/YY or MM/DD/YYYY
    if (dateStr.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}$/)) {
      const [month, , year] = dateStr.split('/')
      const fullYear = year.length === 2 ? `20${year}` : year
      return new Date(`${fullYear}-${month.padStart(2, '0')}-01`)
    }

    // Case 4: DD-MMM-YYYY or DD-MMM-YY
    if (dateStr.match(/^\d{1,2}-[A-Za-z]{3}-\d{2,4}$/)) {
      const [, month, year] = dateStr.split('-')
      const monthMap: { [key: string]: string } = {
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
        'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
        'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
      }
      const monthNum = monthMap[month.toLowerCase()]
      if (!monthNum) return null
      const fullYear = year.length === 2 ? `20${year}` : year
      return new Date(`${fullYear}-${monthNum}-01`)
    }

    return null
  } catch {
    return null
  }
}

// Create a new component for the form row
const EntryFormRow = ({ 
  entry, 
  onChange, 
  onDelete,
  onAdd,
  states, 
  months
}: { 
  entry: ForecastEntry
  onChange: (entry: ForecastEntry) => void
  onDelete: () => void
  onAdd: () => void
  states: { id: string; state_name: string }[]
  months: string[]
}) => {
  const [localEntry, setLocalEntry] = useState(entry)

  // Separate handlers for text inputs and select inputs
  const handleTextChange = (field: keyof ForecastEntry, value: string) => {
    const updatedEntry = {
      ...localEntry,
      [field]: value
    }
    setLocalEntry(updatedEntry)
  }

  const handleSelectChange = (field: keyof ForecastEntry, value: string) => {
    const updatedEntry = {
      ...localEntry,
      [field]: value
    }
    setLocalEntry(updatedEntry)
    onChange(updatedEntry) // Update parent immediately for select inputs
  }

  // Update parent when text input loses focus
  const handleBlur = () => {
    onChange(localEntry)
  }

  return (
    <tr className="border-t">
      <td className="p-2">
        <Select 
          value={localEntry.month} 
          onValueChange={(value) => handleSelectChange('month', value)}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            {months.map((month) => (
              <SelectItem 
                key={month} 
                value={`${YEAR}-${String(months.indexOf(month) + 1).padStart(2, '0')}`}
              >
                {month} {YEAR}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="p-2">
        <Select 
          value={localEntry.state}
          onValueChange={(value) => handleSelectChange('state', value)}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder="State" />
          </SelectTrigger>
          <SelectContent>
            {states.map((state) => (
              <SelectItem key={state.id} value={state.state_name}>
                {state.state_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="p-2">
        <Input
          type="text"
          inputMode="numeric"
          value={localEntry.amount}
          onChange={(e) => handleTextChange('amount', e.target.value.replace(/[^\d.]/g, ''))}
          onBlur={handleBlur}
          className="h-8"
        />
      </td>
      <td className="p-2">
        <Input
          value={localEntry.localities}
          onChange={(e) => handleTextChange('localities', e.target.value)}
          onBlur={handleBlur}
          className="h-8"
        />
      </td>
      <td className="p-2">
        <Input
          value={localEntry.intermediary}
          onChange={(e) => handleTextChange('intermediary', e.target.value)}
          onBlur={handleBlur}
          className="h-8"
        />
      </td>
      <td className="p-2">
        <Input
          value={localEntry.transfer_method}
          onChange={(e) => handleTextChange('transfer_method', e.target.value)}
          onBlur={handleBlur}
          className="h-8"
        />
      </td>
      <td className="p-2">
        <Select 
          value={localEntry.source}
          onValueChange={(value) => handleSelectChange('source', value)}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Private">Private</SelectItem>
            <SelectItem value="UN">UN</SelectItem>
            <SelectItem value="Governmental">Governmental</SelectItem>
          </SelectContent>
        </Select>
      </td>
      <td className="p-2">
        <Input
          value={localEntry.receiving_mag}
          onChange={(e) => handleTextChange('receiving_mag', e.target.value)}
          onBlur={handleBlur}
          className="h-8"
        />
      </td>
      <td className="p-2">
        <Select 
          value={localEntry.status}
          onValueChange={(value: 'planned' | 'complete') => handleSelectChange('status', value)}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="planned">Planned</SelectItem>
            <SelectItem value="complete">Complete</SelectItem>
          </SelectContent>
        </Select>
      </td>
      <td className="p-2">
        <div className="flex items-center gap-1 justify-center">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={onDelete}
            className="h-8 w-8 text-destructive hover:text-destructive/80"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={onAdd}
            className="h-8 w-8"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  )
}

export default function ForecastPage() {
  const { t } = useTranslation(['forecast', 'common'])
  const router = useRouter()
  const [donors, setDonors] = useState<{ id: string; name: string }[]>([])
  const [states, setStates] = useState<{ id: string; state_name: string }[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [rows, setRows] = useState<ForecastEntry[]>(() => 
    Array(5).fill(null).map(() => ({
      id: crypto.randomUUID(),
      month: '',
      state: '',
      amount: '',
      localities: '',
      org_name: '', 
      intermediary: '',
      transfer_method: '',
      source: '',
      receiving_mag: '',
      status: 'planned'
    }))
  )
  const [donorOrgType, setDonorOrgType] = useState<string>('')
  const [userId, setUserId] = useState<string>('')
  const [lastUpload, setLastUpload] = useState<string | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isCsvOpen, setIsCsvOpen] = useState(false)
  const [isViewOpen, setIsViewOpen] = useState(false)
  const [showDuplicatesDialog, setShowDuplicatesDialog] = useState(false)
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([])
  const [csvData, setCsvData] = useState<CSVRow[]>([])

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Get current session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        if (!session?.user?.id) {
          throw new Error('No authenticated user found')
        }

        // Set user ID from session
        setUserId(session.user.id)

        // Get logged in donor from localStorage
        const loggedInDonor = JSON.parse(localStorage.getItem('donor') || '{}') as DonorData
        if (!loggedInDonor?.donor_id) {
          throw new Error('No donor information found')
        }

        // Store complete donor info in localStorage
        const updatedDonorInfo = {
          ...loggedInDonor,
          donor_code: loggedInDonor.code // Store at root level for easier access
        }
        localStorage.setItem('donor', JSON.stringify(updatedDonorInfo))

        if (loggedInDonor.org_type) {
          setDonorOrgType(loggedInDonor.org_type)
        }

        const [clustersRes, statesRes] = await Promise.all([
          supabase.from('aid_clusters').select('id, name'),
          supabase.from('states')
            .select('id, state_name')
            .order('state_name')
        ])

        if (clustersRes.error) throw clustersRes.error
        if (statesRes.error) throw statesRes.error

        // Get unique states
        const uniqueStates = Array.from(
          new Map(statesRes.data.map(state => [state.state_name, state]))
          .values()
        )

        // Set donor directly from localStorage
        setDonors([{ id: loggedInDonor.donor_id, name: loggedInDonor.donors.name }])
        setStates(uniqueStates)

        // Fetch last upload timestamp
        const { data: lastUploadData, error: lastUploadError } = await supabase
          .from('donor_forecasts')
          .select('created_at')
          .eq('donor_id', loggedInDonor.donor_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (!lastUploadError && lastUploadData) {
          // Format the date
          const date = new Date(lastUploadData.created_at)
          setLastUpload(date.toLocaleString())
        }
      } catch (err) {
        console.error('Error fetching data:', err)
        setError('Failed to load data. Please try again later.')
      }
    }

    fetchData()
  }, [])

  const handleAddRow = () => {
    setRows(prev => [...prev, {
      id: crypto.randomUUID(),
      month: '',
      state: '',
      amount: '',
      localities: '',
      org_name: '', 
      intermediary: '',
      transfer_method: '',
      source: '',
      receiving_mag: '',
      status: 'planned'
    }])
  }

  const handleDeleteRow = (id: string) => {
    setRows(prev => prev.filter(row => row.id !== id))
  }

  const handleRowChange = (id: string, updatedEntry: ForecastEntry) => {
    setRows(rows.map(row => 
      row.id === id ? { ...updatedEntry, id } : row
    ))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      // Get current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      if (!session?.user?.id) {
        throw new Error('No authenticated user found')
      }

      // Get donor code from localStorage
      const loggedInDonor = JSON.parse(localStorage.getItem('donor') || '{}')
      if (!loggedInDonor?.donor_code) {
        throw new Error('No donor code found')
      }

      // Add donor code and created_by to each forecast
      const forecastsWithCode = rows.map(row => ({
        ...row,
        donor_code: loggedInDonor.donor_code,
        created_by: session.user.id
      }))
      
      console.log('Forecasts being sent to RPC:', forecastsWithCode)

      const { data, error } = await supabase.rpc('insert_donor_forecast', {
        p_forecasts: forecastsWithCode,
        p_donor_code: loggedInDonor.donor_code
      })

      if (error) {
        throw new Error(error.message || 'Failed to submit forecasts')
      }

      if (data?.success) {
        alert('Forecasts submitted successfully!')
        setRows([])
      } else {
        throw new Error(data?.error || 'Failed to submit forecasts')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit forecasts')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDownloadTemplate = () => {
    // Create a link to the template file in public folder
    const link = document.createElement('a')
    link.href = '/templates/MAG Finance Forecast Template.xlsx'
    link.download = 'MAG Finance Forecast Template.xlsx'
    
    // Trigger the download
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setError(null)
    }
  }

  const handleFileUpload = async () => {
    if (!selectedFile) {
      setError('Please select a file first')
      return
    }

    try {
      setIsSubmitting(true)
      setError(null)

      const fileExtension = selectedFile.name.split('.').pop()?.toLowerCase()

      if (fileExtension === 'csv') {
        // Wrap Papa.parse in a Promise to handle it consistently
        await new Promise((resolve, reject) => {
          Papa.parse<CSVRow>(selectedFile, {
            header: true,
            complete: async (results) => {
              try {
                await processFileData(results.data)
                resolve(null)
              } catch (error) {
                reject(error)
              }
            },
            error: (error) => {
              reject(error)
            }
          })
        })
      } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
        // Wrap FileReader in a Promise
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = (e) => {
            try {
              // Need to explicitly cast the result to ArrayBuffer
              const arrayBuffer = e.target?.result as ArrayBuffer
              resolve(arrayBuffer)
            } catch (error) {
              reject(error)
            }
          }
          reader.onerror = () => reject(new Error('Failed to read Excel file'))
          reader.readAsArrayBuffer(selectedFile)
        })

        // Add explicit type checking for the data
        if (!data) {
          throw new Error('Failed to read Excel file data')
        }

        const workbook = XLSX.read(data, { type: 'array' })
        
        // Add error handling for missing worksheet
        if (!workbook.Sheets || !workbook.Sheets['Forecast']) {
          throw new Error('Could not find sheet named "Forecast" in the Excel file')
        }

        const worksheet = workbook.Sheets['Forecast']
        const jsonData = XLSX.utils.sheet_to_json(worksheet)

        // Add validation for empty Excel file
        if (!Array.isArray(jsonData) || jsonData.length === 0) {
          throw new Error('No data found in the Excel file')
        }

        // Add logging to debug the Excel data
        console.log('Excel data:', jsonData)

        const mappedData: CSVRow[] = jsonData.map((row: any) => {
          console.log('Processing row:', row)
          
          // Convert Excel date number to proper date string
          const monthValue = typeof row['Month'] === 'number' 
            ? convertExcelDate(row['Month'])
            : row['Month']?.toString() || ''

          return {
            Month: monthValue,
            State: row['State']?.toString().trim() || '',
            Amount: (row['Amount'] || '').toString(),
            Localities: row['Localities']?.toString() || '',
            'Org Name': row['Org Name']?.toString() || '',
            Intermediary: row['Intermediary']?.toString() || '',
            'Transfer Method': row['FSP']?.toString() || '',
            Source: row['Funding Source']?.toString() || '',
            'Receiving MAG': row['Receiving MAG']?.toString() || '',
            Status: row['Status']?.toString() || 'planned'
          }
        })

        // Add logging for mapped data
        console.log('Mapped data:', mappedData)

        await processFileData(mappedData)
      } else {
        throw new Error('Unsupported file type. Please upload a CSV or Excel file.')
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Add new helper function to process file data (reduces code duplication)
  const processFileData = async (data: CSVRow[]) => {
    // Validate required columns
    const requiredColumns = [
      'Month', 'State', 'Amount', 'Org Name', 
      'Receiving MAG', 'Status'
    ]
    
    const headers = Object.keys(data[0] || {})
    const missingColumns = requiredColumns.filter(col => !headers.includes(col))

    if (missingColumns.length > 0) {
      throw new Error(`Missing required columns: ${missingColumns.join(', ')}`)
    }

    // Store data for later use
    setCsvData(data)

    // Check for duplicates before proceeding
    const duplicateGroups = findDuplicates(data)
    if (duplicateGroups.length > 0) {
      setDuplicateGroups(duplicateGroups)
      setShowDuplicatesDialog(true)
      return
    }

    // If no duplicates, proceed with upload
    await submitForecasts(data)
  }

  // Update the submitForecasts function to normalize the data before sending
  const submitForecasts = async (data: CSVRow[]) => {
    try {
      // Get current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      if (!session?.user?.id) {
        throw new Error('No authenticated user found')
      }

      // Get the logged-in donor's information
      const { data: donorData, error: donorError } = await supabase
        .from('donors')
        .select('org_type, code, name')
        .eq('id', donors[0].id)
        .single()

      if (donorError) {
        console.error('Error fetching donor:', donorError)
        throw new Error(`Failed to fetch donor information: ${donorError.message}`)
      }

      if (!donorData.code || !donorData.name) {
        throw new Error('Donor code or name not found in database')
      }

      const forecasts = data
        .filter(row => {
          if (!row.Month || !row.State || !row.Amount) {
            return false
          }
          return true
        })
        .map(row => {
          try {
            const parsedDate = parseDate(row.Month?.toString().trim())
            if (!parsedDate) {
              return null
            }

            const matchingState = states.find(s => 
              s.state_name.toLowerCase() === row.State?.trim().toLowerCase()
            )

            const cleanedAmount = parseFloat(row.Amount.toString().replace(/[^0-9.-]/g, ''))
            if (isNaN(cleanedAmount)) {
              return null
            }

            // Always use the logged-in donor's name from the database
            // This ensures consistent org_name for the unique constraint
            const forecast = {
              donor_code: donorData.code,
              state_id: matchingState?.id || null,
              state_name: row.State?.trim(),
              month: parsedDate.toISOString().split('T')[0],
              amount: cleanedAmount,
              localities: row.Localities?.trim() || null,
              org_name: donorData.name,  // Use logged-in donor's name instead of Excel's Org Name
              intermediary: row.Intermediary?.trim() || null,
              transfer_method: (row['Transfer Method'] || row.FSP)?.trim() || null,  // Handle both column names
              source: (row.Source || row['Funding Source'])?.trim() || null,  // Handle both column names
              receiving_mag: row['Receiving MAG']?.trim() || null,
              status: row.Status?.toLowerCase().trim() === 'complete' ? 'complete' : 'planned',
              org_type: donorData.org_type || null,
              created_by: session.user.id  // Use session user ID
            }
            
            console.log('Forecast being prepared:', forecast)
            return forecast
          } catch (error) {
            console.error('Error processing forecast row:', error)
            return null
          }
        })
        .filter((forecast): forecast is NonNullable<typeof forecast> => forecast !== null)

      if (forecasts.length === 0) {
        throw new Error('No valid forecast data found in CSV')
      }

      console.log('About to call RPC with forecasts:', forecasts)
      console.log('Donor code being sent:', donorData.code)
      
      const { data: rpcData, error: rpcError } = await supabase.rpc('insert_donor_forecast', {
        p_forecasts: forecasts,
        p_donor_code: donorData.code
      })
      
      console.log('RPC Data:', rpcData)
      console.log('RPC Error:', rpcError)

      if (rpcError) {
        console.error('Detailed RPC error:', {
          message: rpcError.message,
          details: rpcError.details,
          hint: rpcError.hint,
          code: rpcError.code
        })
        throw new Error(rpcError.message || 'Failed to submit forecasts')
      }

      if (rpcData?.success) {
        alert('Forecasts uploaded successfully!')
        setSelectedFile(null)
      } else {
        console.error('RPC returned failure:', rpcData)
        throw new Error(rpcData?.error || 'Failed to submit forecasts')
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An unexpected error occurred')
    }
  }

  // Update FormSection to accept and use isOpen prop
  const FormSection = React.memo(({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (open: boolean) => void }) => {
    const { t } = useTranslation(['forecast', 'common'])
    
    return (
      <Collapsible
        open={isOpen}
        onOpenChange={onOpenChange}
        className="w-full"
      >
        <CollapsibleTrigger 
          className={cn(
            "flex w-full items-center justify-between rounded-md border px-4 py-2 font-medium",
            'bg-[#007229]/10 border-[#007229]/20 text-[#007229] hover:bg-[#007229]/20'
          )}
        >
          <span>{t('forecast:sections.form.title')}</span>
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", {
              "transform rotate-180": isOpen,
            })}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2 pb-4">
          <div className="space-y-6 pt-4">
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-2 text-left">{t('forecast:sections.form.table.month')} <span className="text-red-500">*</span></th>
                    <th className="p-2 text-left">{t('forecast:sections.form.table.state')} <span className="text-red-500">*</span></th>
                    <th className="p-2 text-left">{t('forecast:sections.form.table.amount')} <span className="text-red-500">*</span></th>
                    <th className="p-2 text-left">{t('forecast:sections.form.table.localities')}</th>
                    <th className="p-2 text-left">{t('forecast:sections.form.table.intermediary')} <span className="text-red-500">*</span></th>
                    <th className="p-2 text-left">{t('forecast:sections.form.table.transfer_method')} <span className="text-red-500">*</span></th>
                    <th className="p-2 text-left">{t('forecast:sections.form.table.source')} <span className="text-red-500">*</span></th>
                    <th className="p-2 text-left">{t('forecast:sections.form.table.receiving_mag')} <span className="text-red-500">*</span></th>
                    <th className="p-2 text-left">{t('forecast:sections.form.table.status')} <span className="text-red-500">*</span></th>
                    <th className="p-2 w-20 text-center">{t('forecast:sections.form.table.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <EntryFormRow
                      key={row.id}
                      entry={row}
                      onChange={(updated) => handleRowChange(row.id, updated)}
                      onDelete={() => handleDeleteRow(row.id)}
                      onAdd={handleAddRow}
                      states={states}
                      months={MONTHS}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <Button 
              onClick={handleSubmit} 
              className="w-full bg-[#007229] hover:bg-[#007229]/90 text-white"
              disabled={rows.length === 0}
            >
              {t('forecast:sections.form.submit')}
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>
    )
  })
  FormSection.displayName = 'FormSection'

  // Update DuplicatesDialog to use all CSV data
  const DuplicatesDialog = () => (
    <Dialog open={showDuplicatesDialog} onOpenChange={setShowDuplicatesDialog}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Duplicate Entries Detected</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The following entries have the same State, Month, Receiving MAG, Source, and Transfer Method. 
            They will be combined into single entries with summed amounts. Please review and confirm:
          </p>
          {duplicateGroups.map((group, i) => (
            <div key={i} className="border rounded-lg p-4 space-y-2">
              <div className="font-medium">
                Group {i + 1} - Total Amount: ${group.totalAmount.toLocaleString()}
              </div>
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-2 text-left">Month</th>
                    <th className="p-2 text-left">State</th>
                    <th className="p-2 text-left">Amount</th>
                    <th className="p-2 text-left">Localities</th>
                    <th className="p-2 text-left">Transfer Method</th>
                    <th className="p-2 text-left">Receiving MAG</th>
                    <th className="p-2 text-left">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {group.entries.map((entry, j) => (
                    <tr key={j} className="border-t">
                      <td className="p-2">{entry.Month}</td>
                      <td className="p-2">{entry.State}</td>
                      <td className="p-2">{entry.Amount}</td>
                      <td className="p-2">{entry.Localities || '-'}</td>
                      <td className="p-2">{entry['Transfer Method'] || '-'}</td>
                      <td className="p-2">{entry['Receiving MAG']}</td>
                      <td className="p-2">{entry.Source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setShowDuplicatesDialog(false)}
          >
            Cancel
          </Button>
          <Button 
            onClick={async () => {
              setShowDuplicatesDialog(false)
              await submitForecasts(csvData)
            }}
            className="bg-[#007229] hover:bg-[#007229]/90 text-white"
          >
            Proceed with Combined Amounts
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <LanguageSwitch />
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">{t('forecast:title')}</h2>
        <Button 
          variant="outline" 
          onClick={() => router.push('/')}
        >
          {t('forecast:back')}
        </Button>
      </div>

      {error && (
        <div className="bg-destructive/15 text-destructive px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {/* Donor Display - Always visible */}
      <div className="space-y-2">
        <Label htmlFor="donor">{t('forecast:partner')}</Label>
        <div className="h-9 px-3 py-1 rounded-md border bg-muted/50 flex items-center">
          {donors[0]?.name}
        </div>
      </div>

      {/* Add this new explainer section */}
      <div className="grid grid-cols-3 gap-4 p-4 bg-muted/20 rounded-lg">
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-medium">
            <span className="text-lg">📝</span>
            {t('forecast:sections.form.title')}
          </div>
          <p className="text-sm text-muted-foreground">
            {t('forecast:sections.form.description')}
          </p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-medium">
            <span className="text-lg">📄</span>
            {t('forecast:sections.file.title')}
          </div>
          <p className="text-sm text-muted-foreground">
            {t('forecast:sections.file.description')}
          </p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-medium">
            <span className="text-lg">📈</span>
            {t('forecast:sections.view.title')}
          </div>
          <p className="text-sm text-muted-foreground">
            {t('forecast:sections.view.description')}
          </p>
        </div>
      </div>

      {/* Last Upload Info */}
      <div className="px-4 py-2 bg-muted/10 rounded-lg text-sm text-muted-foreground">
        <span className="font-medium">{t('forecast:last_upload')}: </span>
        {lastUpload ? lastUpload : t('forecast:no_uploads')}
      </div>

      {/* Submit Options Section */}
      <div className="space-y-4">
        <FormSection isOpen={isFormOpen} onOpenChange={setIsFormOpen} />

        <Collapsible
          open={isCsvOpen}
          onOpenChange={setIsCsvOpen}
          className="w-full"
        >
          <CollapsibleTrigger 
            className={cn(
              "flex w-full items-center justify-between rounded-md border px-4 py-2 font-medium",
              'bg-[#007229]/10 border-[#007229]/20 text-[#007229] hover:bg-[#007229]/20'
            )}
          >
            <span>{t('forecast:sections.file.title')}</span>
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", {
                "transform rotate-180": isCsvOpen,
              })}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 pb-4">
            <div className="space-y-4 pt-4">
              <CollapsibleRow title={t('forecast:sections.file.guide.title')} variant="default">
                <div className="pt-2">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    {/* Left Column */}
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <div className="font-medium flex items-center gap-2">
                          <span>📅</span> {t('forecast:sections.file.guide.month.title')}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t('forecast:sections.file.guide.month.desc')}
                        </p>
                      </div>

                      <div className="space-y-1">
                        <div className="font-medium flex items-center gap-2">
                          <span>🌍</span> {t('forecast:sections.file.guide.state.title')}
                          <Dialog>
                            <DialogTrigger asChild>
                              <button className="text-xs text-blue-500 hover:underline ml-2">
                                {t('forecast:sections.file.guide.state.view_list')}
                              </button>
                            </DialogTrigger>
                            <DialogContent className="bg-white">
                              <DialogHeader>
                                <DialogTitle>{t('forecast:sections.file.guide.state.available_states')}</DialogTitle>
                              </DialogHeader>
                              <div className="grid grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto">
                                {states.map((state) => (
                                  <div key={state.id} className="text-sm p-2 bg-gray-50 rounded border border-gray-100">
                                    {state.state_name}
                                  </div>
                                ))}
                              </div>
                            </DialogContent>
                          </Dialog>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t('forecast:sections.file.guide.state.desc')}
                        </p>
                      </div>

                      <div className="space-y-1">
                        <div className="font-medium flex items-center gap-2">
                          <span>💰</span> {t('forecast:sections.file.guide.amount.title')}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t('forecast:sections.file.guide.amount.desc')}
                        </p>
                      </div>

                      <div className="space-y-1">
                        <div className="font-medium flex items-center gap-2">
                          <span>📍</span> {t('forecast:sections.file.guide.localities.title')}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t('forecast:sections.file.guide.localities.desc')}
                        </p>
                      </div>
                    </div>

                    {/* Right Column */}
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <div className="font-medium flex items-center gap-2">
                          <span>🤝</span> {t('forecast:sections.file.guide.intermediary.title')}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t('forecast:sections.file.guide.intermediary.desc')}
                        </p>
                      </div>

                      <div className="space-y-1">
                        <div className="font-medium flex items-center gap-2">
                          <span>💳</span> {t('forecast:sections.file.guide.transfer.title')}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t('forecast:sections.file.guide.transfer.desc')}
                        </p>
                      </div>

                      <div className="space-y-1">
                        <div className="font-medium flex items-center gap-2">
                          <span>📊</span> {t('forecast:sections.file.guide.source.title')}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t('forecast:sections.file.guide.source.desc')}
                        </p>
                      </div>

                      <div className="space-y-1">
                        <div className="font-medium flex items-center gap-2">
                          <span>👥</span> {t('forecast:sections.file.guide.mag.title')}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t('forecast:sections.file.guide.mag.desc')}
                        </p>
                      </div>

                      <div className="space-y-1">
                        <div className="font-medium flex items-center gap-2">
                          <span>📊</span> {t('forecast:sections.file.guide.status.title')}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t('forecast:sections.file.guide.status.desc')}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CollapsibleRow>

              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  onClick={handleDownloadTemplate}
                  className="whitespace-nowrap"
                >
                  {t('forecast:sections.file.download_template')}
                </Button>
                <div className="flex-1">
                  <FileInput
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileSelect}
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <Button 
                className="w-full bg-[#007229] hover:bg-[#007229]/90 text-white disabled:bg-[#007229] disabled:opacity-100" 
                onClick={handleFileUpload}
                disabled={isSubmitting || !selectedFile}
              >
                {isSubmitting ? t('forecast:sections.file.uploading') : t('forecast:sections.file.upload')}
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Collapsible
          open={isViewOpen}
          onOpenChange={setIsViewOpen}
          className="w-full"
        >
          <CollapsibleTrigger 
            className={cn(
              "flex w-full items-center justify-between rounded-md border px-4 py-2 font-medium",
              'bg-[#007229]/10 border-[#007229]/20 text-[#007229] hover:bg-[#007229]/20'
            )}
          >
            <span>{t('forecast:sections.view.title')}</span>
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", {
                "transform rotate-180": isViewOpen,
              })}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 pb-4">
            <ViewForecasts />
          </CollapsibleContent>
        </Collapsible>
      </div>
      <DuplicatesDialog />
    </div>
  )
}
