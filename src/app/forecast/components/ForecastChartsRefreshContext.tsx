'use client'

import { createContext, useCallback, useContext, useState } from 'react'

type ForecastChartsRefreshContextValue = {
  refreshKey: number
  refresh: () => void
}

const ForecastChartsRefreshContext = createContext<ForecastChartsRefreshContextValue | null>(null)

export function ForecastChartsRefreshProvider({ children }: { children: React.ReactNode }) {
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])
  return (
    <ForecastChartsRefreshContext.Provider value={{ refreshKey, refresh }}>
      {children}
    </ForecastChartsRefreshContext.Provider>
  )
}

export function useForecastChartsRefresh(): ForecastChartsRefreshContextValue {
  const ctx = useContext(ForecastChartsRefreshContext)
  if (!ctx) {
    return {
      refreshKey: 0,
      refresh: () => {},
    }
  }
  return ctx
}
