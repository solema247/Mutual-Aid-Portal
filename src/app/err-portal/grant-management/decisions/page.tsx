'use client'

import { Suspense } from 'react'
import DistributionDecisionsManager from '../components/DistributionDecisionsManager'
import DecisionsPageGuide from '../components/DecisionsPageGuide'
import GrantPoolSummaryCards from '../components/GrantPoolSummaryCards'
import PoolOverviewByState from '../components/PoolOverviewByState'
import PoolOverviewCharts from '../components/PoolOverviewCharts'

export default function DecisionsPage() {
  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <h2 className="text-2xl font-semibold">Decisions</h2>
      <GrantPoolSummaryCards />
      <DecisionsPageGuide />
      <Suspense fallback={<div className="py-6 text-center text-muted-foreground">Loading…</div>}>
        <div className="space-y-6">
          <DistributionDecisionsManager />
          <PoolOverviewByState />
          <PoolOverviewCharts />
        </div>
      </Suspense>
    </div>
  )
}
