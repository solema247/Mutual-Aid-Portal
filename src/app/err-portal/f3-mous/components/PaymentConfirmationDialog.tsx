'use client'

import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { parsePaymentConfirmations } from '../lib/payment-confirmations'
import type { usePaymentModal } from '../hooks/usePaymentModal'
import type { MOU } from '../types'

type PaymentConfirmationDialogProps = ReturnType<typeof usePaymentModal>

export default function PaymentConfirmationDialog(props: PaymentConfirmationDialogProps) {
  const {
    paymentModalOpen,
    setPaymentModalOpen,
    selectedMouForPayment,
    setSelectedMouForPayment,
    paymentProjects,
    paymentConfirmations,
    setPaymentConfirmations,
    uploadingPayments,
    setUploadingPayments,
    uploadingAllPayments,
    setUploadingAllPayments,
    bulkPaymentExchangeRate,
    setBulkPaymentExchangeRate,
    bulkPaymentTransferDate,
    setBulkPaymentTransferDate,
    applyBulkPaymentToAllProjects,
    closePaymentModal,
    fetchMous,
  } = props
  const { t } = useTranslation(['f3'])

  return (      <Dialog
        open={paymentModalOpen}
        onOpenChange={(open) => { setPaymentModalOpen(open); if (!open) closePaymentModal() }}
      >
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Payment Confirmations - {selectedMouForPayment?.mou_code}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {paymentProjects.length} project{paymentProjects.length !== 1 ? 's' : ''} in this MOU
            </p>
          </DialogHeader>
          <div className="mt-2 rounded-md border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground mb-3">{t('f3:payment_modal.bulk_hint')}</p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="bulk-payment-exchange-rate" className="text-xs">
                  {t('f3:payment_modal.bulk_exchange_rate')}
                </Label>
                <Input
                  id="bulk-payment-exchange-rate"
                  type="number"
                  step="0.0001"
                  value={bulkPaymentExchangeRate}
                  onChange={(e) => setBulkPaymentExchangeRate(e.target.value)}
                  placeholder="e.g., 600.5"
                  className="h-8 w-[160px] text-sm"
                  disabled={uploadingAllPayments || Object.values(uploadingPayments).some(Boolean)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bulk-payment-transfer-date" className="text-xs">
                  {t('f3:payment_modal.bulk_transfer_date')}
                </Label>
                <Input
                  id="bulk-payment-transfer-date"
                  type="date"
                  value={bulkPaymentTransferDate}
                  onChange={(e) => setBulkPaymentTransferDate(e.target.value)}
                  className="h-8 w-[160px] text-sm"
                  disabled={uploadingAllPayments || Object.values(uploadingPayments).some(Boolean)}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8"
                onClick={applyBulkPaymentToAllProjects}
                disabled={
                  uploadingAllPayments ||
                  Object.values(uploadingPayments).some(Boolean) ||
                  paymentProjects.length === 0
                }
              >
                {t('f3:payment_modal.apply_to_all')}
              </Button>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <Table className="text-xs min-w-[700px]">
              <TableHeader>
                <TableRow className="[&>th]:py-1.5 [&>th]:px-2 [&>th]:text-xs">
                  <TableHead className="w-[100px] px-2">Room</TableHead>
                  <TableHead className="w-[140px] px-2">Grant Serial ID</TableHead>
                  <TableHead className="w-[110px] px-2">Exchange Rate</TableHead>
                  <TableHead className="w-[110px] px-2">Transfer Date</TableHead>
                  <TableHead className="w-[200px] px-2">Payment File</TableHead>
                  <TableHead className="w-[80px] px-2">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentProjects.map((project) => {
                  const confirmation = paymentConfirmations[project.id] || { exchange_rate: '', transfer_date: '', file: null, file_path: undefined }
                  const hasConfirmation = !!confirmation.file_path || (!!confirmation.exchange_rate && !!confirmation.transfer_date)
                  const isUploading = uploadingPayments[project.id] || false
                  
                  return (
                    <TableRow key={project.id} className="[&>td]:py-1.5 [&>td]:px-2 [&>td]:text-xs">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {project.emergency_room_name || '-'}
                          {hasConfirmation && (
                            <span className="text-xs bg-green-100 text-green-800 px-1.5 py-0.5 rounded">✓</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {project.grant_id || '-'}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.0001"
                          value={confirmation.exchange_rate}
                          onChange={(e) => {
                            setPaymentConfirmations(prev => ({
                              ...prev,
                              [project.id]: { ...prev[project.id], exchange_rate: e.target.value }
                            }))
                          }}
                          placeholder="e.g., 600.5"
                          className="h-8 text-sm"
                          disabled={isUploading}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="date"
                          value={confirmation.transfer_date}
                          onChange={(e) => {
                            setPaymentConfirmations(prev => ({
                              ...prev,
                              [project.id]: { ...prev[project.id], transfer_date: e.target.value }
                            }))
                          }}
                          className="h-8 text-sm"
                          disabled={isUploading}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => {
                              const file = e.target.files?.[0] || null
                              setPaymentConfirmations(prev => ({
                                ...prev,
                                [project.id]: { ...prev[project.id], file }
                              }))
                            }}
                            className="h-8 text-sm text-xs"
                            disabled={isUploading}
                          />
                          {confirmation.file_path && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs px-2"
                              onClick={async () => {
                                try {
                                  const response = await fetch(`/api/storage/signed-url?path=${encodeURIComponent(confirmation.file_path || '')}`)
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
                                  alert('Failed to open payment confirmation')
                                }
                              }}
                            >
                              View
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          onClick={async () => {
                            const conf = paymentConfirmations[project.id]
                            if (!conf?.file && !hasConfirmation && (!conf?.exchange_rate && !conf?.transfer_date)) {
                              alert('Please provide at least a file, exchange rate, or transfer date')
                              return
                            }
                            
                            try {
                              setUploadingPayments(prev => ({ ...prev, [project.id]: true }))
                              const formData = new FormData()
                              if (conf.file) {
                                formData.append('file', conf.file)
                              }
                              if (conf.exchange_rate) {
                                formData.append('exchange_rate', conf.exchange_rate)
                              }
                              if (conf.transfer_date) {
                                formData.append('transfer_date', conf.transfer_date)
                              }
                              formData.append('project_id', project.id)
                              
                              const response = await fetch(`/api/f3/mous/${selectedMouForPayment?.id}/payment-confirmation`, {
                                method: 'POST',
                                body: formData
                              })
                              
                              if (!response.ok) {
                                throw new Error('Failed to upload payment confirmation')
                              }
                              
                              const result = await response.json()
                              
                              // Refresh MOU data to get updated payment confirmations
                              const mouResponse = await fetch(`/api/f3/mous?state=${selectedMouForPayment?.state || 'all'}`)
                              const mouData = await mouResponse.json()
                              const updatedMou = mouData.find((m: MOU) => m.id === selectedMouForPayment?.id)
                              
                              if (updatedMou) {
                                // Re-parse payment confirmations
                                const existing = parsePaymentConfirmations(updatedMou.payment_confirmation_file)
                                const updatedConfirmations: Record<string, { exchange_rate: string; transfer_date: string; file: File | null; file_path?: string }> = {}
                                
                                paymentProjects.forEach(p => {
                                  const existingData = existing[p.id]
                                  updatedConfirmations[p.id] = {
                                    exchange_rate: existingData?.exchange_rate?.toString() || '',
                                    transfer_date: existingData?.transfer_date || '',
                                    file: null,
                                    file_path: existingData?.file_path
                                  }
                                })
                                
                                setPaymentConfirmations(updatedConfirmations)
                                setSelectedMouForPayment(updatedMou)
                              }
                              
                              // Refresh the MOUs list
                              await fetchMous()
                              alert('Payment confirmation saved successfully')
                            } catch (error) {
                              console.error('Error uploading payment confirmation:', error)
                              alert('Failed to save payment confirmation')
                            } finally {
                              setUploadingPayments(prev => ({ ...prev, [project.id]: false }))
                            }
                          }}
                          disabled={isUploading}
                          className="h-8 text-xs"
                        >
                          {isUploading ? '...' : hasConfirmation ? 'Update' : 'Upload'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            
            <div className="flex justify-end gap-2 pt-4 border-t mt-4">
              <Button
                variant="default"
                disabled={uploadingAllPayments || Object.values(uploadingPayments).some(Boolean)}
                onClick={async () => {
                  const ready = paymentProjects.filter((p) => {
                    const c = paymentConfirmations[p.id]
                    const hasFile = !!(c?.file || c?.file_path)
                    const hasMeta = !!(c?.exchange_rate?.trim() && c?.transfer_date?.trim())
                    return hasFile && hasMeta
                  })
                  if (ready.length === 0) {
                    alert('No projects ready to upload. Ensure each has a file (or existing file), exchange rate, and transfer date.')
                    return
                  }
                  setUploadingAllPayments(true)
                  const uploading: Record<string, boolean> = {}
                  ready.forEach((p) => { uploading[p.id] = true })
                  setUploadingPayments((prev) => ({ ...prev, ...uploading }))
                  try {
                    for (const project of ready) {
                      const conf = paymentConfirmations[project.id]!
                      const formData = new FormData()
                      if (conf.file) formData.append('file', conf.file)
                      if (conf.exchange_rate) formData.append('exchange_rate', conf.exchange_rate)
                      if (conf.transfer_date) formData.append('transfer_date', conf.transfer_date)
                      formData.append('project_id', project.id)
                      const response = await fetch(`/api/f3/mous/${selectedMouForPayment?.id}/payment-confirmation`, {
                        method: 'POST',
                        body: formData
                      })
                      if (!response.ok) {
                        const err = await response.json().catch(() => ({}))
                        throw new Error((err as { error?: string }).error || 'Failed to upload payment confirmation')
                      }
                    }
                    const mouResponse = await fetch(`/api/f3/mous?state=${selectedMouForPayment?.state || 'all'}`)
                    const mouData = await mouResponse.json()
                    const updatedMou = mouData.find((m: MOU) => m.id === selectedMouForPayment?.id)
                    if (updatedMou) {
                      const existing = parsePaymentConfirmations(updatedMou.payment_confirmation_file)
                      const updatedConfirmations: Record<string, { exchange_rate: string; transfer_date: string; file: File | null; file_path?: string }> = {}
                      paymentProjects.forEach((p) => {
                        const existingData = existing[p.id]
                        updatedConfirmations[p.id] = {
                          exchange_rate: existingData?.exchange_rate?.toString() ?? '',
                          transfer_date: existingData?.transfer_date ?? '',
                          file: null,
                          file_path: existingData?.file_path
                        }
                      })
                      setPaymentConfirmations(updatedConfirmations)
                      setSelectedMouForPayment(updatedMou)
                    }
                    await fetchMous()
                    alert(`Saved payment confirmations for ${ready.length} project${ready.length !== 1 ? 's' : ''}.`)
                  } catch (e) {
                    console.error(e)
                    alert(e instanceof Error ? e.message : 'Failed to save one or more payment confirmations.')
                  } finally {
                    setUploadingAllPayments(false)
                    setUploadingPayments({})
                  }
                }}
              >
                {uploadingAllPayments ? 'Uploading all...' : `Upload all (${paymentProjects.filter((p) => {
                  const c = paymentConfirmations[p.id]
                  return !!(c?.file || c?.file_path) && !!(c?.exchange_rate?.trim() && c?.transfer_date?.trim())
                }).length} ready)`}
              </Button>
              <Button
                variant="outline"
                onClick={closePaymentModal}
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
  )
}
