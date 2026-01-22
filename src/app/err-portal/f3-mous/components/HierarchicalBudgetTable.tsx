'use client'

import React, { useState } from 'react'
import { BudgetTableData } from '@/lib/mou-aggregation'
import { Minus, Plus } from 'lucide-react'

interface HierarchicalBudgetTableProps {
  data: BudgetTableData
  forceExpanded?: boolean // If true, all rows are always expanded (for PDF export)
}

export default function HierarchicalBudgetTable({ data, forceExpanded = false }: HierarchicalBudgetTableProps) {
  const [expandedErrs, setExpandedErrs] = useState<Set<string>>(new Set(data.errs.map(err => err.errId)))
  
  // If forceExpanded is true, always show all rows as expanded
  const effectiveExpandedErrs = forceExpanded 
    ? new Set(data.errs.map(err => err.errId))
    : expandedErrs

  const toggleErr = (errId: string) => {
    const newExpanded = new Set(expandedErrs)
    if (newExpanded.has(errId)) {
      newExpanded.delete(errId)
    } else {
      newExpanded.add(errId)
    }
    setExpandedErrs(newExpanded)
  }

  const expandAll = () => {
    setExpandedErrs(new Set(data.errs.map(err => err.errId)))
  }

  const collapseAll = () => {
    setExpandedErrs(new Set())
  }

  const allExpanded = data.errs.length > 0 && data.errs.every(err => effectiveExpandedErrs.has(err.errId))
  const allCollapsed = effectiveExpandedErrs.size === 0

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm" style={{ fontSize: '12px' }}>
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-300 p-2 text-center" style={{ width: '40px' }}>
              {!forceExpanded && (
                <button
                  onClick={allExpanded ? collapseAll : expandAll}
                  className="text-xs px-2 py-1 hover:bg-gray-200 rounded cursor-pointer font-normal"
                  title={allExpanded ? 'Collapse All' : 'Expand All'}
                >
                  {allExpanded ? '− All' : '+ All'}
                </button>
              )}
            </th>
            <th className="border border-gray-300 p-2 text-center" style={{ width: '50px' }}>ID</th>
            <th className="border border-gray-300 p-2">ERR Name / Sector</th>
            <th className="border border-gray-300 p-2 text-right">Beneficiaries</th>
            <th className="border border-gray-300 p-2 text-right">Allocated Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.errs.map((err, errIndex) => {
            const isExpanded = effectiveExpandedErrs.has(err.errId)
            const errNumber = errIndex + 1

            return (
              <React.Fragment key={err.errId}>
                {/* Parent ERR row */}
                <tr className="bg-gray-50 hover:bg-gray-100">
                  <td className="border border-gray-300 p-2 text-center">
                    {!forceExpanded && (
                      <button
                        onClick={() => toggleErr(err.errId)}
                        className="flex items-center justify-center w-6 h-6 hover:bg-gray-200 rounded cursor-pointer"
                        aria-label={isExpanded ? 'Collapse' : 'Expand'}
                      >
                        {isExpanded ? (
                          <Minus className="w-4 h-4" />
                        ) : (
                          <Plus className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </td>
                  <td className="border border-gray-300 p-2 text-center font-medium">
                    {errNumber}
                  </td>
                  <td className="border border-gray-300 p-2">
                    <div>
                      {err.errName} <br />
                      <span className="text-xs text-gray-600">{err.errCode}</span>
                    </div>
                  </td>
                  <td className="border border-gray-300 p-2 text-right font-medium">
                    {err.beneficiaries > 0 ? err.beneficiaries.toLocaleString() : '-'}
                  </td>
                  <td className="border border-gray-300 p-2 text-right font-medium">
                    Subtotal: {err.subtotal.toLocaleString()}
                  </td>
                </tr>

                {/* Child activity rows */}
                {isExpanded && err.activities.map((activity, activityIndex) => {
                  const activityNumber = `${errNumber}.${activityIndex + 1}`
                  return (
                    <tr key={`${err.errId}-${activity.category}`} className="hover:bg-gray-50">
                      <td className="border border-gray-300 p-2"></td>
                      <td className="border border-gray-300 p-2 text-center text-gray-600">
                        {activityNumber}
                      </td>
                      <td className="border border-gray-300 p-2 pl-6">
                        {activity.category}
                      </td>
                      <td className="border border-gray-300 p-2 text-right">
                        {activity.beneficiaries > 0 ? activity.beneficiaries.toLocaleString() : '-'}
                      </td>
                      <td className="border border-gray-300 p-2 text-right">
                        {activity.amount.toLocaleString()}
                      </td>
                    </tr>
                  )
                })}
              </React.Fragment>
            )
          })}

          {/* Grand Total row */}
          <tr className="bg-gray-200 font-bold">
            <td className="border border-gray-300 p-2" colSpan={3}>
              Grand Total
            </td>
            <td className="border border-gray-300 p-2 text-right">-</td>
            <td className="border border-gray-300 p-2 text-right">
              {data.grandTotal.toLocaleString()}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

