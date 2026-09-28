'use client'

import { Suspense, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import PoolByDonor from '@/app/err-portal/f2-approvals/components/PoolByDonor'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'
import { useF3MousPageExplainer } from './F3MousPageExplainer'
import MoUsNeedingPaymentAlert from './components/MoUsNeedingPaymentAlert'
import MousTable from './components/MousTable'
import MouPreviewDialog from './components/MouPreviewDialog'
import ListProjectsDialog from './components/ListProjectsDialog'
import AssignGrantDialog from './components/AssignGrantDialog'
import ReassignGrantDialog from './components/ReassignGrantDialog'
import PaymentConfirmationDialog from './components/PaymentConfirmationDialog'
import { useF3MousList } from './hooks/useF3MousList'
import { useMouPreview } from './hooks/useMouPreview'
import { useGrantAssignment } from './hooks/useGrantAssignment'
import { useListProjectsModal } from './hooks/useListProjectsModal'
import { usePaymentModal } from './hooks/usePaymentModal'
import type { MOU } from './types'

function F3MOUsPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const deepLinkHandled = useRef<string | null>(null)
  const { can, isLoading: permissionsLoading } = useAllowedFunctions()
  const canViewPage = can('f3_view_page')
  const canEditMou = can('f3_edit_mou')
  const canAssign = can('f3_assign')
  const canReassignGrant = can('f3_reassign_grant')
  const canViewMou = can('f3_view_mou')
  const canManageProjects = can('f3_manage_projects')
  const canManagePayment = can('f3_manage_payment')
  const canUploadSignedMou = can('f3_upload_signed_mou')

  const list = useF3MousList()
  const preview = useMouPreview({ fetchMous: list.fetchMous })
  const assignment = useGrantAssignment({
    fetchMous: list.fetchMous,
    mous: list.mous,
    mouAssignmentStatus: list.mouAssignmentStatus,
  })
  const listProjects = useListProjectsModal({
    fetchMous: list.fetchMous,
  })
  const payment = usePaymentModal({ fetchMous: list.fetchMous })

  useEffect(() => {
    if (!canViewPage) {
      router.replace('/err-portal')
    }
  }, [canViewPage, router])

  // Deep-link from F2 "View MOU": /err-portal/f3-mous?mou=<id>
  useEffect(() => {
    const mouId = searchParams.get('mou')
    if (!mouId || list.loading || !canViewMou) return
    if (deepLinkHandled.current === mouId) return

    const fromList = list.mous.find((m) => m.id === mouId)
    deepLinkHandled.current = mouId
    void preview.openPreview(fromList ?? ({ id: mouId } as MOU))
    router.replace('/err-portal/f3-mous', { scroll: false })
    // openPreview is stable enough for one-shot deep link; avoid depending on whole preview object
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, list.loading, list.mous, canViewMou, router])

  useF3MousPageExplainer(!permissionsLoading && canViewPage && !list.loading)

  if (!canViewPage) return null

  return (
    <div className="max-w-[1600px] w-full mx-auto p-6 space-y-6">
      {canManagePayment && (
        <MoUsNeedingPaymentAlert
          items={list.moUsNeedingPayment}
          grantIdByMouId={list.mouGrantIds}
          onOpenPayment={payment.openPaymentModal}
        />
      )}

      <MousTable
        loading={list.loading}
        mouFilterFields={list.mouFilterFields}
        mousFilters={list.mousFilters}
        setMousFilters={list.setMousFilters}
        filteredMous={list.filteredMous}
        sortedMous={list.sortedMous}
        paginatedMous={list.paginatedMous}
        itemsPerPage={list.itemsPerPage}
        currentPage={list.currentPage}
        setCurrentPage={list.setCurrentPage}
        sortCreatedOrder={list.sortCreatedOrder}
        setSortCreatedOrder={list.setSortCreatedOrder}
        mouGrantIds={list.mouGrantIds}
        mouProjectCounts={list.mouProjectCounts}
        mouPaymentProjectCounts={list.mouPaymentProjectCounts}
        mouPaymentConfirmedCounts={list.mouPaymentConfirmedCounts}
        mouAssignmentStatus={list.mouAssignmentStatus}
        canManageProjects={canManageProjects}
        canAssign={canAssign}
        canReassignGrant={canReassignGrant}
        canViewMou={canViewMou}
        canManagePayment={canManagePayment}
        canUploadSignedMou={canUploadSignedMou}
        openListProjectsModal={listProjects.openListProjectsModal}
        openAssignModal={assignment.openAssignModal}
        openReassignModal={assignment.openReassignModal}
        openPreview={preview.openPreview}
        openPaymentModal={payment.openPaymentModal}
        fetchMous={list.fetchMous}
      />

      <PoolByDonor />

      <MouPreviewDialog {...preview} canEditMou={canEditMou} />

      <ListProjectsDialog {...listProjects} />

      <AssignGrantDialog {...assignment} />

      <ReassignGrantDialog {...assignment} />

      <PaymentConfirmationDialog {...payment} />
    </div>
  )
}

export default function F3MOUsPage() {
  return (
    <Suspense fallback={<div className="w-full p-6">Loading...</div>}>
      <F3MOUsPageContent />
    </Suspense>
  )
}
