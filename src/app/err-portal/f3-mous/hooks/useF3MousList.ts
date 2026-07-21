'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  applyFilters,
  getF3MousFilterFields,
  type ActiveFilter,
} from '@/components/smart-filter'
import { parseMousListResponse } from '@/lib/mou-list-enrichment'
import { getPaymentConfirmationCount } from '../lib/payment-confirmations'
import type { MOU, MouAssignmentStatus } from '../types'

export const ITEMS_PER_PAGE = 10

function applyEnrichment(
  setters: {
    setMouGrantIds: (v: Record<string, string>) => void
    setMouProjectCounts: (v: Record<string, number>) => void
    setMouPaymentProjectCounts: (v: Record<string, number>) => void
    setMouAssignmentStatus: (v: Record<string, MouAssignmentStatus>) => void
  },
  enrichment: ReturnType<typeof parseMousListResponse>
) {
  setters.setMouGrantIds(enrichment.grantIds)
  setters.setMouProjectCounts(enrichment.projectCounts)
  setters.setMouPaymentProjectCounts(enrichment.paymentProjectCounts)
  setters.setMouAssignmentStatus(enrichment.assignmentStatus)
}

export function useF3MousList() {
  const { t } = useTranslation(['f3', 'common'])
  const [mous, setMous] = useState<MOU[]>([])
  const [mouGrantIds, setMouGrantIds] = useState<Record<string, string>>({})
  const [mouProjectCounts, setMouProjectCounts] = useState<Record<string, number>>({})
  const [mouPaymentProjectCounts, setMouPaymentProjectCounts] = useState<Record<string, number>>({})
  const [mousFilters, setMousFilters] = useState<ActiveFilter[]>([])
  const [loading, setLoading] = useState(true)
  const [mouAssignmentStatus, setMouAssignmentStatus] = useState<
    Record<string, MouAssignmentStatus>
  >({})
  const [currentPage, setCurrentPage] = useState(1)
  const [sortCreatedOrder, setSortCreatedOrder] = useState<'asc' | 'desc'>('desc')

  const enrichmentSetters = {
    setMouGrantIds,
    setMouProjectCounts,
    setMouPaymentProjectCounts,
    setMouAssignmentStatus,
  }

  const fetchMous = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/f3/mous')
      const data = await res.json()
      const parsed = parseMousListResponse(data)

      setMous(parsed.mous as MOU[])
      applyEnrichment(enrichmentSetters, parsed)
      setCurrentPage(1)
    } catch (e) {
      console.error('Failed to load MOUs', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMous()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const mouStateOptions = useMemo(
    () => Array.from(new Set(mous.map((m) => m.state).filter(Boolean) as string[])).sort(),
    [mous]
  )
  const mouGrantIdOptions = useMemo(
    () => Array.from(new Set(Object.values(mouGrantIds).filter(Boolean))).sort(),
    [mouGrantIds]
  )

  const mouFilterFields = useMemo(
    () =>
      getF3MousFilterFields({
        stateOptions: mouStateOptions,
        grantIdOptions: mouGrantIdOptions,
        labels: {
          state: t('f3:filters.state'),
          grantId: t('f3:filters.grant_id'),
          unassignedGrant: t('f3:filters.unassigned_grant'),
          all: t('f3:filters.all'),
        },
      }),
    [mouStateOptions, mouGrantIdOptions, t]
  )

  const getMouFieldValue = useCallback(
    (row: MOU, fieldId: string): string | null | undefined => {
      if (fieldId === 'state') return row.state ?? ''
      if (fieldId === 'grant_id') {
        const grantId = mouGrantIds[row.id]
        return grantId && String(grantId).trim() ? String(grantId).trim() : '__unassigned__'
      }
      return null
    },
    [mouGrantIds]
  )

  const filteredMous = useMemo(() => {
    return applyFilters({
      data: mous,
      filters: mousFilters,
      fields: mouFilterFields,
      getFieldValue: getMouFieldValue,
    })
  }, [mous, mousFilters, mouFilterFields, getMouFieldValue])

  useEffect(() => {
    setCurrentPage(1)
  }, [mousFilters])

  const sortedMous = useMemo(() => {
    const list = [...filteredMous]
    list.sort((a, b) => {
      const da = new Date(a.created_at).getTime()
      const db = new Date(b.created_at).getTime()
      return sortCreatedOrder === 'desc' ? db - da : da - db
    })
    return list
  }, [filteredMous, sortCreatedOrder])

  const moUsNeedingPayment = useMemo(() => {
    return mous
      .filter((m) => {
        const grantId = mouGrantIds[m.id]
        if (!grantId) return false
        const total = mouPaymentProjectCounts[m.id] ?? mouProjectCounts[m.id] ?? 0
        const { confirmed } = getPaymentConfirmationCount(m, total)
        return confirmed < total
      })
      .map((m) => {
        const total = mouPaymentProjectCounts[m.id] ?? mouProjectCounts[m.id] ?? 0
        const pc = getPaymentConfirmationCount(m, total)
        return {
          mou: m,
          confirmed: pc.confirmed,
          total: pc.total,
          missing: pc.total - pc.confirmed,
        }
      })
  }, [mous, mouGrantIds, mouPaymentProjectCounts, mouProjectCounts])

  const paginatedMous = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    const endIndex = startIndex + ITEMS_PER_PAGE
    return sortedMous.slice(startIndex, endIndex)
  }, [sortedMous, currentPage])

  return {
    mous,
    loading,
    mousFilters,
    setMousFilters,
    mouGrantIds,
    mouProjectCounts,
    mouPaymentProjectCounts,
    mouAssignmentStatus,
    currentPage,
    setCurrentPage,
    sortCreatedOrder,
    setSortCreatedOrder,
    mouFilterFields,
    filteredMous,
    sortedMous,
    paginatedMous,
    moUsNeedingPayment,
    fetchMous,
    itemsPerPage: ITEMS_PER_PAGE,
  }
}
