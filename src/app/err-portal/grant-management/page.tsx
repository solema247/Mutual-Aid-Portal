'use client'

import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { Plus, Save, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// Types
interface GrantCall {
  id: string
  name: string
  shortname: string | null
  amount: number | null
}

interface StateAllocation {
  id: string
  state_name: string
  amount: number
  decision_no: number
  created_at: string
}

interface EditableAllocation extends Partial<StateAllocation> {
  isNew?: boolean
  isEdited?: boolean
  tempId?: string
  newAmount?: string
}

export default function GrantManagementPage() {
  const { t } = useTranslation(['err', 'common'])
  const router = useRouter()
  const [grantCalls, setGrantCalls] = useState<GrantCall[]>([])
  const [states, setStates] = useState<{ state_name: string }[]>([])
  const [selectedGrantCall, setSelectedGrantCall] = useState<string | null>(null)
  const [allocations, setAllocations] = useState<EditableAllocation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const getRemainingAmount = () => {
    const selectedGrant = grantCalls.find(g => g.id === selectedGrantCall)
    const totalGrantAmount = Number(selectedGrant?.amount || 0)
    const totalAllocated = allocations.reduce((sum, alloc) => 
      sum + (Number(alloc.amount) || 0)
    , 0)
    return totalGrantAmount - totalAllocated
  }

  const isFullyAllocated = () => {
    return getRemainingAmount() <= 0
  }

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [grantCallsRes, statesRes] = await Promise.all([
          supabase
            .from('grant_calls')
            .select('id, name, shortname, amount')
            .order('created_at', { ascending: false }),
          supabase
            .from('states')
            .select('state_name')
            .order('state_name')
        ])

        if (grantCallsRes.error) throw grantCallsRes.error
        if (statesRes.error) throw statesRes.error

        // Get unique states
        const uniqueStates = Array.from(
          new Map(statesRes.data.map(state => [state.state_name, state]))
          .values()
        )

        setGrantCalls(grantCallsRes.data)
        setStates(uniqueStates)
      } catch (error) {
        console.error('Error fetching data:', error)
        window.alert(t('common:error_fetching_data'))
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [t])

  // Fetch existing allocations when grant call is selected
  useEffect(() => {
    const fetchAllocations = async () => {
      if (!selectedGrantCall) {
        setAllocations([])
        return
      }

      try {
              // Get the latest decision number for this grant call
      const { data: latestDecisionData, error: decisionError } = await supabase
        .from('grant_call_state_allocations')
        .select('decision_no')
        .eq('grant_call_id', selectedGrantCall)
        .order('decision_no', { ascending: false })
        .limit(1)

      if (decisionError) throw decisionError

      const latestDecision = latestDecisionData?.[0]?.decision_no

      if (!latestDecision) {
        setAllocations([])
        return
      }

      // Fetch only the latest allocations
      const { data, error } = await supabase
        .from('grant_call_state_allocations')
        .select('*')
        .eq('grant_call_id', selectedGrantCall)
        .eq('decision_no', latestDecision)
        .order('created_at', { ascending: false })

        if (error) throw error
        setAllocations(data.map(alloc => ({
          ...alloc,
          isEdited: false
        })))
      } catch (error) {
        console.error('Error fetching allocations:', error)
        window.alert(t('common:error_fetching_data'))
      }
    }

    fetchAllocations()
  }, [selectedGrantCall, t])

  const handleAddState = () => {
    if (isFullyAllocated()) return

    setAllocations(prev => [{
      tempId: crypto.randomUUID(),
      isNew: true,
      state_name: '',
      newAmount: '',
      decision_no: 0,
      created_at: new Date().toISOString()
    }, ...prev])
  }

  const handleAllocationChange = (id: string, field: string, value: string) => {
    setAllocations(prev => prev.map(alloc => {
      if ((alloc.id === id) || (alloc.tempId === id)) {
        return {
          ...alloc,
          isEdited: !alloc.isNew,
          [field]: value
        }
      }
      return alloc
    }))
  }

  const handleSaveAllocations = async () => {
    if (!selectedGrantCall) return

    const validAllocations = allocations.filter(alloc => 
      alloc.state_name && 
      alloc.amount && 
      Number(alloc.amount) > 0
    )

    if (validAllocations.length === 0) {
      return
    }

    // Validate remaining amount
    if (getRemainingAmount() < 0) {
      window.alert(t('err:grants.exceeds_amount'))
      return
    }

    try {
      setIsSubmitting(true)

      // Get the latest decision number
      const { data: latestDecision, error: decisionError } = await supabase
        .from('grant_call_state_allocations')
        .select('decision_no')
        .eq('grant_call_id', selectedGrantCall)
        .order('decision_no', { ascending: false })
        .limit(1)

      if (decisionError) throw decisionError

      const nextDecisionNo = (latestDecision?.[0]?.decision_no ?? 0) + 1

      // Prepare allocations
      const allocationsToInsert = validAllocations.map(alloc => ({
        grant_call_id: selectedGrantCall,
        state_name: alloc.state_name!,
        amount: Number(alloc.amount),
        decision_no: nextDecisionNo
      }))

      // Insert all allocations
      const { error: insertError } = await supabase
        .from('grant_call_state_allocations')
        .insert(allocationsToInsert)

      if (insertError) throw insertError

      // Fetch only the latest allocations with the new decision number
      const { data: refreshedAllocations, error: fetchError } = await supabase
        .from('grant_call_state_allocations')
        .select('*')
        .eq('grant_call_id', selectedGrantCall)
        .eq('decision_no', nextDecisionNo)
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      
      setAllocations(refreshedAllocations.map(alloc => ({
        ...alloc,
        isEdited: false
      })))

      window.alert(t('err:grants.allocations_saved'))
    } catch (error) {
      console.error('Error saving allocations:', error)
      window.alert(t('common:error_saving'))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) return <div>Loading...</div>

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">{t('err:grants.title')}</h2>
        <Button 
          variant="outline" 
          onClick={() => router.push('/err-portal')}
        >
          {t('common:back')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('err:grants.select_grant')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Select
            value={selectedGrantCall || ''}
            onValueChange={setSelectedGrantCall}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t('err:grants.select_placeholder')} />
            </SelectTrigger>
            <SelectContent>
              {grantCalls.map((grant) => (
                <SelectItem key={grant.id} value={grant.id}>
                  {grant.name} {grant.shortname ? `(${grant.shortname})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedGrantCall && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('err:grants.summary')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">
                    {t('err:grants.total_amount')}
                  </div>
                  <div className="text-2xl font-bold text-right">
                    {Number(grantCalls.find(g => g.id === selectedGrantCall)?.amount || 0).toLocaleString()}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">
                    {t('err:grants.total_allocated')}
                  </div>
                  <div className="text-2xl font-bold text-muted-foreground text-right">
                    {allocations.reduce((sum, alloc) => 
                      sum + (Number(alloc.amount) || 0)
                    , 0).toLocaleString()}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">
                    {t('err:grants.remaining_amount')}
                  </div>
                  <div className={cn(
                    "text-2xl font-bold text-right",
                    {
                      'text-red-600': getRemainingAmount() < 0,
                      'text-green-600': getRemainingAmount() > 0,
                      'text-muted-foreground': getRemainingAmount() === 0
                    }
                  )}>
                    {getRemainingAmount().toLocaleString()}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t('err:grants.allocations')}</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleAddState}
                  disabled={isFullyAllocated()}
                  variant="outline"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {t('err:grants.add_state')}
                </Button>
                <Button
                  onClick={handleSaveAllocations}
                  disabled={isSubmitting || allocations.length === 0}
                  className="bg-[#007229] hover:bg-[#007229]/90 text-white"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {isSubmitting 
                    ? t('err:grants.saving')
                    : t('err:grants.save_changes')
                  }
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('err:grants.state')}</TableHead>
                      <TableHead className="text-right">{t('err:grants.amount')}</TableHead>
                      <TableHead>{t('err:grants.decision_no')}</TableHead>
                      <TableHead>{t('err:grants.created_at')}</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allocations.map((allocation) => (
                      <TableRow 
                        key={allocation.id || allocation.tempId}
                        className={cn({
                          'bg-muted/50': allocation.isEdited,
                          'bg-muted/20': allocation.isNew
                        })}
                      >
                        <TableCell>
                          {allocation.isNew ? (
                            <Select
                              value={allocation.state_name}
                              onValueChange={(value) => handleAllocationChange(allocation.tempId!, 'state_name', value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={t('err:grants.select_state')} />
                              </SelectTrigger>
                              <SelectContent>
                                {states.map((state) => (
                                  <SelectItem key={state.state_name} value={state.state_name}>
                                    {state.state_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            allocation.state_name
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="text"
                            value={allocation.amount ? Number(allocation.amount).toLocaleString() : ''}
                            onChange={(e) => {
                              const value = e.target.value.replace(/,/g, '').replace(/[^\d.]/g, '')
                              if (value === '' || !isNaN(Number(value))) {
                                handleAllocationChange(
                                  allocation.id || allocation.tempId!,
                                  'amount',
                                  value
                                )
                              }
                            }}
                            className="w-full text-right"
                          />
                        </TableCell>
                        <TableCell>{allocation.decision_no || '-'}</TableCell>
                        <TableCell>
                          {allocation.created_at 
                            ? new Date(allocation.created_at).toLocaleDateString()
                            : '-'
                          }
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setAllocations(prev => 
                                prev.filter(a => {
                                  // Keep the row if:
                                  // For existing allocations: its ID doesn't match
                                  if (allocation.id) return a.id !== allocation.id
                                  // For new allocations: its tempId doesn't match
                                  return a.tempId !== allocation.tempId
                                })
                              )
                            }}
                            className="h-8 w-8 text-destructive hover:text-destructive/80"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}