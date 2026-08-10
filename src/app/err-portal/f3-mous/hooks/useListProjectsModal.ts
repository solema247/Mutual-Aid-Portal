'use client'

import { useState } from 'react'
import { getCategoriesFromPlannedActivities, sumExpensesUsd } from '../lib/project-helpers'
import type { MOU, MouProjectRow, MouProjectRowWithoutGrant } from '../types'

interface UseListProjectsModalOptions {
  fetchMous: () => Promise<void>
}

export function useListProjectsModal({
  fetchMous,
}: UseListProjectsModalOptions) {
  const [listProjectsModalOpen, setListProjectsModalOpen] = useState(false)
  const [listProjectsMouId, setListProjectsMouId] = useState<string | null>(null)
  const [listProjectsMouCode, setListProjectsMouCode] = useState<string>('')
  const [listProjectsList, setListProjectsList] = useState<MouProjectRow[]>([])
  const [listProjectsLoading, setListProjectsLoading] = useState(false)
  const [listProjectsMouAssigned, setListProjectsMouAssigned] = useState(false)
  const [listProjectsAddMode, setListProjectsAddMode] = useState(false)
  const [candidatesForAdd, setCandidatesForAdd] = useState<MouProjectRowWithoutGrant[]>([])
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set())
  const [listProjectsActionLoading, setListProjectsActionLoading] = useState(false)
  const [updatingGrantSegmentId, setUpdatingGrantSegmentId] = useState<string | null>(null)

  const mapMouProjects = (
    projects: Array<{
      id: string
      err_id?: string | null
      state?: string
      locality?: string | null
      grant_id?: string | null
      grant_segment?: string | null
      expenses?: unknown
      planned_activities?: unknown
      project_objectives?: string | null
      emergency_rooms?: { err_code?: string } | null
    }>
  ): MouProjectRow[] =>
    projects.map((p) => ({
      id: p.id,
      err_id: p.err_id ?? p.emergency_rooms?.err_code ?? null,
      state: p.state ?? '',
      locality: p.locality ?? null,
      grant_id: p.grant_id ?? null,
      grant_segment: p.grant_segment ?? null,
      amount_usd: sumExpensesUsd(p.expenses),
      categories: getCategoriesFromPlannedActivities(p.planned_activities),
      project_objectives: p.project_objectives ?? null,
    }))

  const openListProjectsModal = async (mou: MOU) => {
    setListProjectsMouId(mou.id)
    setListProjectsMouCode(mou.mou_code)
    setListProjectsModalOpen(true)
    setListProjectsList([])
    setListProjectsMouAssigned(false)
    setListProjectsAddMode(false)
    setSelectedCandidates(new Set())
    setListProjectsLoading(true)
    try {
      const res = await fetch(`/api/f3/mous/${mou.id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load MOU')
      const list = mapMouProjects(data.projects || [])
      setListProjectsList(list)
      const isAssigned = list.some(
        (p: MouProjectRow) => p.grant_id && String(p.grant_id).startsWith('LCC-')
      )
      setListProjectsMouAssigned(isAssigned)
    } catch (e) {
      console.error('Error loading MOU projects:', e)
      setListProjectsList([])
    } finally {
      setListProjectsLoading(false)
    }
  }

  const handleListProjectsModalOpenChange = (open: boolean) => {
    setListProjectsModalOpen(open)
    if (!open) {
      setListProjectsAddMode(false)
      setSelectedCandidates(new Set())
    }
  }

  const removeProject = async (projectId: string) => {
    if (!listProjectsMouId) return
    setListProjectsActionLoading(true)
    try {
      const res = await fetch(`/api/f3/mous/${listProjectsMouId}/projects/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_ids: [projectId] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to remove')
      setListProjectsList((prev) => prev.filter((x) => x.id !== projectId))
      const regen = await fetch(`/api/f3/mous/${listProjectsMouId}/regenerate`, { method: 'POST' })
      if (regen.ok) {
        /* doc updated */
      }
      await fetchMous()
    } catch (e) {
      console.error(e)
      alert(e instanceof Error ? e.message : 'Failed to remove project')
    } finally {
      setListProjectsActionLoading(false)
    }
  }

  const startAddMode = async () => {
    setListProjectsAddMode(true)
    setSelectedCandidates(new Set())
    try {
      const res = await fetch('/api/f2/committed')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      const f1s = Array.isArray(data) ? data : data?.f1s || []
      const withoutMou = f1s.filter((f: { mou_id?: string | null }) => !f.mou_id)
      setCandidatesForAdd(
        withoutMou.map(
          (f: {
            id: string
            err_id?: string | null
            state?: string
            locality?: string | null
            expenses?: unknown
            planned_activities?: unknown
            project_objectives?: string | null
          }) => ({
            id: f.id,
            err_id: f.err_id ?? null,
            state: f.state ?? '',
            locality: f.locality ?? null,
            amount_usd: sumExpensesUsd(f.expenses),
            categories: getCategoriesFromPlannedActivities(f.planned_activities),
            project_objectives: f.project_objectives ?? null,
          })
        )
      )
    } catch (e) {
      console.error(e)
      setCandidatesForAdd([])
    }
  }

  const addSelectedProjects = async () => {
    if (!listProjectsMouId || selectedCandidates.size === 0) return
    setListProjectsActionLoading(true)
    try {
      const res = await fetch(`/api/f3/mous/${listProjectsMouId}/projects/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_ids: Array.from(selectedCandidates) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add')
      setListProjectsAddMode(false)
      setSelectedCandidates(new Set())
      const regen = await fetch(`/api/f3/mous/${listProjectsMouId}/regenerate`, { method: 'POST' })
      if (regen.ok) {
        /* doc updated */
      }
      await fetchMous()
      const refetchRes = await fetch(`/api/f3/mous/${listProjectsMouId}`)
      const refetchData = await refetchRes.json()
      setListProjectsList(mapMouProjects(refetchData.projects || []))
    } catch (e) {
      console.error(e)
      alert(e instanceof Error ? e.message : 'Failed to add projects')
    } finally {
      setListProjectsActionLoading(false)
    }
  }

  const updateProjectGrantSegment = async (projectId: string, grantSegment: string | undefined) => {
    const next = grantSegment ?? null
    const prev = listProjectsList.find((p) => p.id === projectId)?.grant_segment ?? null
    if (next === prev) return

    setUpdatingGrantSegmentId(projectId)
    setListProjectsList((rows) =>
      rows.map((p) => (p.id === projectId ? { ...p, grant_segment: next } : p))
    )
    try {
      const res = await fetch(`/api/projects/${projectId}/grant-segment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant_segment: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to update grant segment')
    } catch (e) {
      console.error(e)
      setListProjectsList((rows) =>
        rows.map((p) => (p.id === projectId ? { ...p, grant_segment: prev } : p))
      )
      alert(e instanceof Error ? e.message : 'Failed to update grant segment')
    } finally {
      setUpdatingGrantSegmentId(null)
    }
  }

  return {
    listProjectsModalOpen,
    listProjectsMouId,
    listProjectsMouCode,
    listProjectsList,
    listProjectsLoading,
    listProjectsMouAssigned,
    listProjectsAddMode,
    setListProjectsAddMode,
    candidatesForAdd,
    selectedCandidates,
    setSelectedCandidates,
    listProjectsActionLoading,
    updatingGrantSegmentId,
    openListProjectsModal,
    handleListProjectsModalOpenChange,
    removeProject,
    startAddMode,
    addSelectedProjects,
    updateProjectGrantSegment,
  }
}
