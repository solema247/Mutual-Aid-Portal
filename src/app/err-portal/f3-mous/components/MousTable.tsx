'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Eye, Upload, Receipt, FileSignature, FileCheck, Link2, RefreshCw, ListOrdered, ArrowUp, ArrowDown } from 'lucide-react'
import { SmartFilter, type ActiveFilter } from '@/components/smart-filter'
import { cn } from '@/lib/utils'
import { getPaymentConfirmationCount } from '../lib/payment-confirmations'
import type { MOU, MouAssignmentStatus } from '../types'
import type { FilterFieldConfig } from '@/components/smart-filter'

export interface MousTableProps {
  loading: boolean
  mouFilterFields: FilterFieldConfig[]
  mousFilters: ActiveFilter[]
  setMousFilters: (filters: ActiveFilter[]) => void
  filteredMous: MOU[]
  sortedMous: MOU[]
  paginatedMous: MOU[]
  itemsPerPage: number
  currentPage: number
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>
  sortCreatedOrder: 'asc' | 'desc'
  setSortCreatedOrder: React.Dispatch<React.SetStateAction<'asc' | 'desc'>>
  mouGrantIds: Record<string, string>
  mouProjectCounts: Record<string, number>
  mouPaymentProjectCounts: Record<string, number>
  mouAssignmentStatus: Record<string, MouAssignmentStatus>
  canManageProjects: boolean
  canAssign: boolean
  canReassignGrant: boolean
  canViewMou: boolean
  canManagePayment: boolean
  canUploadSignedMou: boolean
  openListProjectsModal: (mou: MOU) => void
  openAssignModal: (mouId: string) => void
  openReassignModal: (mouId: string) => void
  openPreview: (mou: MOU) => void
  openPaymentModal: (mou: MOU) => void
  fetchMous: () => Promise<void>
}

export default function MousTable({
  loading,
  mouFilterFields,
  mousFilters,
  setMousFilters,
  filteredMous,
  sortedMous,
  paginatedMous,
  itemsPerPage,
  currentPage,
  setCurrentPage,
  sortCreatedOrder,
  setSortCreatedOrder,
  mouGrantIds,
  mouProjectCounts,
  mouPaymentProjectCounts,
  mouAssignmentStatus,
  canManageProjects,
  canAssign,
  canReassignGrant,
  canViewMou,
  canManagePayment,
  canUploadSignedMou,
  openListProjectsModal,
  openAssignModal,
  openReassignModal,
  openPreview,
  openPaymentModal,
  fetchMous,
}: MousTableProps) {
  const { t, i18n } = useTranslation(['f3', 'common'])
  const [signedMouEditId, setSignedMouEditId] = useState<string | null>(null)
  const [pendingSignedFile, setPendingSignedFile] = useState<File | null>(null)
  const [savingSignedMou, setSavingSignedMou] = useState(false)

  const signedMouBeingEdited = signedMouEditId
    ? sortedMous.find(m => m.id === signedMouEditId) ?? null
    : null

  const closeSignedMouDialog = () => {
    setSignedMouEditId(null)
    setPendingSignedFile(null)
  }

  const openSignedMou = async (fileKey: string) => {
    try {
      const response = await fetch(`/api/storage/signed-url?path=${encodeURIComponent(fileKey)}`)
      if (!response.ok) {
        throw new Error('Failed to get signed URL')
      }
      const { url, error } = await response.json()
      if (error || !url) {
        throw new Error(error || 'No URL returned')
      }

      const link = document.createElement('a')
      link.href = url
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error('Error getting signed URL:', error)
      alert('Failed to open signed MOU')
    }
  }

  const uploadSignedMou = async (mouId: string, file: File, isReplace: boolean) => {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch(`/api/f3/mous/${mouId}/signed-mou`, {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      throw new Error('Failed to upload signed MOU')
    }

    await fetchMous()
    alert(isReplace ? 'Signed MOU replaced successfully' : 'Signed MOU uploaded successfully')
  }

  return (      <Card className="w-full">
        <CardHeader className="pb-4">
          <SmartFilter
            fields={mouFilterFields}
            filters={mousFilters}
            onFiltersChange={setMousFilters}
            urlParamPrefix="f3m_"
            title={t('f3:title')}
            count={loading ? undefined : filteredMous.length}
          />
        </CardHeader>
        <CardContent className="space-y-4 w-full overflow-x-auto">
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">{t('common:loading') || 'Loading...'}</div>
          ) : (
            <>
              <Table dir={i18n.language === 'ar' ? 'rtl' : 'ltr'} className="w-full min-w-[800px] text-xs">
                <TableHeader>
                  <TableRow className="[&>th]:py-2 [&>th]:px-2 [&>th]:text-xs">
                    <TableHead className="min-w-[90px] px-2">{t('f3:headers.mou_code')}</TableHead>
                    <TableHead className="min-w-[100px] px-2">Grant ID</TableHead>
                    <TableHead className="min-w-[120px] px-2">{t('f3:headers.err_state')}</TableHead>
                    <TableHead className="text-right min-w-[70px] px-2">{t('f3:headers.total')}</TableHead>
                    <TableHead className="min-w-[80px] px-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto py-1 px-1 -ml-1 text-xs font-medium hover:bg-muted/60"
                        onClick={() => { setSortCreatedOrder(o => o === 'desc' ? 'asc' : 'desc'); setCurrentPage(1) }}
                      >
                        {t('f3:headers.created')}
                        {sortCreatedOrder === 'desc' ? <ArrowDown className="ml-1 h-3.5 w-3.5 inline" /> : <ArrowUp className="ml-1 h-3.5 w-3.5 inline" />}
                      </Button>
                    </TableHead>
                    <TableHead className="min-w-[260px] px-2">{t('f3:headers.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
              <TableBody>
                {paginatedMous.map(m => (
                      <TableRow key={m.id} className="[&>td]:py-1.5 [&>td]:px-2 [&>td]:text-xs">
                    <TableCell className="font-medium whitespace-nowrap">{m.mou_code}</TableCell>
                    <TableCell className="whitespace-nowrap">{mouGrantIds[m.id] || '-'}</TableCell>
                    <TableCell className="max-w-[140px] truncate" title={`${m.err_name}${m.state ? ` - ${m.state}` : ''}`}>{m.err_name}{m.state ? ` - ${m.state}` : ''}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{Number(m.total_amount || 0).toLocaleString()}</TableCell>
                    <TableCell className="whitespace-nowrap">{new Date(m.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="align-top whitespace-nowrap">
                      <div className="flex items-start gap-1.5 flex-nowrap">
                        {canManageProjects && (
                        <div className="flex flex-col items-center gap-0.5 min-w-[42px] flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openListProjectsModal(m)}
                            title="List Projects"
                          >
                            <ListOrdered className="h-3.5 w-3.5 text-slate-600" />
                          </Button>
                          <span className="text-[9px] text-muted-foreground text-center leading-tight">List</span>
                        </div>
                        )}
                        {mouAssignmentStatus[m.id]?.hasUnassigned && canAssign && (
                          <div className="flex flex-col items-center gap-0.5 min-w-[42px]">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => openAssignModal(m.id)}
                              title="Assign to Grant"
                            >
                              <Link2 className="h-3.5 w-3.5 text-blue-600" />
                            </Button>
                            <span className="text-[9px] text-muted-foreground text-center leading-tight">Assign</span>
                          </div>
                        )}
                        {mouAssignmentStatus[m.id]?.hasAssigned && canReassignGrant && (
                          <div className="flex flex-col items-center gap-0.5 min-w-[42px]">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => openReassignModal(m.id)}
                              title="Reassign to Grant"
                            >
                              <RefreshCw className="h-3.5 w-3.5 text-orange-600" />
                            </Button>
                            <span className="text-[9px] text-muted-foreground text-center leading-tight">Reassign</span>
                          </div>
                        )}
                        {canViewMou && (
                        <div className="flex flex-col items-center gap-0.5 min-w-[42px]">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openPreview(m)} title={t('f3:preview')}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <span className="text-[9px] text-muted-foreground text-center leading-tight">{t('f3:preview')}</span>
                    </div>
                        )}
                        {canManagePayment && (
                        <div className="flex flex-col items-center gap-0.5 min-w-[42px]">
                          {(() => {
                            const projectCount = mouPaymentProjectCounts[m.id] ?? mouProjectCounts[m.id] ?? 0
                            const paymentCount = getPaymentConfirmationCount(m, projectCount)
                            const isPartial = paymentCount.confirmed > 0 && paymentCount.confirmed < paymentCount.total
                            const missing = paymentCount.total - paymentCount.confirmed
                            return (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => openPaymentModal(m)}
                                  title={
                                    paymentCount.confirmed === 0
                                      ? t('f3:add_payment')
                                      : isPartial
                                        ? t('f3:view_payment_partial', {
                                            confirmed: paymentCount.confirmed,
                                            total: paymentCount.total,
                                            missing
                                          })
                                        : t('f3:view_payment')
                                  }
                                >
                                  {paymentCount.confirmed === 0 ? (
                                    <Upload className="h-3.5 w-3.5 text-amber-600" />
                                  ) : paymentCount.confirmed === paymentCount.total ? (
                                    <Receipt className="h-3.5 w-3.5 text-green-600" />
                                  ) : (
                                    <Receipt className="h-3.5 w-3.5 text-amber-600" />
                                  )}
                                </Button>
                                <span
                                  className={cn(
                                    'text-[9px] text-center leading-tight whitespace-nowrap',
                                    isPartial
                                      ? 'font-medium text-amber-600'
                                      : 'text-muted-foreground'
                                  )}
                                  title={isPartial ? t('f3:view_payment_partial', { confirmed: paymentCount.confirmed, total: paymentCount.total, missing }) : undefined}
                                >
                                  {paymentCount.confirmed === 0
                                    ? (paymentCount.total > 0 ? `0/${paymentCount.total}` : t('f3:add_payment'))
                                    : isPartial
                                      ? `${paymentCount.confirmed}/${paymentCount.total}`
                                      : t('f3:view_payment_short')}
                                </span>
                                {isPartial && (
                                  <span className="text-[8px] text-amber-600 font-medium" title={t('f3:view_payment_partial', { confirmed: paymentCount.confirmed, total: paymentCount.total, missing })}>
                                    {t('f3:payment_missing_count', { count: missing })}
                                  </span>
                                )}
                              </>
                            )
                          })()}
                      </div>
                        )}
                        {canUploadSignedMou && (
                        <>
                        <input
                          type="file"
                          id={`signed-mou-upload-${m.id}`}
                          className="hidden"
                          accept=".pdf"
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            e.target.value = ''
                            if (!file) return

                            try {
                              await uploadSignedMou(m.id, file, false)
                            } catch (error) {
                              console.error('Error uploading signed MOU:', error)
                              alert('Failed to upload signed MOU')
                            }
                          }}
                        />
                        <div className="flex flex-col items-center gap-0.5 min-w-[42px]">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              if (m.signed_mou_file_key) {
                                setPendingSignedFile(null)
                                setSignedMouEditId(m.id)
                              } else {
                                document.getElementById(`signed-mou-upload-${m.id}`)?.click()
                              }
                            }}
                            title={m.signed_mou_file_key ? 'View / Edit Signed MOU' : 'Upload Signed MOU'}
                          >
                            {m.signed_mou_file_key ? (
                              <FileCheck className="h-3.5 w-3.5 text-green-600" />
                            ) : (
                              <FileSignature className="h-3.5 w-3.5 text-amber-600" />
                            )}
                          </Button>
                          <span className="text-[9px] text-muted-foreground text-center leading-tight whitespace-nowrap">
                            {m.signed_mou_file_key ? 'View / Edit' : 'Upload MOU'}
                          </span>
                        </div>
                        </>
                        )}
                      </div>
                    </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>

              <Dialog
                open={Boolean(signedMouEditId)}
                onOpenChange={(open) => {
                  if (!open) closeSignedMouDialog()
                }}
              >
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>View / Edit Signed MOU</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      {signedMouBeingEdited?.mou_code
                        ? `MOU ${signedMouBeingEdited.mou_code}`
                        : 'Signed MOU'}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        if (signedMouBeingEdited?.signed_mou_file_key) {
                          void openSignedMou(signedMouBeingEdited.signed_mou_file_key)
                        }
                      }}
                      disabled={!signedMouBeingEdited?.signed_mou_file_key}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      View current file
                    </Button>
                    <div className="space-y-2">
                      <input
                        id="signed-mou-replace-input"
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        onChange={(e) => {
                          setPendingSignedFile(e.target.files?.[0] ?? null)
                          e.target.value = ''
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          document.getElementById('signed-mou-replace-input')?.click()
                        }}
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        {pendingSignedFile ? 'Choose a different PDF' : 'Choose a new PDF'}
                      </Button>
                      {pendingSignedFile ? (
                        <p className="text-xs text-muted-foreground truncate" title={pendingSignedFile.name}>
                          Selected: {pendingSignedFile.name}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Select a PDF to replace the current signed MOU, then save.
                        </p>
                      )}
                    </div>
                  </div>
                  <DialogFooter className="gap-2 sm:gap-0">
                    <Button type="button" variant="outline" onClick={closeSignedMouDialog} disabled={savingSignedMou}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      disabled={!pendingSignedFile || savingSignedMou || !signedMouEditId}
                      onClick={async () => {
                        if (!pendingSignedFile || !signedMouEditId) return
                        setSavingSignedMou(true)
                        try {
                          await uploadSignedMou(signedMouEditId, pendingSignedFile, true)
                          closeSignedMouDialog()
                        } catch (error) {
                          console.error('Error replacing signed MOU:', error)
                          alert('Failed to replace signed MOU')
                        } finally {
                          setSavingSignedMou(false)
                        }
                      }}
                    >
                      {savingSignedMou ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              
              {/* Pagination Controls */}
              {sortedMous.length > itemsPerPage && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, sortedMous.length)} of {sortedMous.length} MOUs
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.min(Math.ceil(sortedMous.length / itemsPerPage), prev + 1))}
                      disabled={currentPage >= Math.ceil(sortedMous.length / itemsPerPage)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
  )
}
