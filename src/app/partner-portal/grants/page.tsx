'use client'

import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import { ChevronDown, FileText, BarChart2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import LanguageSwitch from '@/components/LanguageSwitch'

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'

const formSchema = z.object({
  donor_id: z.string(),
  name: z.string().min(1, "Name is required"),
  shortname: z.string().optional(),
  amount: z.string().optional(),
  status: z.enum(['open', 'closed']),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
})

type FormData = z.infer<typeof formSchema>

interface Donor {
  id: string
  name: string
  short_name: string | null
}

interface GrantCall {
  id: string
  donor: Donor
  name: string
  shortname: string | null
  amount: number | null
  status: 'open' | 'closed'
  start_date: string | null
  end_date: string | null
}

export default function GrantsPage() {
  const { t } = useTranslation(['partner'])
  const router = useRouter()
  const [donors, setDonors] = useState<Donor[]>([])
  const [grants, setGrants] = useState<GrantCall[]>([])
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all')
  const [currentDonorId, setCurrentDonorId] = useState<string>('')
  const [isAdminPartner, setIsAdminPartner] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isTableOpen, setIsTableOpen] = useState(true)
  const [currentDonorName, setCurrentDonorName] = useState<string>('')

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      donor_id: '',
      name: '',
      shortname: '',
      amount: '',
      status: 'open',
      start_date: '',
      end_date: ''
    },
  })

  // On mount, detect the logged-in donor from localStorage (partner portal)
  useEffect(() => {
    (async () => {
      try {
        const stored = localStorage.getItem('donor')
        if (!stored) return
        const parsed = JSON.parse(stored)
        // Try multiple shapes commonly stored for partner logins
        let detectedId: string | undefined = parsed?.donor_id || parsed?.id || parsed?.donors?.id
        const detectedName: string | undefined = parsed?.name || parsed?.donors?.name
        const detectedShort: string | undefined = parsed?.short_name || parsed?.donors?.short_name
        if (detectedName) setCurrentDonorName(detectedName)

        // Provisional admin detection from possible shapes in localStorage
        const flatShort = parsed?.short_name
        const flatName = parsed?.name
        const nestedShort = parsed?.donors?.short_name
        const nestedName = parsed?.donors?.name
        const adminLocal = (
          flatShort === 'Admin' || nestedShort === 'Admin' ||
          flatName === 'Admin Partner' || nestedName === 'Admin Partner' ||
          parsed?.id === 'a39daa94-5339-4850-82e2-3ad5301b0f26'
        )
        setIsAdminPartner(!!adminLocal)

        // If we still don't have an id, resolve by name or short_name
        if (!detectedId && (nestedName || flatName)) {
          const { data } = await supabase
            .from('donors')
            .select('id')
            .eq('name', nestedName || flatName)
            .single()
          if (data?.id) detectedId = data.id
        }
        if (!detectedId && detectedShort) {
          const { data } = await supabase
            .from('donors')
            .select('id')
            .eq('short_name', detectedShort)
            .single()
          if (data?.id) detectedId = data.id
        }

        if (detectedId) setCurrentDonorId(detectedId)
      } catch {}
    })()
  }, [])

  // NOTE: Avoid extra donor lookup to prevent 406s under restrictive RLS; rely on localStorage detection only

  // Keep donor_id in form synced for non-admin users so submit payload is correct
  useEffect(() => {
    if (!isAdminPartner && currentDonorId) {
      const existing = form.getValues('donor_id')
      if (!existing) {
        form.setValue('donor_id', currentDonorId, { shouldValidate: true, shouldDirty: true })
      }
    }
  }, [isAdminPartner, currentDonorId])

  // Fetch donors (admin only) and grants
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch donors only for Admin Partner so they can choose any donor
        if (isAdminPartner) {
          const { data: donorsData, error: donorsError } = await supabase
            .from('donors')
            .select('id, name, short_name')
            .eq('status', 'active')
            .order('name', { ascending: true })
          if (donorsError) throw donorsError
          setDonors(donorsData || [])
        } else {
          // Non-admin: skip donors fetch to avoid RLS 406; we show a read-only donor field from localStorage
          setDonors([])
        }

        // Fetch grants
        await fetchGrants()
      } catch (error) {
        console.error('Error fetching data:', error)
        window.alert(t('common:error_fetching_data'))
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [t, currentDonorId, statusFilter, isAdminPartner])

  const fetchGrants = async () => {
    try {
      // For non-admin users, wait until we know the donor id
      if (!isAdminPartner && !currentDonorId) {
        return
      }
      let query = supabase
        .from('grant_calls')
        .select(`
          id,
          name,
          shortname,
          amount,
          status,
          start_date,
          end_date,
          donor:donors (
            id,
            name,
            short_name
          )
        `)
        .order('created_at', { ascending: false })

      if (statusFilter !== 'all') {
        query.eq('status', statusFilter)
      }

      if (!isAdminPartner && currentDonorId) {
        query = query.eq('donor_id', currentDonorId)
      }

      const { data, error } = await query
      if (error) throw error
      
      // Ensure the data matches the GrantCall interface
      let typedData: GrantCall[] = (data || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        shortname: item.shortname,
        amount: item.amount,
        status: item.status as 'open' | 'closed',
        start_date: item.start_date,
        end_date: item.end_date,
        donor: {
          id: String(item.donor.id),
          name: String(item.donor.name),
          short_name: item.donor.short_name
        }
      }))
      // Extra safety: client-side filter for non-admin
      if (!isAdminPartner && currentDonorId) {
        typedData = typedData.filter(g => g.donor.id === currentDonorId)
      }
      
      setGrants(typedData)
    } catch (error) {
      console.error('Error fetching grants:', error)
      window.alert(t('common:error_fetching_data'))
    }
  }


  if (isLoading) return <div>Loading...</div>

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <LanguageSwitch />
      
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">{t('partner:grants.title')}</h2>
        <Button 
          variant="outline" 
          onClick={() => router.push('/partner-portal')}
        >
          {t('common:back')}
        </Button>
      </div>

      {/* Info message */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <p className="text-sm text-blue-800">
            <strong>Note:</strong> Grant call creation and management has been moved to the Grant Management page in the ERR Portal.
            This page is now read-only for viewing grant calls.
          </p>
        </CardContent>
      </Card>

      {/* Table Section */}
      <Collapsible
        open={isTableOpen}
        onOpenChange={setIsTableOpen}
        className="w-full"
      >
        <CollapsibleTrigger 
          className={cn(
            "flex w-full items-center justify-between rounded-md border px-4 py-2 font-medium",
            'bg-[#007229]/10 border-[#007229]/20 text-[#007229] hover:bg-[#007229]/20'
          )}
        >
          <span>{t('partner:grants.table.title')}</span>
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", {
              "transform rotate-180": isTableOpen,
            })}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2 pb-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t('partner:grants.title')}</CardTitle>
              <Select
                value={statusFilter}
                onValueChange={(value: 'all' | 'open' | 'closed') => {
                  setStatusFilter(value)
                  fetchGrants()
                }}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('partner:grants.table.filter.all')}</SelectItem>
                  <SelectItem value="open">{t('partner:grants.table.filter.open')}</SelectItem>
                  <SelectItem value="closed">{t('partner:grants.table.filter.closed')}</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('partner:grants.table.donor')}</TableHead>
                      <TableHead>{t('partner:grants.table.name')}</TableHead>
                      <TableHead>{t('partner:grants.table.shortname')}</TableHead>
                      <TableHead>{t('partner:grants.table.amount')}</TableHead>
                      <TableHead>{t('partner:grants.table.status')}</TableHead>
                      <TableHead>{t('partner:grants.table.start_date')}</TableHead>
                      <TableHead>{t('partner:grants.table.end_date')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grants.map((grant) => (
                      <TableRow key={grant.id}>
                        <TableCell>{grant.donor.name}</TableCell>
                        <TableCell>{grant.name}</TableCell>
                        <TableCell>{grant.shortname}</TableCell>
                        <TableCell>{grant.amount}</TableCell>
                        <TableCell>{grant.status}</TableCell>
                        <TableCell>{grant.start_date}</TableCell>
                        <TableCell>{grant.end_date}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}