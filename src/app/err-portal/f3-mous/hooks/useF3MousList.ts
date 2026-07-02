'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabaseClient'
import {
  applyFilters,
  getF3MousFilterFields,
  type ActiveFilter,
} from '@/components/smart-filter'
import { getPaymentConfirmationCount } from '../lib/payment-confirmations'
import type { MOU, MouAssignmentStatus } from '../types'

export const ITEMS_PER_PAGE = 10

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
  const [currentUser, setCurrentUser] = useState<{ role: string } | null>(null)

  const checkMouAssignmentStatus = async (mouIds: string[]) => {
    try {
      const statusMap: Record<string, MouAssignmentStatus> = {}

      for (const mouId of mouIds) {
        const { data: projects, error } = await supabase
          .from('err_projects')
          .select('id, grant_id')
          .eq('mou_id', mouId)

        if (error) {
          console.error(`Error checking MOU ${mouId}:`, error)
          continue
        }

        const projectCount = projects?.length || 0
        const hasUnassigned =
          (projectCount > 0 &&
            projects?.some((p: { grant_id: string | null }) => !p.grant_id || !p.grant_id.startsWith('LCC-'))) ||
          false
        const hasAssigned =
          (projectCount > 0 &&
            projects?.some((p: { grant_id: string | null }) => p.grant_id && p.grant_id.startsWith('LCC-'))) ||
          false

        statusMap[mouId] = { hasUnassigned, hasAssigned, projectCount }
      }

      setMouAssignmentStatus(statusMap)
    } catch (error) {
      console.error('Error checking MOU assignment status:', error)
    }
  }

  const fetchMous = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/f3/mous')
      const data = await res.json()
      setMous(data)
      setCurrentPage(1)

      await checkMouAssignmentStatus(data.map((m: MOU) => m.id))

      try {
        const mouIds = data.map((m: MOU) => m.id)
        if (mouIds.length > 0) {
          const { data: projectCounts } = await supabase
            .from('err_projects')
            .select('mou_id')
            .in('mou_id', mouIds)
            .eq('funding_status', 'committed')
            .in('status', ['approved', 'completed'])

          const counts: Record<string, number> = {}
          if (projectCounts) {
            projectCounts.forEach((p: { mou_id: string | null }) => {
              if (p.mou_id) {
                counts[p.mou_id] = (counts[p.mou_id] || 0) + 1
              }
            })
          }
          setMouProjectCounts(counts)

          const { data: allProjectCounts } = await supabase
            .from('err_projects')
            .select('mou_id')
            .in('mou_id', mouIds)
          const paymentCounts: Record<string, number> = {}
          if (allProjectCounts) {
            allProjectCounts.forEach((p: { mou_id: string | null }) => {
              if (p.mou_id) {
                paymentCounts[p.mou_id] = (paymentCounts[p.mou_id] || 0) + 1
              }
            })
          }
          setMouPaymentProjectCounts(paymentCounts)
        }
      } catch (error) {
        console.error('Error fetching project counts:', error)
      }

      try {
        const mouIds = data.map((m: MOU) => m.id)
        if (mouIds.length > 0) {
          const { data: projects } = await supabase
            .from('err_projects')
            .select('mou_id, grant_grid_id')
            .in('mou_id', mouIds)
            .not('grant_grid_id', 'is', null)

          if (projects && projects.length > 0) {
            const uniqueGrantGridIds = Array.from(
              new Set(projects.map((p: { grant_grid_id: string }) => p.grant_grid_id).filter(Boolean))
            )

            const { data: grants } = await supabase
              .from('grants_grid_view')
              .select('id, grant_id')
              .in('id', uniqueGrantGridIds)

            const grantIdByGridId: Record<string, string> = {}
            if (grants) {
              grants.forEach((g: { id: string; grant_id: string }) => {
                if (g.id && g.grant_id) {
                  grantIdByGridId[g.id] = g.grant_id
                }
              })
            }

            const grantIdMap: Record<string, string> = {}
            const mouToGrantGridId: Record<string, string> = {}
            projects.forEach((p: { mou_id: string; grant_grid_id: string }) => {
              if (p.mou_id && p.grant_grid_id && !mouToGrantGridId[p.mou_id]) {
                mouToGrantGridId[p.mou_id] = p.grant_grid_id
              }
            })

            Object.entries(mouToGrantGridId).forEach(([mouId, gridId]) => {
              if (grantIdByGridId[gridId]) {
                grantIdMap[mouId] = grantIdByGridId[gridId]
              }
            })

            setMouGrantIds(grantIdMap)
          } else {
            setMouGrantIds({})
          }
        }
      } catch (error) {
        console.error('Error fetching grant_ids for MOUs:', error)
        setMouGrantIds({})
      }
    } catch (e) {
      console.error('Failed to load MOUs', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMous()
    ;(async () => {
      try {
        const res = await fetch('/api/users/me')
        if (res.ok) {
          const userData = await res.json()
          setCurrentUser(userData)
        }
      } catch (error) {
        console.error('Error fetching user:', error)
      }
    })()
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
    currentUser,
    mouFilterFields,
    filteredMous,
    sortedMous,
    paginatedMous,
    moUsNeedingPayment,
    fetchMous,
    checkMouAssignmentStatus,
    itemsPerPage: ITEMS_PER_PAGE,
  }
}
