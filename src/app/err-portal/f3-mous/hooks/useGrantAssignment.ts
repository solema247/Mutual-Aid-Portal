'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { fmtUsd } from '../lib/project-helpers'
import type {
  GrantGridEntry,
  MOU,
  MouAssignmentStatus,
  MouProjectAssignmentRow,
  RemainingAmounts,
} from '../types'

interface UseGrantAssignmentOptions {
  fetchMous: () => Promise<void>
  mous: MOU[]
  mouAssignmentStatus: Record<string, MouAssignmentStatus>
}

export function useGrantAssignment({
  fetchMous,
  mous,
  mouAssignmentStatus,
}: UseGrantAssignmentOptions) {
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [assigningMouId, setAssigningMouId] = useState<string | null>(null)
  const [reassignModalOpen, setReassignModalOpen] = useState(false)
  const [reassigningMouId, setReassigningMouId] = useState<string | null>(null)
  const [isAssigning, setIsAssigning] = useState(false)
  const [isReassigning, setIsReassigning] = useState(false)
  const [tempGrantId, setTempGrantId] = useState<string>('')
  const [tempDonorName, setTempDonorName] = useState<string>('')
  const [tempMMYY, setTempMMYY] = useState<string>('')
  const [grantsFromGridView, setGrantsFromGridView] = useState<GrantGridEntry[]>([])
  const [mouProjects, setMouProjects] = useState<MouProjectAssignmentRow[]>([])
  const [stateShorts, setStateShorts] = useState<Record<string, string>>({})
  const [donorShortNames, setDonorShortNames] = useState<Record<string, string>>({})
  const [selectedGrantMaxSequence, setSelectedGrantMaxSequence] = useState<number>(0)
  const [grantRemaining, setGrantRemaining] = useState<RemainingAmounts | null>(null)
  const [stateAllocationRemaining, setStateAllocationRemaining] =
    useState<RemainingAmounts | null>(null)
  const [mouTotalAmount, setMouTotalAmount] = useState<number>(0)

  const fetchGrantsFromGridView = async () => {
    try {
      const { data, error } = await supabase
        .from('grants_grid_view')
        .select('grant_id, donor_name, project_name, donor_id')
        .order('grant_id', { ascending: true })

      if (error) throw error

      const uniqueGrants = new Map<string, GrantGridEntry>()
      const donorIds = new Set<string>()
      ;(data || []).forEach((grant: GrantGridEntry) => {
        const key = `${grant.grant_id}|${grant.donor_name}`
        if (!uniqueGrants.has(key)) {
          uniqueGrants.set(key, {
            grant_id: grant.grant_id,
            donor_name: grant.donor_name,
            project_name: grant.project_name || grant.grant_id,
            donor_id: grant.donor_id,
          })
          if (grant.donor_id) {
            donorIds.add(grant.donor_id)
          }
        }
      })

      setGrantsFromGridView(Array.from(uniqueGrants.values()))

      if (donorIds.size > 0) {
        const { data: donors, error: donorsError } = await supabase
          .from('donors')
          .select('id, short_name')
          .in('id', Array.from(donorIds))

        if (!donorsError && donors) {
          const shortNamesMap: Record<string, string> = {}
          donors.forEach((donor: { id: string; short_name: string }) => {
            if (donor.id && donor.short_name) {
              shortNamesMap[donor.id] = donor.short_name
            }
          })
          setDonorShortNames(shortNamesMap)
        }
      }
    } catch (error) {
      console.error('Error fetching grants from grid view:', error)
    }
  }

  useEffect(() => {
    fetchGrantsFromGridView()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const calculateGrantRemaining = async (grantId: string, _donorName: string) => {
    if (!grantId) {
      setGrantRemaining(null)
      return
    }
    try {
      setGrantRemaining((prev) =>
        prev
          ? { ...prev, loading: true }
          : { total: 0, historical: 0, committed: 0, allocated: 0, remaining: 0, loading: true }
      )
      const res = await fetch(`/api/pool/grant-remaining?grantId=${encodeURIComponent(grantId)}`, {
        cache: 'no-store',
      })
      if (!res.ok) {
        setGrantRemaining(null)
        return
      }
      const data = await res.json()
      setGrantRemaining({
        total: data.total ?? 0,
        historical: data.historical ?? 0,
        committed: data.committed ?? 0,
        allocated: data.allocated ?? 0,
        remaining: data.remaining ?? 0,
        loading: false,
      })
    } catch (error) {
      console.error('Error calculating grant remaining:', error)
      setGrantRemaining(null)
    }
  }

  const calculateStateAllocationRemaining = async (stateName: string) => {
    if (!stateName) {
      setStateAllocationRemaining(null)
      return
    }
    try {
      setStateAllocationRemaining((prev) =>
        prev
          ? { ...prev, loading: true }
          : { total: 0, historical: 0, committed: 0, allocated: 0, remaining: 0, loading: true }
      )
      const res = await fetch(
        `/api/pool/state-allocation-remaining?state=${encodeURIComponent(stateName)}`,
        { cache: 'no-store' }
      )
      if (!res.ok) {
        setStateAllocationRemaining(null)
        return
      }
      const data = await res.json()
      setStateAllocationRemaining({
        total: data.total ?? 0,
        historical: data.historical ?? 0,
        committed: data.committed ?? 0,
        allocated: data.allocated ?? 0,
        remaining: data.remaining ?? 0,
        loading: false,
      })
    } catch (error) {
      console.error('Error calculating state allocation remaining:', error)
      setStateAllocationRemaining(null)
    }
  }

  useEffect(() => {
    if (tempGrantId && tempDonorName && (assignModalOpen || reassignModalOpen)) {
      calculateGrantRemaining(tempGrantId, tempDonorName)
    } else {
      setGrantRemaining(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tempGrantId, tempDonorName, assignModalOpen, reassignModalOpen])

  useEffect(() => {
    if ((assignModalOpen || reassignModalOpen) && mouProjects.length > 0) {
      const stateName = mouProjects[0]?.state
      if (stateName) {
        calculateStateAllocationRemaining(stateName)
      }
    } else {
      setStateAllocationRemaining(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignModalOpen, reassignModalOpen, mouProjects])

  const handleAssignMou = async () => {
    if (!assigningMouId || !tempGrantId || !tempDonorName || !tempMMYY) {
      alert('Please fill all assignment fields')
      return
    }

    if (tempMMYY.length !== 4) {
      alert('MMYY must be 4 digits')
      return
    }

    setIsAssigning(true)
    try {
      const response = await fetch(`/api/f3/mous/${assigningMouId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_id: tempGrantId,
          donor_name: tempDonorName,
          mmyy: tempMMYY,
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to assign MOU' }))
        alert(error.error || 'Failed to assign MOU')
        return
      }

      const result = await response.json()
      alert(`Successfully assigned ${result.assigned_count} work plan(s) to grant`)

      setTempGrantId('')
      setTempDonorName('')
      setTempMMYY('')
      setAssignModalOpen(false)
      setAssigningMouId(null)

      await fetchMous()
    } catch (error) {
      console.error('Error assigning MOU:', error)
      alert('Failed to assign MOU')
    } finally {
      setIsAssigning(false)
    }
  }

  const handleReassignMou = async () => {
    if (!reassigningMouId || !tempGrantId || !tempDonorName || !tempMMYY) {
      alert('Please fill all reassignment fields')
      return
    }

    if (tempMMYY.length !== 4) {
      alert('MMYY must be 4 digits')
      return
    }

    setIsReassigning(true)
    try {
      const response = await fetch(`/api/f3/mous/${reassigningMouId}/reassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_id: tempGrantId,
          donor_name: tempDonorName,
          mmyy: tempMMYY,
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to reassign MOU' }))
        alert(error.error || 'Failed to reassign MOU')
        return
      }

      const result = await response.json()
      alert(`Successfully reassigned ${result.reassigned_count} work plan(s) to grant`)

      setTempGrantId('')
      setTempDonorName('')
      setTempMMYY('')
      setReassignModalOpen(false)
      setReassigningMouId(null)

      await fetchMous()
    } catch (error) {
      console.error('Error reassigning MOU:', error)
      alert('Failed to reassign MOU')
    } finally {
      setIsReassigning(false)
    }
  }

  const openAssignModal = async (mouId: string) => {
    setAssigningMouId(mouId)
    setAssignModalOpen(true)

    try {
      const { data: projects, error } = await supabase
        .from('err_projects')
        .select('id, err_id, state, locality, expenses, emergency_rooms (err_code)')
        .eq('mou_id', mouId)
        .eq('funding_status', 'committed')
        .eq('status', 'approved')
        .order('submitted_at', { ascending: true })

      if (error) {
        console.error('Error fetching MOU projects:', error)
        setMouProjects([])
        setMouTotalAmount(0)
      } else {
        setMouProjects(
          (projects || []).map((p: Record<string, unknown>) => ({
            id: p.id as string,
            err_id:
              (p.err_id as string | null) ??
              (p.emergency_rooms as { err_code?: string } | null)?.err_code ??
              null,
            state: p.state as string,
            locality: p.locality as string | null,
          }))
        )

        const totalAmount = (projects || []).reduce((sum: number, project: Record<string, unknown>) => {
          try {
            const expenses =
              typeof project.expenses === 'string'
                ? JSON.parse(project.expenses)
                : project.expenses || []
            return (
              sum +
              (expenses as { total_cost?: number }[]).reduce(
                (expSum: number, exp) => expSum + (exp.total_cost || 0),
                0
              )
            )
          } catch {
            return sum
          }
        }, 0)
        setMouTotalAmount(totalAmount)

        const states = [...new Set((projects || []).map((p: { state: string }) => p.state).filter(Boolean))]
        if (states.length > 0) {
          const { data: stateData } = await supabase
            .from('states')
            .select('state_name, state_short')
            .in('state_name', states)

          const shorts: Record<string, string> = {}
          ;(stateData || []).forEach((row: { state_name: string; state_short: string }) => {
            shorts[row.state_name] = row.state_short
          })
          setStateShorts(shorts)
        }
      }
    } catch (error) {
      console.error('Error fetching MOU projects:', error)
      setMouProjects([])
      setMouTotalAmount(0)
    }
  }

  const openReassignModal = async (mouId: string) => {
    setReassigningMouId(mouId)
    setReassignModalOpen(true)

    setTempGrantId('')
    setTempDonorName('')
    setTempMMYY('')
    setSelectedGrantMaxSequence(0)

    try {
      const { data: projects, error } = await supabase
        .from('err_projects')
        .select('id, err_id, state, locality, expenses, grant_grid_id, grant_id')
        .eq('mou_id', mouId)
        .eq('funding_status', 'committed')
        .not('grant_id', 'is', null)

      if (error) throw error

      const assignedProjects = (projects || []).filter(
        (p: { grant_id: string | null }) => p.grant_id && p.grant_id.startsWith('LCC-')
      )

      if (assignedProjects.length === 0) {
        setMouProjects([])
        return
      }

      const mappedProjects = assignedProjects.map((p: Record<string, unknown>) => ({
        id: p.id as string,
        err_id: p.err_id as string | null,
        state: p.state as string,
        locality: p.locality as string | null,
      }))
      setMouProjects(mappedProjects)

      const sumExpenses = (exp: unknown): number => {
        if (!exp) return 0
        try {
          const parsed = typeof exp === 'string' ? JSON.parse(exp) : exp
          if (Array.isArray(parsed)) {
            return parsed.reduce(
              (sum: number, item: { total_cost?: number }) => sum + (Number(item.total_cost) || 0),
              0
            )
          }
          return 0
        } catch {
          return 0
        }
      }
      const total = assignedProjects.reduce(
        (sum: number, p: { expenses: unknown }) => sum + sumExpenses(p.expenses),
        0
      )
      setMouTotalAmount(total)

      const uniqueStates = Array.from(
        new Set(assignedProjects.map((p: { state: string }) => p.state).filter(Boolean))
      )
      const shorts: Record<string, string> = {}
      for (const state of uniqueStates) {
        const { data: stateData } = await supabase
          .from('states')
          .select('state_short')
          .eq('state_name', state)
          .limit(1)
        if (stateData?.[0]?.state_short) {
          shorts[state] = stateData[0].state_short
        }
      }
      setStateShorts(shorts)

      const uniqueGrantGridIds = Array.from(
        new Set(
          assignedProjects.map((p: { grant_grid_id: string }) => p.grant_grid_id).filter(Boolean)
        )
      )
      if (uniqueGrantGridIds.length > 0) {
        const { data: grants, error: grantsError } = await supabase
          .from('grants_grid_view')
          .select('id, donor_id')
          .in('id', uniqueGrantGridIds)

        if (!grantsError && grants) {
          const donorIds = Array.from(
            new Set(grants.map((g: { donor_id: string }) => g.donor_id).filter(Boolean))
          )
          if (donorIds.length > 0) {
            const { data: donors, error: donorsError } = await supabase
              .from('donors')
              .select('id, short_name')
              .in('id', donorIds)

            if (!donorsError && donors) {
              const shortNamesMap: Record<string, string> = {}
              donors.forEach((donor: { id: string; short_name: string }) => {
                if (donor.id && donor.short_name) {
                  shortNamesMap[donor.id] = donor.short_name
                }
              })
              setDonorShortNames(shortNamesMap)
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching MOU projects for reassign:', error)
    }
  }

  const handleGrantSelect = async (value: string) => {
    const selectedGrant = grantsFromGridView.find((g) => g.grant_id === value)
    setTempGrantId(value)
    setTempDonorName(selectedGrant?.donor_name || '')

    if (selectedGrant?.donor_id && !donorShortNames[selectedGrant.donor_id]) {
      try {
        const { data: donor, error: donorError } = await supabase
          .from('donors')
          .select('id, short_name')
          .eq('id', selectedGrant.donor_id)
          .single()

        if (!donorError && donor) {
          setDonorShortNames((prev) => ({
            ...prev,
            [donor.id]: donor.short_name || '',
          }))
        }
      } catch (error) {
        console.error('Error fetching donor short name:', error)
      }
    }

    if (value && selectedGrant?.donor_name) {
      try {
        const { data: grantData, error } = await supabase
          .from('grants_grid_view')
          .select('max_workplan_sequence')
          .eq('grant_id', value)
          .eq('donor_name', selectedGrant.donor_name)
          .single()

        if (!error && grantData) {
          setSelectedGrantMaxSequence(grantData.max_workplan_sequence || 0)
        } else {
          setSelectedGrantMaxSequence(0)
        }
      } catch (error) {
        console.error('Error fetching max workplan sequence:', error)
        setSelectedGrantMaxSequence(0)
      }
    } else {
      setSelectedGrantMaxSequence(0)
    }
  }

  const handleReassignGrantSelect = async (value: string) => {
    const selectedGrant = grantsFromGridView.find((g) => g.grant_id === value)
    setTempGrantId(value)
    setTempDonorName(selectedGrant?.donor_name || '')

    if (selectedGrant?.donor_id) {
      if (!donorShortNames[selectedGrant.donor_id]) {
        try {
          const { data: donor, error: donorError } = await supabase
            .from('donors')
            .select('id, short_name')
            .eq('id', selectedGrant.donor_id)
            .single()

          if (!donorError && donor) {
            setDonorShortNames((prev) => ({
              ...prev,
              [donor.id]: donor.short_name || '',
            }))
          }
        } catch (error) {
          console.error('Error fetching donor short name:', error)
        }
      }
    }

    if (value && selectedGrant?.donor_name) {
      try {
        const { data: grantData, error } = await supabase
          .from('grants_grid_view')
          .select('max_workplan_sequence')
          .eq('grant_id', value)
          .eq('donor_name', selectedGrant.donor_name)
          .single()

        if (!error && grantData) {
          setSelectedGrantMaxSequence(grantData.max_workplan_sequence || 0)
        } else {
          setSelectedGrantMaxSequence(0)
        }
      } catch (error) {
        console.error('Error fetching max workplan sequence:', error)
        setSelectedGrantMaxSequence(0)
      }
    } else {
      setSelectedGrantMaxSequence(0)
    }
  }

  const resetAssignModal = () => {
    setAssignModalOpen(false)
    setAssigningMouId(null)
    setTempGrantId('')
    setTempDonorName('')
    setTempMMYY('')
    setMouProjects([])
    setStateShorts({})
    setGrantRemaining(null)
    setStateAllocationRemaining(null)
    setMouTotalAmount(0)
    setSelectedGrantMaxSequence(0)
  }

  const resetReassignModal = () => {
    setReassignModalOpen(false)
    setReassigningMouId(null)
    setTempGrantId('')
    setTempDonorName('')
    setTempMMYY('')
    setMouProjects([])
    setStateShorts({})
    setGrantRemaining(null)
    setStateAllocationRemaining(null)
    setMouTotalAmount(0)
    setSelectedGrantMaxSequence(0)
  }

  return {
    assignModalOpen,
    setAssignModalOpen,
    assigningMouId,
    reassignModalOpen,
    setReassignModalOpen,
    reassigningMouId,
    isAssigning,
    isReassigning,
    tempGrantId,
    setTempGrantId,
    tempDonorName,
    tempMMYY,
    setTempMMYY,
    grantsFromGridView,
    mouProjects,
    stateShorts,
    donorShortNames,
    selectedGrantMaxSequence,
    grantRemaining,
    stateAllocationRemaining,
    mouTotalAmount,
    mous,
    mouAssignmentStatus,
    fmtUsd,
    openAssignModal,
    openReassignModal,
    handleAssignMou,
    handleReassignMou,
    handleGrantSelect,
    handleReassignGrantSelect,
    resetAssignModal,
    resetReassignModal,
  }
}
