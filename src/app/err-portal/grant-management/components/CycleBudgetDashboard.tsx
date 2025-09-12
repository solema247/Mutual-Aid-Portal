'use client'

import React from 'react'
import { useTranslation } from 'react-i18next'
import { DollarSign, TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import type { FundingCycle, CycleBudgetSummary } from '@/types/cycles'

interface CycleBudgetDashboardProps {
  cycle: FundingCycle
  budgetSummary: CycleBudgetSummary
}

export default function CycleBudgetDashboard({ 
  cycle, 
  budgetSummary 
}: CycleBudgetDashboardProps) {
  const { t } = useTranslation(['err', 'common'])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount)
  }

  const getUtilizationPercentage = () => {
    if (budgetSummary.total_available === 0) return 0
    return Math.round(((budgetSummary.total_committed + budgetSummary.total_pending) / budgetSummary.total_available) * 100)
  }

  const getRemainingPercentage = () => {
    if (budgetSummary.total_available === 0) return 0
    return Math.round((budgetSummary.remaining / budgetSummary.total_available) * 100)
  }

  return (
    <div className="space-y-4">
      {/* Budget Summary */}
      <div className="space-y-4">
        {/* Total Available */}
        <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-blue-600" />
            <span className="font-medium text-blue-900">Total Available</span>
          </div>
          <span className="text-lg font-bold text-blue-900">
            {formatCurrency(budgetSummary.total_available)}
          </span>
        </div>

        {/* Total Allocated */}
        <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-amber-600" />
            <span className="font-medium text-amber-900">Total Allocated</span>
          </div>
          <span className="text-lg font-bold text-amber-900">
            {formatCurrency(budgetSummary.total_allocated)}
          </span>
        </div>

        {/* Total Committed */}
        <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-600" />
            <span className="font-medium text-green-900">Total Committed</span>
          </div>
          <span className="text-lg font-bold text-green-900">
            {formatCurrency(budgetSummary.total_committed)}
          </span>
        </div>

        {/* Total Pending */}
        <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-orange-600" />
            <span className="font-medium text-orange-900">Total Pending</span>
          </div>
          <span className="text-lg font-bold text-orange-900">
            {formatCurrency(budgetSummary.total_pending)}
          </span>
        </div>

        {/* Remaining */}
        <div className={cn(
          "flex items-center justify-between p-3 rounded-lg",
          budgetSummary.remaining >= 0 
            ? "bg-green-50" 
            : "bg-red-50"
        )}>
          <div className="flex items-center gap-2">
            <TrendingDown className={cn(
              "h-4 w-4",
              budgetSummary.remaining >= 0 ? "text-green-600" : "text-red-600"
            )} />
            <span className={cn(
              "font-medium",
              budgetSummary.remaining >= 0 ? "text-green-900" : "text-red-900"
            )}>
              Remaining
            </span>
          </div>
          <span className={cn(
            "text-lg font-bold",
            budgetSummary.remaining >= 0 ? "text-green-900" : "text-red-900"
          )}>
            {formatCurrency(budgetSummary.remaining)}
          </span>
        </div>

        {/* Unused from Previous */}
        {budgetSummary.unused_from_previous > 0 && (
          <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-purple-600" />
              <span className="font-medium text-purple-900">Rollover from Previous</span>
            </div>
            <span className="text-lg font-bold text-purple-900">
              {formatCurrency(budgetSummary.unused_from_previous)}
            </span>
          </div>
        )}

        {/* Utilization Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Utilization</span>
            <span className="font-medium">{getUtilizationPercentage()}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${getUtilizationPercentage()}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}