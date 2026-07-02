'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { useGrantAssignment } from '../hooks/useGrantAssignment'

type AssignGrantDialogProps = Pick<
  ReturnType<typeof useGrantAssignment>,
  | 'assignModalOpen'
  | 'setAssignModalOpen'
  | 'assigningMouId'
  | 'mous'
  | 'mouAssignmentStatus'
  | 'tempGrantId'
  | 'tempDonorName'
  | 'tempMMYY'
  | 'setTempMMYY'
  | 'grantsFromGridView'
  | 'grantRemaining'
  | 'stateAllocationRemaining'
  | 'mouTotalAmount'
  | 'mouProjects'
  | 'stateShorts'
  | 'donorShortNames'
  | 'selectedGrantMaxSequence'
  | 'isAssigning'
  | 'handleGrantSelect'
  | 'handleAssignMou'
  | 'resetAssignModal'
  | 'fmtUsd'
>

export default function AssignGrantDialog({
  assignModalOpen,
  setAssignModalOpen,
  assigningMouId,
  mous,
  mouAssignmentStatus,
  tempGrantId,
  tempDonorName,
  tempMMYY,
  setTempMMYY,
  grantsFromGridView,
  grantRemaining,
  stateAllocationRemaining,
  mouTotalAmount,
  mouProjects,
  stateShorts,
  donorShortNames,
  selectedGrantMaxSequence,
  isAssigning,
  handleGrantSelect,
  handleAssignMou,
  resetAssignModal,
  fmtUsd,
}: AssignGrantDialogProps) {
  return (      <Dialog open={assignModalOpen} onOpenChange={setAssignModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assign MOU to Grant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                Assigning all work plans in MOU {mous.find(m => m.id === assigningMouId)?.mou_code || ''} to a grant call
              </p>
              {mouAssignmentStatus[assigningMouId || ''] && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-sm font-medium text-blue-800">
                    This MOU contains {mouAssignmentStatus[assigningMouId || ''].projectCount} work plan(s) that will be assigned together.
                  </p>
                </div>
              )}
            </div>

            {/* Row 1: Grant and Donor */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Grant *</Label>
                <Select 
                  value={tempGrantId} 
                  onValueChange={handleGrantSelect}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select Grant" />
                  </SelectTrigger>
                  <SelectContent>
                    {grantsFromGridView.map((grant: any) => (
                      <SelectItem key={`${grant.grant_id}|${grant.donor_name}`} value={grant.grant_id}>
                        {grant.grant_id} - {grant.project_name || grant.grant_id} ({grant.donor_name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Donor</Label>
                <Input
                  value={tempDonorName}
                  disabled
                  className="bg-muted w-full"
                />
              </div>
            </div>

            {/* Row 2: MMYY */}
            <div className="grid grid-cols-1 gap-4">
              <div>
                <Label>MMYY *</Label>
                <Input
                  value={tempMMYY}
                  onChange={(e) => {
                    const newMMYY = e.target.value.replace(/[^0-9]/g, '').slice(0, 4)
                    setTempMMYY(newMMYY)
                  }}
                  placeholder="1224"
                  maxLength={4}
                  className="w-full"
                />
              </div>
            </div>

            {/* Remaining Amounts Display */}
            {(grantRemaining || stateAllocationRemaining) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Grant Remaining */}
                {grantRemaining && (
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-sm font-semibold">Grant Remaining</Label>
                      {grantRemaining.loading && (
                        <span className="text-xs text-muted-foreground">Calculating...</span>
                      )}
                    </div>
                    {!grantRemaining.loading && (
                      <>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Total:</span>
                            <span className="font-medium">${fmtUsd(grantRemaining.total)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Historical:</span>
                            <span>${fmtUsd(grantRemaining.historical ?? 0)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Committed:</span>
                            <span>${fmtUsd(grantRemaining.committed)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Allocated:</span>
                            <span>${fmtUsd(grantRemaining.allocated)}</span>
                          </div>
                          <div className="pt-2 border-t flex justify-between items-center">
                            <span className="font-semibold">Remaining:</span>
                            <span className={`font-bold text-lg ${
                              grantRemaining.remaining < 0 ? 'text-red-600' :
                              grantRemaining.remaining < mouTotalAmount ? 'text-yellow-600' :
                              'text-green-600'
                            }`}>
                              ${fmtUsd(grantRemaining.remaining)}
                            </span>
                          </div>
                          {mouTotalAmount > 0 && (
                            <div className="pt-1 text-xs">
                              <div className="flex justify-between text-muted-foreground">
                                <span>After assignment:</span>
                                <span className={`font-medium ${
                                  (grantRemaining.remaining - mouTotalAmount) < 0 ? 'text-red-600' :
                                  (grantRemaining.remaining - mouTotalAmount) < mouTotalAmount ? 'text-yellow-600' :
                                  'text-green-600'
                                }`}>
                                  ${fmtUsd(grantRemaining.remaining - mouTotalAmount)}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* State Allocation Remaining */}
                {stateAllocationRemaining && mouProjects.length > 0 && (
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-sm font-semibold">
                        State Allocation Remaining ({mouProjects[0]?.state})
                      </Label>
                      {stateAllocationRemaining.loading && (
                        <span className="text-xs text-muted-foreground">Calculating...</span>
                      )}
                    </div>
                    {!stateAllocationRemaining.loading && (
                      <>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Total:</span>
                            <span className="font-medium">${fmtUsd(stateAllocationRemaining.total)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Historical:</span>
                            <span>${fmtUsd(stateAllocationRemaining.historical ?? 0)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Committed:</span>
                            <span>${fmtUsd(stateAllocationRemaining.committed)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Allocated:</span>
                            <span>${fmtUsd(stateAllocationRemaining.allocated)}</span>
                          </div>
                          <div className="pt-2 border-t flex justify-between items-center">
                            <span className="font-semibold">Remaining:</span>
                            <span className={`font-bold text-lg ${
                              stateAllocationRemaining.remaining < 0 ? 'text-red-600' :
                              stateAllocationRemaining.remaining < mouTotalAmount ? 'text-yellow-600' :
                              'text-green-600'
                            }`}>
                              ${fmtUsd(stateAllocationRemaining.remaining)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground pt-0.5">Remaining = Total âˆ’ Historical âˆ’ Committed âˆ’ Allocated</p>
                          {mouTotalAmount > 0 && (
                            <div className="pt-1 text-xs">
                              <div className="flex justify-between text-muted-foreground">
                                <span>After assignment:</span>
                                <span className={`font-medium ${
                                  (stateAllocationRemaining.remaining - mouTotalAmount) < 0 ? 'text-red-600' :
                                  (stateAllocationRemaining.remaining - mouTotalAmount) < mouTotalAmount ? 'text-yellow-600' :
                                  'text-green-600'
                                }`}>
                                  ${fmtUsd(stateAllocationRemaining.remaining - mouTotalAmount)}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* MOU Total Amount Info */}
            {mouTotalAmount > 0 && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-sm">
                  <span className="font-semibold">MOU Total Amount:</span>{' '}
                  <span className="font-mono">${fmtUsd(mouTotalAmount)}</span>
                </p>
              </div>
            )}

            {/* Generated Grant ID Preview */}
            {mouProjects.length > 0 && tempGrantId && tempDonorName && tempMMYY && tempMMYY.length === 4 && (
              <div>
                <Label>Generated Workplan Serial IDs</Label>
                <div className="p-3 bg-muted rounded-md font-mono text-sm max-h-64 overflow-y-auto mt-2">
                  {mouProjects.map((project, idx) => {
                    const stateShort = stateShorts[project.state] || 'XX'
                    const mmyy = tempMMYY
                    
                    // Get donor short name from the grants_grid_view grant
                    const selectedGrant = grantsFromGridView.find((g: any) => g.grant_id === tempGrantId && g.donor_name === tempDonorName)
                    const donorShort = selectedGrant?.donor_id ? (donorShortNames[selectedGrant.donor_id] || 'XXX') : 'XXX'
                    
                    // Get max workplan sequence from grants_grid_view for preview
                    // Start from max_workplan_sequence + 1 for the first project, then increment
                    const workplanNum = selectedGrantMaxSequence + idx + 1
                    
                    // Format: LCC-DonorShort-StateShort-MMYY-WorkplanSeq
                    const generatedSerial = `LCC-${donorShort}-${stateShort}-${mmyy}-${String(workplanNum).padStart(4, '0')}`
                    
                    return (
                      <div key={project.id} className="py-1 border-b border-border/50 last:border-0">
                        <div className="font-semibold">{generatedSerial}</div>
                        <div className="text-xs text-muted-foreground">
                          {project.err_id || project.id.slice(0, 8)} - {project.state} - {project.locality || 'N/A'}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  These are the serial IDs that will be assigned to each work plan in this MOU. Format: LCC-DonorShort-StateShort-MMYY-WorkplanSeq
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={resetAssignModal}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAssignMou}
                disabled={!tempGrantId || !tempDonorName || !tempMMYY || tempMMYY.length !== 4 || isAssigning}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {isAssigning ? 'Assigning...' : 'Assign to Grant'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

  )
}

