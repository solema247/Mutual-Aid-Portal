'use client'

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
      <DistributionDecisionsManager />
      <PoolOverviewByState />
      <PoolOverviewCharts />
    </div>
  )
}
