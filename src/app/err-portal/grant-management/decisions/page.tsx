'use client'

import DistributionDecisionsManager from '../components/DistributionDecisionsManager'
import PoolOverviewByState from '../components/PoolOverviewByState'

export default function DecisionsPage() {
  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <h2 className="text-2xl font-semibold">Decisions</h2>
      <DistributionDecisionsManager />
      <PoolOverviewByState />
    </div>
  )
}
