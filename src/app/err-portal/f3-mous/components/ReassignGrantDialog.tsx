'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { useGrantAssignment } from '../hooks/useGrantAssignment'

type ReassignGrantDialogProps = Pick<
  ReturnType<typeof useGrantAssignment>,
  | 'reassignModalOpen'
  | 'setReassignModalOpen'
  | 'reassigningMouId'
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
  | 'isReassigning'
  | 'handleReassignGrantSelect'
  | 'handleReassignMou'
  | 'resetReassignModal'
  | 'fmtUsd'
>

export default function ReassignGrantDialog({
  reassignModalOpen,
  setReassignModalOpen,
  reassigningMouId,
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
  isReassigning,
  handleReassignGrantSelect,
  handleReassignMou,
  resetReassignModal,
  fmtUsd,
}: ReassignGrantDialogProps) {
  return (      <Dialog open={reassignModalOpen} onOpenChange={setReassignModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reassign MOU to Grant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                Reassigning all assigned work plans in MOU {mous.find(m => m.id === reassigningMouId)?.mou_code || ''} to a new grant
              </p>
              {mouAssignmentStatus[reassigningMouId || ''] && (
                <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-md">
                  <p className="text-sm font-medium text-orange-800">
                    This MOU contains {mouAssignmentStatus[reassigningMouId || ''].projectCount} work plan(s) that will be reassigned together.
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
                  onValueChange={handleReassignGrantSelect}>
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
                                <span>After reassignment:</span>
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
                                <span>After reassignment:</span>
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
              <div className="p-3 bg-orange-50 border border-orange-200 rounded-md">
                <p className="text-sm">
                  <span className="font-semibold">MOU Total Amount:</span>{' '}
                  <span className="font-mono">${fmtUsd(mouTotalAmount)}</span>
                </p>
              </div>
            )}

            {/* Preview generated serials */}
            {tempGrantId && tempDonorName && tempMMYY && tempMMYY.length === 4 && mouProjects.length > 0 && (
              <div className="p-3 bg-muted rounded-md">
                <Label className="text-sm font-semibold mb-2 block">Generated Workplan Serial IDs:</Label>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {mouProjects.map((project, idx) => {
                    const selectedGrant = grantsFromGridView.find((g: any) => g.grant_id === tempGrantId && g.donor_name === tempDonorName)
                    const donorShort = donorShortNames[selectedGrant?.donor_id || ''] || 'XXX'
                    const stateShort = stateShorts[project.state] || 'XX'
                    const workplanSeq = String((selectedGrantMaxSequence || 0) + idx + 1).padStart(4, '0')
                    const generatedSerial = `LCC-${donorShort}-${stateShort}-${tempMMYY}-${workplanSeq}`
                    const displayLabel = project.err_id || `${project.state} - ${project.locality || 'N/A'}` || 'Project'
                    
                    return (
                      <div key={project.id} className="text-sm font-mono">
                        {displayLabel}: {generatedSerial}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={resetReassignModal}
              >
                Cancel
              </Button>
              <Button
                onClick={handleReassignMou}
                disabled={!tempGrantId || !tempDonorName || !tempMMYY || tempMMYY.length !== 4 || isReassigning}
                className="bg-orange-600 hover:bg-orange-700 text-white"
              >
                {isReassigning ? 'Reassigning...' : 'Reassign to Grant'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

  )
}

