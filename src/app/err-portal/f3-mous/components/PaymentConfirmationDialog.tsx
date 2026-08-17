'use client'

import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { usePaymentModal } from '../hooks/usePaymentModal'
import type { NewPaymentDraft, PaymentConfirmationRecord, PaymentFileRecord } from '../types'

type PaymentConfirmationDialogProps = ReturnType<typeof usePaymentModal>

async function openSignedUrl(filePath: string) {
  const response = await fetch(
    `/api/storage/signed-url?path=${encodeURIComponent(filePath)}`
  )
  if (!response.ok) throw new Error('Failed to get signed URL')
  const { url, error } = await response.json()
  if (error || !url) throw new Error(error || 'No URL returned')
  const link = document.createElement('a')
  link.href = url
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export default function PaymentConfirmationDialog(props: PaymentConfirmationDialogProps) {
  const {
    paymentModalOpen,
    setPaymentModalOpen,
    selectedMouForPayment,
    paymentProjects,
    confirmationsByProject,
    setConfirmationsByProject,
    newDrafts,
    setNewDrafts,
    loadingConfirmations,
    busyKeys,
    setBusy,
    bulkPaymentExchangeRate,
    setBulkPaymentExchangeRate,
    bulkPaymentTransferDate,
    setBulkPaymentTransferDate,
    applyBulkPaymentToAllProjects,
    closePaymentModal,
    refreshConfirmations,
    fetchMous,
  } = props
  const { t } = useTranslation(['f3'])
  const anyBusy = Object.keys(busyKeys).length > 0

  const updateDraft = (projectId: string, patch: Partial<NewPaymentDraft>) => {
    setNewDrafts((prev) => ({
      ...prev,
      [projectId]: {
        ...(prev[projectId] || { exchange_rate: '', transfer_date: '', files: [] }),
        ...patch,
      },
    }))
  }

  const patchLocalConfirmation = (
    projectId: string,
    confirmationId: string,
    patch: Partial<PaymentConfirmationRecord>
  ) => {
    setConfirmationsByProject((prev) => {
      const list = prev[projectId] || []
      return {
        ...prev,
        [projectId]: list.map((c) =>
          c.id === confirmationId ? { ...c, ...patch } : c
        ),
      }
    })
  }

  const createConfirmation = async (projectId: string, opts?: { silent?: boolean }) => {
    const draft = newDrafts[projectId]
    if (!draft || !selectedMouForPayment) return false
    if (!draft.exchange_rate.trim() && !draft.transfer_date.trim() && draft.files.length === 0) {
      if (!opts?.silent) alert(t('f3:payment_modal.create_required'))
      return false
    }
    const key = `create:${projectId}`
    try {
      setBusy(key, true)
      const formData = new FormData()
      formData.append('project_id', projectId)
      if (draft.exchange_rate.trim()) formData.append('exchange_rate', draft.exchange_rate.trim())
      if (draft.transfer_date.trim()) formData.append('transfer_date', draft.transfer_date.trim())
      for (const file of draft.files) formData.append('files', file)

      const response = await fetch(
        `/api/f3/mous/${selectedMouForPayment.id}/payment-confirmation`,
        { method: 'POST', body: formData }
      )
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || 'Failed to create payment confirmation')
      }

      updateDraft(projectId, { exchange_rate: '', transfer_date: '', files: [] })
      return true
    } catch (e) {
      console.error(e)
      if (!opts?.silent) {
        alert(e instanceof Error ? e.message : 'Failed to create payment confirmation')
      }
      throw e
    } finally {
      setBusy(key, false)
    }
  }

  const uploadAllPaymentConfirmations = async () => {
    if (!selectedMouForPayment) return
    const ready = paymentProjects.filter((project) => {
      const draft = newDrafts[project.id]
      if (!draft) return false
      return (
        !!draft.exchange_rate.trim() ||
        !!draft.transfer_date.trim() ||
        draft.files.length > 0
      )
    })
    if (ready.length === 0) {
      alert(t('f3:payment_modal.upload_all_none'))
      return
    }

    const key = 'upload-all'
    const failures: string[] = []
    try {
      setBusy(key, true)
      for (const project of ready) {
        try {
          await createConfirmation(project.id, { silent: true })
        } catch (e) {
          const label =
            project.emergency_room_name ||
            project.grant_id ||
            project.err_id ||
            project.id
          failures.push(
            `${label}: ${e instanceof Error ? e.message : 'failed'}`
          )
        }
      }
      await refreshConfirmations(selectedMouForPayment.id)
      await fetchMous()
      if (failures.length > 0) {
        alert(
          t('f3:payment_modal.upload_all_partial', {
            ok: ready.length - failures.length,
            fail: failures.length,
            details: failures.join('\n'),
          })
        )
      }
    } finally {
      setBusy(key, false)
    }
  }

  const saveConfirmationMeta = async (
    projectId: string,
    confirmation: PaymentConfirmationRecord
  ) => {
    if (!selectedMouForPayment) return
    const key = `meta:${confirmation.id}`
    try {
      setBusy(key, true)
      const response = await fetch(
        `/api/f3/mous/${selectedMouForPayment.id}/payment-confirmation/${confirmation.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            exchange_rate: confirmation.exchange_rate,
            transfer_date: confirmation.transfer_date,
          }),
        }
      )
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || 'Failed to update payment')
      }
      await refreshConfirmations(selectedMouForPayment.id)
      await fetchMous()
    } catch (e) {
      console.error(e)
      alert(e instanceof Error ? e.message : 'Failed to update payment')
    } finally {
      setBusy(key, false)
    }
  }

  const addFilesToConfirmation = async (
    projectId: string,
    confirmationId: string,
    fileList: FileList | null
  ) => {
    if (!selectedMouForPayment || !fileList || fileList.length === 0) return
    const key = `addfile:${confirmationId}`
    try {
      setBusy(key, true)
      const formData = new FormData()
      Array.from(fileList).forEach((file) => formData.append('files', file))
      const response = await fetch(
        `/api/f3/mous/${selectedMouForPayment.id}/payment-confirmation/${confirmationId}/files`,
        { method: 'POST', body: formData }
      )
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || 'Failed to upload file')
      }
      await refreshConfirmations(selectedMouForPayment.id)
      await fetchMous()
    } catch (e) {
      console.error(e)
      alert(e instanceof Error ? e.message : 'Failed to upload file')
    } finally {
      setBusy(key, false)
    }
  }

  const deleteFile = async (confirmationId: string, file: PaymentFileRecord) => {
    if (!selectedMouForPayment) return
    if (!confirm(t('f3:payment_modal.confirm_delete_file'))) return
    const key = `delfile:${file.id}`
    try {
      setBusy(key, true)
      const response = await fetch(
        `/api/f3/mous/${selectedMouForPayment.id}/payment-confirmation/${confirmationId}/files/${file.id}`,
        { method: 'DELETE' }
      )
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || 'Failed to delete file')
      }
      await refreshConfirmations(selectedMouForPayment.id)
      await fetchMous()
    } catch (e) {
      console.error(e)
      alert(e instanceof Error ? e.message : 'Failed to delete file')
    } finally {
      setBusy(key, false)
    }
  }

  const deleteConfirmation = async (projectId: string, confirmationId: string) => {
    if (!selectedMouForPayment) return
    if (!confirm(t('f3:payment_modal.confirm_delete_payment'))) return
    const key = `delpay:${confirmationId}`
    try {
      setBusy(key, true)
      const response = await fetch(
        `/api/f3/mous/${selectedMouForPayment.id}/payment-confirmation/${confirmationId}`,
        { method: 'DELETE' }
      )
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || 'Failed to delete payment')
      }
      await refreshConfirmations(selectedMouForPayment.id)
      await fetchMous()
    } catch (e) {
      console.error(e)
      alert(e instanceof Error ? e.message : 'Failed to delete payment')
    } finally {
      setBusy(key, false)
    }
  }

  return (
    <Dialog
      open={paymentModalOpen}
      onOpenChange={(open) => {
        setPaymentModalOpen(open)
        if (!open) closePaymentModal()
      }}
    >
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('f3:payment_modal.title')} - {selectedMouForPayment?.mou_code}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {paymentProjects.length}{' '}
            {paymentProjects.length === 1
              ? t('f3:payment_modal.project_singular')
              : t('f3:payment_modal.project_plural')}
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
                disabled={anyBusy}
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
                disabled={anyBusy}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8"
              onClick={applyBulkPaymentToAllProjects}
              disabled={anyBusy || paymentProjects.length === 0}
            >
              {t('f3:payment_modal.apply_to_all')}
            </Button>
          </div>
        </div>

        {loadingConfirmations ? (
          <p className="text-sm text-muted-foreground mt-4">{t('f3:payment_modal.loading')}</p>
        ) : (
          <div className="mt-4 space-y-6">
            {paymentProjects.map((project) => {
              const confirmations = confirmationsByProject[project.id] || []
              const draft = newDrafts[project.id] || {
                exchange_rate: '',
                transfer_date: '',
                files: [],
              }
              const creating = !!busyKeys[`create:${project.id}`]

              return (
                <section
                  key={project.id}
                  className="rounded-md border border-border p-4 space-y-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold">
                        {project.emergency_room_name || '-'}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {t('f3:payment_modal.grant_serial')}: {project.grant_id || '-'}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {confirmations.length}{' '}
                      {confirmations.length === 1
                        ? t('f3:payment_modal.payment_singular')
                        : t('f3:payment_modal.payment_plural')}
                    </span>
                  </div>

                  {confirmations.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t('f3:payment_modal.no_payments')}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {confirmations.map((confirmation, index) => {
                        const metaBusy = !!busyKeys[`meta:${confirmation.id}`]
                        const addBusy = !!busyKeys[`addfile:${confirmation.id}`]
                        const delBusy = !!busyKeys[`delpay:${confirmation.id}`]
                        return (
                          <div
                            key={confirmation.id}
                            className="rounded-md border border-border/80 bg-background p-3 space-y-3"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium">
                                {t('f3:payment_modal.payment_n', { n: index + 1 })}
                              </p>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-destructive"
                                disabled={delBusy || anyBusy}
                                onClick={() =>
                                  deleteConfirmation(project.id, confirmation.id)
                                }
                              >
                                {delBusy
                                  ? '...'
                                  : t('f3:payment_modal.delete_payment')}
                              </Button>
                            </div>

                            <div className="flex flex-wrap items-end gap-3">
                              <div className="space-y-1">
                                <Label className="text-xs">
                                  {t('f3:payment_modal.bulk_exchange_rate')}
                                </Label>
                                <Input
                                  type="number"
                                  step="0.0001"
                                  className="h-8 w-[140px] text-sm"
                                  value={confirmation.exchange_rate ?? ''}
                                  disabled={metaBusy}
                                  onChange={(e) => {
                                    const v = e.target.value
                                    patchLocalConfirmation(project.id, confirmation.id, {
                                      exchange_rate: v === '' ? null : Number(v),
                                    })
                                  }}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">
                                  {t('f3:payment_modal.bulk_transfer_date')}
                                </Label>
                                <Input
                                  type="date"
                                  className="h-8 w-[150px] text-sm"
                                  value={confirmation.transfer_date || ''}
                                  disabled={metaBusy}
                                  onChange={(e) =>
                                    patchLocalConfirmation(project.id, confirmation.id, {
                                      transfer_date: e.target.value || null,
                                    })
                                  }
                                />
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="h-8"
                                disabled={metaBusy}
                                onClick={() =>
                                  saveConfirmationMeta(project.id, confirmation)
                                }
                              >
                                {metaBusy ? '...' : t('f3:payment_modal.save_meta')}
                              </Button>
                            </div>

                            <div className="space-y-1">
                              <p className="text-xs font-medium">
                                {t('f3:payment_modal.files')}
                              </p>
                              {(confirmation.files || []).length === 0 ? (
                                <p className="text-xs text-muted-foreground">
                                  {t('f3:payment_modal.no_files')}
                                </p>
                              ) : (
                                <ul className="space-y-1">
                                  {(confirmation.files || []).map((file) => {
                                    const fileBusy = !!busyKeys[`delfile:${file.id}`]
                                    return (
                                      <li
                                        key={file.id}
                                        className="flex flex-wrap items-center gap-2 text-xs"
                                      >
                                        <span className="truncate max-w-[240px]">
                                          {file.original_name || file.file_path}
                                        </span>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 text-xs px-2"
                                          onClick={async () => {
                                            try {
                                              await openSignedUrl(file.file_path)
                                            } catch (err) {
                                              console.error(err)
                                              alert(t('f3:payment_modal.open_failed'))
                                            }
                                          }}
                                        >
                                          {t('f3:payment_modal.view')}
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 text-xs px-2 text-destructive"
                                          disabled={fileBusy}
                                          onClick={() =>
                                            deleteFile(confirmation.id, file)
                                          }
                                        >
                                          {fileBusy
                                            ? '...'
                                            : t('f3:payment_modal.delete_file')}
                                        </Button>
                                      </li>
                                    )
                                  })}
                                </ul>
                              )}
                              <div className="pt-1">
                                <Label className="text-xs">
                                  {t('f3:payment_modal.add_file')}
                                </Label>
                                <Input
                                  type="file"
                                  accept=".pdf,.jpg,.jpeg,.png"
                                  multiple
                                  className="h-8 text-xs mt-1 max-w-md"
                                  disabled={addBusy}
                                  onChange={(e) => {
                                    const files = e.target.files
                                    void addFilesToConfirmation(
                                      project.id,
                                      confirmation.id,
                                      files
                                    )
                                    e.target.value = ''
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <div className="rounded-md border border-dashed border-border p-3 space-y-3">
                    <p className="text-sm font-medium">
                      {t('f3:payment_modal.add_payment')}
                    </p>
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">
                          {t('f3:payment_modal.bulk_exchange_rate')}
                        </Label>
                        <Input
                          type="number"
                          step="0.0001"
                          className="h-8 w-[140px] text-sm"
                          value={draft.exchange_rate}
                          disabled={creating}
                          onChange={(e) =>
                            updateDraft(project.id, { exchange_rate: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">
                          {t('f3:payment_modal.bulk_transfer_date')}
                        </Label>
                        <Input
                          type="date"
                          className="h-8 w-[150px] text-sm"
                          value={draft.transfer_date}
                          disabled={creating}
                          onChange={(e) =>
                            updateDraft(project.id, { transfer_date: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t('f3:payment_modal.files')}</Label>
                        <Input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          multiple
                          className="h-8 text-xs w-[220px]"
                          disabled={creating}
                          onChange={(e) =>
                            updateDraft(project.id, {
                              files: Array.from(e.target.files || []),
                            })
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        className="h-8"
                        disabled={creating || anyBusy}
                        onClick={async () => {
                          try {
                            const ok = await createConfirmation(project.id)
                            if (ok && selectedMouForPayment) {
                              await refreshConfirmations(selectedMouForPayment.id)
                              await fetchMous()
                            }
                          } catch {
                            // error already surfaced
                          }
                        }}
                      >
                        {creating ? '...' : t('f3:payment_modal.add_payment')}
                      </Button>
                    </div>
                    {draft.files.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {draft.files.map((f) => f.name).join(', ')}
                      </p>
                    )}
                  </div>
                </section>
              )
            })}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-4 border-t mt-4">
          <Button variant="outline" onClick={closePaymentModal} disabled={anyBusy}>
            {t('f3:payment_modal.close')}
          </Button>
          <Button
            type="button"
            onClick={() => void uploadAllPaymentConfirmations()}
            disabled={anyBusy || loadingConfirmations || paymentProjects.length === 0}
          >
            {busyKeys['upload-all']
              ? '...'
              : t('f3:payment_modal.upload_all')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
