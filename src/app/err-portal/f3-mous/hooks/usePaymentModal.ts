'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabaseClient'
import { parsePaymentConfirmations } from '../lib/payment-confirmations'
import type { MOU, PaymentConfirmationEntry, PaymentProjectRow } from '../types'

interface UsePaymentModalOptions {
  fetchMous: () => Promise<void>
}

export function usePaymentModal({ fetchMous }: UsePaymentModalOptions) {
  const { t } = useTranslation(['f3'])
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [selectedMouForPayment, setSelectedMouForPayment] = useState<MOU | null>(null)
  const [paymentProjects, setPaymentProjects] = useState<PaymentProjectRow[]>([])
  const [paymentConfirmations, setPaymentConfirmations] = useState<
    Record<string, PaymentConfirmationEntry>
  >({})
  const [uploadingPayments, setUploadingPayments] = useState<Record<string, boolean>>({})
  const [uploadingAllPayments, setUploadingAllPayments] = useState(false)
  const [bulkPaymentExchangeRate, setBulkPaymentExchangeRate] = useState('')
  const [bulkPaymentTransferDate, setBulkPaymentTransferDate] = useState('')

  const openPaymentModal = async (mou: MOU) => {
    setSelectedMouForPayment(mou)
    setBulkPaymentExchangeRate('')
    setBulkPaymentTransferDate('')

    try {
      const { data: projects, error } = await supabase
        .from('err_projects')
        .select('id, err_id, state, locality, grant_id, emergency_rooms (name, name_ar, err_code)')
        .eq('mou_id', mou.id)
        .order('submitted_at', { ascending: true })

      if (error) {
        console.error('Error fetching MOU projects:', error)
        setPaymentProjects([])
        setPaymentConfirmations({})
      } else {
        let projectList = (projects || []).map((p: Record<string, unknown>) => {
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

        const existing = parsePaymentConfirmations(mou.payment_confirmation_file)
        if (projectList.length === 0 && Object.keys(existing).length > 0) {
          const projectIds = Object.keys(existing)
          const { data: fallbackProjects } = await supabase
            .from('err_projects')
            .select('id, err_id, state, locality, grant_id, emergency_rooms (name, name_ar, err_code)')
            .in('id', projectIds)
          const byId = new Map(
            (fallbackProjects || []).map((p: Record<string, unknown>) => {
              const room = p.emergency_rooms as {
                name?: string
                name_ar?: string
                err_code?: string
              } | null
              const roomName = room?.name || room?.name_ar || room?.err_code || null
              return [
                p.id,
                {
                  id: p.id as string,
                  err_id: (p.err_id as string | null) ?? room?.err_code ?? null,
                  state: p.state as string,
                  locality: p.locality as string | null,
                  emergency_room_name: roomName,
                  grant_id: (p.grant_id as string | null) || null,
                },
              ]
            })
          )
          projectList = projectIds
            .map((id) => byId.get(id))
            .filter(Boolean) as PaymentProjectRow[]
        }

        setPaymentProjects(projectList)
        const confirmations: Record<string, PaymentConfirmationEntry> = {}

        projectList.forEach((project) => {
          const existingData = existing[project.id]
          confirmations[project.id] = {
            exchange_rate: existingData?.exchange_rate?.toString() || '',
            transfer_date: existingData?.transfer_date || '',
            file: null,
            file_path: existingData?.file_path,
          }
        })

        if (
          mou.payment_confirmation_file &&
          !mou.payment_confirmation_file.startsWith('{') &&
          projectList.length > 0
        ) {
          confirmations[projectList[0].id] = {
            exchange_rate: mou.exchange_rate?.toString() || '',
            transfer_date: mou.transfer_date || '',
            file: null,
            file_path: mou.payment_confirmation_file,
          }
        }

        setPaymentConfirmations(confirmations)
      }
    } catch (error) {
      console.error('Error opening payment modal:', error)
      setPaymentProjects([])
      setPaymentConfirmations({})
    }

    setPaymentModalOpen(true)
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
    setPaymentConfirmations((prev) => {
      const next = { ...prev }
      for (const project of paymentProjects) {
        const current = next[project.id] ?? {
          exchange_rate: '',
          transfer_date: '',
          file: null,
          file_path: undefined,
        }
        next[project.id] = {
          ...current,
          exchange_rate: rate,
          transfer_date: date,
        }
      }
      return next
    })
  }

  const closePaymentModal = () => {
    setPaymentModalOpen(false)
    setSelectedMouForPayment(null)
    setPaymentProjects([])
    setPaymentConfirmations({})
    setUploadingPayments({})
    setBulkPaymentExchangeRate('')
    setBulkPaymentTransferDate('')
  }

  return {
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
    openPaymentModal,
    applyBulkPaymentToAllProjects,
    closePaymentModal,
    fetchMous,
  }
}
