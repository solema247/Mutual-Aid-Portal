'use client'

import { FundRequestsManager } from '../components'
import GrantPoolSummaryCards from '../components/GrantPoolSummaryCards'
import AllocationManagementGuide from '../components/AllocationManagementGuide'

export default function AllocationManagementPage() {
  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <h2 className="text-2xl font-semibold">Allocation Management</h2>
      <GrantPoolSummaryCards />
      <AllocationManagementGuide />
      <FundRequestsManager />
    </div>
  )
}
