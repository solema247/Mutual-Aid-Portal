'use client'

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabaseClient'
import { AlertCircle, CheckCircle } from 'lucide-react'

interface GrantCallOption {
  id: string
  name: string
  donor_name: string
  amount_included: number
  remaining_amount: number
}

interface AssignToGrantCallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workplanId: string | null;
  cycleId: string | null;
  onAssign?: () => void;
}

export default function AssignToGrantCallModal({
  open,
  onOpenChange,
  workplanId,
  cycleId,
  onAssign
}: AssignToGrantCallModalProps) {
  const { t } = useTranslation(['f2', 'common'])
  const [isLoading, setIsLoading] = useState(false)
  const [grantCallOptions, setGrantCallOptions] = useState<GrantCallOption[]>([])
  const [selectedGrantCallId, setSelectedGrantCallId] = useState<string>('')
  const [assignmentReason, setAssignmentReason] = useState<string>('')
  const [workplanAmount, setWorkplanAmount] = useState<number>(0)
  const [isLoadingOptions, setIsLoadingOptions] = useState(false)

  // Fetch available grant calls when modal opens
  useEffect(() => {
    const fetchGrantCallOptions = async () => {
      if (!open || !cycleId) return

      try {
        setIsLoadingOptions(true)

        // Get grant calls included in this cycle
        const { data: cycleInclusions, error: inclusionsError } = await supabase
          .from('cycle_grant_inclusions')
          .select(`
            grant_call_id,
            amount_included,
            grant_calls!inner(
              id,
              name,
              donor_id,
              donors!inner(name)
            )
          `)
          .eq('cycle_id', cycleId)

        if (inclusionsError) throw inclusionsError

        // Calculate remaining amounts for each grant call
        const grantCallOptions = await Promise.all(
          (cycleInclusions || []).map(async (inclusion: any) => {
            const grantCall = inclusion.grant_calls
            const donor = Array.isArray(grantCall.donors) ? grantCall.donors[0] : grantCall.donors

            // Get committed amount for this grant call
            const { data: committedProjects, error: committedError } = await supabase
              .from('err_projects')
              .select('expenses')
              .eq('grant_call_id', inclusion.grant_call_id)
              .eq('status', 'approved')
              .eq('funding_status', 'committed')

            if (committedError) {
              console.error('Error fetching committed projects:', committedError)
            }

            const committedAmount = (committedProjects || []).reduce((sum: number, project: any) => {
              try {
                const expenses = typeof project.expenses === 'string' 
                  ? JSON.parse(project.expenses) 
                  : project.expenses
                
                return sum + expenses.reduce((expSum: number, exp: any) => 
                  expSum + (exp.total_cost || 0), 0)
              } catch (error) {
                console.warn('Error parsing expenses:', error)
                return sum
              }
            }, 0)

            const remainingAmount = inclusion.amount_included - committedAmount

            return {
              id: inclusion.grant_call_id,
              name: grantCall.name,
              donor_name: donor.name,
              amount_included: inclusion.amount_included,
              remaining_amount: remainingAmount
            }
          })
        )

        // Filter out grant calls with no remaining amount
        const availableOptions = grantCallOptions.filter(option => option.remaining_amount > 0)
        setGrantCallOptions(availableOptions)

        console.log('Available grant call options:', availableOptions)
      } catch (error) {
        console.error('Error fetching grant call options:', error)
      } finally {
        setIsLoadingOptions(false)
      }
    }

    fetchGrantCallOptions()
  }, [open, cycleId])

  // Fetch workplan amount when modal opens
  useEffect(() => {
    const fetchWorkplanAmount = async () => {
      if (!open || !workplanId) return

      try {
        const { data, error } = await supabase
          .from('err_projects')
          .select('expenses')
          .eq('id', workplanId)
          .single()

        if (error) throw error

        const expenses = typeof data.expenses === 'string' 
          ? JSON.parse(data.expenses) 
          : data.expenses

        const totalAmount = expenses.reduce((sum: number, exp: any) => 
          sum + (exp.total_cost || 0), 0)

        setWorkplanAmount(totalAmount)
      } catch (error) {
        console.error('Error fetching workplan amount:', error)
      }
    }

    fetchWorkplanAmount()
  }, [open, workplanId])

  const handleSubmit = async () => {
    if (!workplanId || !selectedGrantCallId || !assignmentReason) {
      return
    }

    try {
      setIsLoading(true)

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError

      // Get workplan details to get cycle state allocation and state
      const { data: workplanData, error: workplanError } = await supabase
        .from('err_projects')
        .select('cycle_state_allocation_id, grant_serial_id, state')
        .eq('id', workplanId)
        .single()

      if (workplanError) throw workplanError

      // Find the grant call state allocation for this grant call and state
      // This is needed because the database constraint requires grant_call_state_allocation_id to be NOT NULL
      const { data: grantCallAllocation, error: allocationError } = await supabase
        .from('grant_call_state_allocations')
        .select('id')
        .eq('grant_call_id', selectedGrantCallId)
        .eq('state_name', workplanData.state)
        .order('decision_no', { ascending: false })
        .limit(1)
        .single()

      if (allocationError) {
        console.error('Error fetching grant call allocation:', allocationError)
        throw new Error(`No state allocation found for grant call and state: ${workplanData.state}`)
      }

      // Update workplan with grant call assignment
      const { error: updateError } = await supabase
        .from('err_projects')
        .update({
          grant_call_id: selectedGrantCallId,
          grant_call_state_allocation_id: grantCallAllocation.id
        })
        .eq('id', workplanId)

      if (updateError) throw updateError

      // Extract base grant serial from workplan's grant_serial_id
      // Workplan ID format: LCC-CYCLEWK38-P2H-KA-1025-0001-001
      // Base serial format: LCC-CYCLEWK38-P2H-KA-1025-0001
      let baseGrantSerial = workplanData.grant_serial_id
      if (baseGrantSerial && baseGrantSerial.includes('-')) {
        const parts = baseGrantSerial.split('-')
        const last = parts[parts.length - 1]
        // Only strip a trailing 3-digit workplan suffix (e.g., -001). Keep 4-digit base segment (e.g., -0001)
        if (/^\d{3}$/.test(last)) {
          baseGrantSerial = parts.slice(0, -1).join('-')
        }
      }

      // Create assignment record in commitment ledger
      // Note: We include both old and new fields for compatibility
      const { error: ledgerError } = await supabase
        .from('grant_project_commitment_ledger')
        .insert({
          workplan_id: workplanId,
          grant_call_id: selectedGrantCallId,
          grant_call_state_allocation_id: grantCallAllocation.id, // Required by database constraint
          grant_serial_id: baseGrantSerial || workplanId,
          delta_amount: workplanAmount,
          reason: `Grant call assignment: ${assignmentReason}`,
          created_by: user?.id,
          funding_cycle_id: cycleId,
          cycle_state_allocation_id: workplanData.cycle_state_allocation_id
        })

      if (ledgerError) throw ledgerError

      onOpenChange(false)
      onAssign?.() // Notify parent that assignment was made
    } catch (error) {
      console.error('Error assigning to grant call:', error)
      alert('Failed to assign workplan to grant call')
    } finally {
      setIsLoading(false)
    }
  }

  const selectedOption = grantCallOptions.find(option => option.id === selectedGrantCallId)
  const canAssign = selectedOption && workplanAmount <= selectedOption.remaining_amount

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Assign Workplan to Grant Call</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {isLoadingOptions ? (
            <div className="text-center py-4">Loading available grant calls...</div>
          ) : grantCallOptions.length === 0 ? (
            <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <span className="text-yellow-800">
                No grant calls available with remaining funds in this cycle.
              </span>
            </div>
          ) : (
            <>
              <div className="grid gap-2">
                <Label>Workplan Amount</Label>
                <div className="p-2 bg-muted rounded-md font-medium">
                  ${workplanAmount.toLocaleString()}
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Select Grant Call</Label>
                <Select value={selectedGrantCallId} onValueChange={setSelectedGrantCallId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a grant call..." />
                  </SelectTrigger>
                  <SelectContent>
                    {grantCallOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        <div className="flex flex-col">
                          <span className="font-medium">{option.name}</span>
                          <span className="text-sm text-muted-foreground">
                            {option.donor_name} - ${option.remaining_amount.toLocaleString()} remaining
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedOption && (
                <div className="grid gap-2">
                  <Label>Assignment Validation</Label>
                  {canAssign ? (
                    <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-md">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-green-800">
                        ✅ Assignment valid. Grant call has sufficient remaining funds.
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
                      <AlertCircle className="h-4 w-4 text-red-600" />
                      <span className="text-red-800">
                        ❌ Assignment invalid. Workplan amount (${workplanAmount.toLocaleString()}) 
                        exceeds remaining funds (${selectedOption.remaining_amount.toLocaleString()}).
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="grid gap-2">
                <Label>Assignment Reason</Label>
                <Textarea
                  value={assignmentReason}
                  onChange={(e) => setAssignmentReason(e.target.value)}
                  placeholder="Explain why this workplan should be assigned to this grant call..."
                />
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading || !canAssign || !assignmentReason}
          >
            {isLoading ? 'Assigning...' : 'Assign to Grant Call'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
