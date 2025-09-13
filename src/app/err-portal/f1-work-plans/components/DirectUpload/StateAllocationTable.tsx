'use client'

import { useTranslation } from 'react-i18next'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StateAllocationTableProps {
  allocations: {
    id: string;
    state_name: string;
    amount: number;
    amount_used?: number;
    amount_committed?: number;
    amount_allocated?: number;
    total_committed?: number;
    total_allocated?: number;
    remaining?: number;
  }[];
  selectedAllocationId?: string;
  onSelectAllocation?: (id: string) => void;
  highlightedAmount?: number;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export default function StateAllocationTable({
  allocations,
  selectedAllocationId,
  onSelectAllocation,
  highlightedAmount,
  onRefresh,
  isRefreshing = false
}: StateAllocationTableProps) {
  const { t } = useTranslation(['fsystem'])

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <Label>{t('fsystem:f1.state_allocations')}</Label>
        {onRefresh && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="h-8 px-2"
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            <span className="ml-1 text-xs">{t('fsystem:f1.refresh')}</span>
          </Button>
        )}
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b">
            <th className="px-4 py-2 text-left">{t('fsystem:f1.state')}</th>
            <th className="px-4 py-2 text-right">State Allocation</th>
            <th className="px-4 py-2 text-right">F1 Pre-Allocation</th>
            <th className="px-4 py-2 text-right">F1 Committed</th>
            <th className="px-4 py-2 text-right">{t('fsystem:f1.remaining_amount')}</th>
          </tr>
        </thead>
        <tbody>
          {allocations.map((allocation) => {
            const f1Committed = allocation.total_committed || allocation.amount_committed || 0
            const f1Allocated = allocation.total_allocated || allocation.amount_allocated || 0
            const stateAllocation = allocation.amount
            const remaining = stateAllocation - f1Allocated - f1Committed
            const isOverAllocated = highlightedAmount !== undefined && 
                                  highlightedAmount > remaining
            
            return (
              <tr 
                key={allocation.id}
                className={cn(
                  "hover:bg-muted/50",
                  selectedAllocationId === allocation.id && "bg-green-50 border-l-2 border-l-green-600",
                  isOverAllocated && "opacity-50"
                )}
                onClick={() => {
                  if (onSelectAllocation && !isOverAllocated) {
                    onSelectAllocation(allocation.id)
                  }
                }}
                title={isOverAllocated 
                  ? t('fsystem:f1.amount_exceeds_allocation') 
                  : onSelectAllocation 
                    ? t('fsystem:f1.click_to_select') 
                    : undefined
                }
                style={{ 
                  cursor: onSelectAllocation && !isOverAllocated ? 'pointer' : 'default'
                }}
              >
                <td className="px-4 py-2">{allocation.state_name}</td>
                <td className="px-4 py-2 text-right">{stateAllocation.toLocaleString()}</td>
                <td className="px-4 py-2 text-right">{f1Allocated.toLocaleString()}</td>
                <td className="px-4 py-2 text-right">{f1Committed.toLocaleString()}</td>
                <td className={cn(
                  "px-4 py-2 text-right",
                  isOverAllocated && "text-destructive font-medium"
                )}>
                  {remaining.toLocaleString()}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {onSelectAllocation && (
        <p className="text-sm text-muted-foreground mt-2">
          {t('fsystem:f1.select_allocation_hint')}
        </p>
      )}
    </div>
  )
}