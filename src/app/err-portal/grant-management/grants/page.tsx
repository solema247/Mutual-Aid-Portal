'use client'

import { GrantCallsManager } from '../components'
import GrantPoolSummaryCards from '../components/GrantPoolSummaryCards'
import GrantsPageGuide from '../components/GrantsPageGuide'
import { GrantsStackedBarChart } from '@/app/err-portal/dashboard/GrantsStackedBarChart'

export default function GrantsPage() {
  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <h2 className="text-2xl font-semibold">Grants</h2>
      <GrantPoolSummaryCards />
      <GrantsPageGuide />
      <GrantCallsManager />
      <GrantsStackedBarChart orientation="horizontal" />
    </div>
  )
}
