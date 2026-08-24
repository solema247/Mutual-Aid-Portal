'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getDistributionDecisionsFilterFields,
  type ActiveFilter,
} from '@/components/smart-filter'
import {
  EMPTY_POOL_FILTER_OPTIONS,
  poolByStateFilterOptions,
  poolByStateRows,
  poolSliceFromActiveFilters,
  poolSliceToQueryString,
  type PoolByStateFilterOptions,
} from '@/lib/poolByState'

export type PoolByStateRow = {
  state_name: string
  allocated?: number
  assigned?: number
  available?: number
  committed?: number
  pending?: number
  balance?: number
  remaining?: number
  decision_count?: number
  overall_decision_count?: number
}

export function useFilteredPoolByState() {
  const [filters, setFilters] = useState<ActiveFilter[]>([])
  const [byState, setByState] = useState<PoolByStateRow[]>([])
  const [filterOptions, setFilterOptions] = useState<PoolByStateFilterOptions>(EMPTY_POOL_FILTER_OPTIONS)
  const [loading, setLoading] = useState(true)

  const filterFields = useMemo(
    () => getDistributionDecisionsFilterFields(filterOptions),
    [filterOptions]
  )

  const loadData = useCallback(async (activeFilters: ActiveFilter[]) => {
    try {
      setLoading(true)
      const qs = poolSliceToQueryString(poolSliceFromActiveFilters(activeFilters))
      const payload = await fetch(`/api/pool/by-state${qs}`, { cache: 'no-store' }).then((r) => r.json())
      setByState(poolByStateRows<PoolByStateRow>(payload))
      const opts = poolByStateFilterOptions(payload)
      if (opts) setFilterOptions(opts)
    } catch (e) {
      console.error('Pool by-state load error:', e)
      setByState([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadData(filters)
    }, 250)
    return () => window.clearTimeout(t)
  }, [filters, loadData])

  return {
    filters,
    setFilters,
    filterFields,
    byState,
    loading,
    loadData: () => loadData(filters),
  }
}
