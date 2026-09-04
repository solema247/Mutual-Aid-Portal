'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabaseClient'
import type {
  MOU,
  NewPaymentDraft,
  PaymentConfirmationRecord,
  PaymentProjectRow,
} from '../types'

interface UsePaymentModalOptions {
  fetchMous: () => Promise<void>
}

const emptyDraft = (): NewPaymentDraft => ({
  exchange_rate: '',
  transfer_date: '',
  fsp_id: '',
  files: [],
})

export function usePaymentModal({ fetchMous }: UsePaymentModalOptions) {
  const { t } = useTranslation(['f3'])
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [selectedMouForPayment, setSelectedMouForPayment] = useState<MOU | null>(null)
  const [paymentProjects, setPaymentProjects] = useState<PaymentProjectRow[]>([])
  const [confirmationsByProject, setConfirmationsByProject] = useState<
    Record<string, PaymentConfirmationRecord[]>
  >({})
  const [newDrafts, setNewDrafts] = useState<Record<string, NewPaymentDraft>>({})
  const [loadingConfirmations, setLoadingConfirmations] = useState(false)
  const [busyKeys, setBusyKeys] = useState<Record<string, boolean>>({})
  const [bulkPaymentExchangeRate, setBulkPaymentExchangeRate] = useState('')
  const [bulkPaymentTransferDate, setBulkPaymentTransferDate] = useState('')
  const [bulkPaymentFspId, setBulkPaymentFspId] = useState('')
  const [paymentFsps, setPaymentFsps] = useState<Array<{ id: string; name: string }>>([])

  const setBusy = (key: string, value: boolean) => {
    setBusyKeys((prev) => {
      const next = { ...prev }
      if (value) next[key] = true
      else delete next[key]
      return next
    })
  }

  const refreshConfirmations = async (mouId: string) => {
    const response = await fetch(`/api/f3/mous/${mouId}/payment-confirmation`)
    if (!response.ok) {
      throw new Error('Failed to load payment confirmations')
    }
    const data = await response.json()
    const byProject: Record<string, PaymentConfirmationRecord[]> =
      data.by_project || {}
    setConfirmationsByProject(byProject)
    return byProject
  }

  const openPaymentModal = async (mou: MOU) => {
    setSelectedMouForPayment(mou)
    setBulkPaymentExchangeRate('')
    setBulkPaymentTransferDate('')
    setBulkPaymentFspId('')
    setNewDrafts({})
    setConfirmationsByProject({})
    setLoadingConfirmations(true)
    setPaymentModalOpen(true)

    try {
      try {
        const fspRes = await fetch('/api/fsps', { cache: 'no-store' })
        if (fspRes.ok) {
          const fspData = await fspRes.json()
          setPaymentFsps(
            Array.isArray(fspData)
              ? fspData
                  .map((f: { id?: string; name?: string }) => ({
                    id: String(f.id || ''),
                    name: String(f.name || ''),
                  }))
                  .filter((f: { id: string; name: string }) => f.id && f.name)
              : []
          )
        }
      } catch (fspError) {
        console.error('Error loading FSPs for payment modal:', fspError)
        setPaymentFsps([])
      }

      const { data: projects, error } = await supabase
        .from('err_projects')
        .select('id, err_id, state, locality, grant_id, emergency_rooms (name, name_ar, err_code)')
        .eq('mou_id', mou.id)
        .order('submitted_at', { ascending: true })

      if (error) {
        console.error('Error fetching MOU projects:', error)
        setPaymentProjects([])
      } else {
        const projectList = (projects || []).map((p: Record<string, unknown>) => {
          const room = p.emergency_rooms as {
            name?: string
            name_ar?: string
            err_code?: string
          } | null
          const roomName = room?.name || room?.name_ar || room?.err_code || null
          return {
            id: p.id as string,
            err_id: (p.err_id as string | null) ?? room?.err_code ?? null,
            state: p.state as string,
            locality: p.locality as string | null,
            emergency_room_name: roomName,
            grant_id: (p.grant_id as string | null) || null,
          }
        })
        setPaymentProjects(projectList)
        const drafts: Record<string, NewPaymentDraft> = {}
        for (const p of projectList) drafts[p.id] = emptyDraft()
        setNewDrafts(drafts)
      }

      // Confirmations may fail if the migration isn't applied yet — keep projects so
      // the Add Payment UI still renders.
      try {
        await refreshConfirmations(mou.id)
      } catch (confirmError) {
        console.error('Error loading payment confirmations:', confirmError)
        setConfirmationsByProject({})
      }
    } catch (error) {
      console.error('Error opening payment modal:', error)
      setPaymentProjects([])
      setConfirmationsByProject({})
    } finally {
      setLoadingConfirmations(false)
    }
  }

  const applyBulkPaymentToAllProjects = () => {
    const rate = bulkPaymentExchangeRate.trim()
    const date = bulkPaymentTransferDate.trim()
    if (!rate || !date) {
      alert(t('f3:payment_modal.bulk_required'))
      return
    }
    if (Number.isNaN(Number(rate)) || Number(rate) <= 0) {
      alert(t('f3:payment_modal.bulk_rate_invalid'))
      return
    }
    setNewDrafts((prev) => {
      const next = { ...prev }
      for (const project of paymentProjects) {
        const current = next[project.id] ?? emptyDraft()
        next[project.id] = {
          ...current,
          exchange_rate: rate,
          transfer_date: date,
          fsp_id: bulkPaymentFspId || current.fsp_id,
        }
      }
      return next
    })
  }

  const closePaymentModal = () => {
    setPaymentModalOpen(false)
    setSelectedMouForPayment(null)
    setPaymentProjects([])
    setConfirmationsByProject({})
    setNewDrafts({})
    setBusyKeys({})
    setBulkPaymentExchangeRate('')
    setBulkPaymentTransferDate('')
    setBulkPaymentFspId('')
    setLoadingConfirmations(false)
  }

  return {
    paymentModalOpen,
    setPaymentModalOpen,
    selectedMouForPayment,
    setSelectedMouForPayment,
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
    bulkPaymentFspId,
    setBulkPaymentFspId,
    paymentFsps,
    openPaymentModal,
    applyBulkPaymentToAllProjects,
    closePaymentModal,
    refreshConfirmations,
    fetchMous,
  }
}
