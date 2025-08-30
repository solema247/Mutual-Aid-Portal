'use client'

import { useTranslation } from 'react-i18next'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface StateAllocationTableProps {
  allocations: {
    id: string;
    state_name: string;
    amount: number;
    amount_used?: number;
    amount_committed?: number;
    amount_pending?: number;
    amount_approved?: number;
  }[];
  selectedAllocationId?: string;
  onSelectAllocation?: (id: string) => void;
  highlightedAmount?: number;
}

export default function StateAllocationTable({
  allocations,
  selectedAllocationId,
  onSelectAllocation,
  highlightedAmount
}: StateAllocationTableProps) {
  const { t } = useTranslation(['fsystem'])

  return (
    <div>
      <Label className="mb-2">{t('fsystem:f1.state_allocations')}</Label>
      <table className="w-full">
        <thead>
          <tr className="border-b">
            <th className="px-4 py-2 text-left">{t('fsystem:f1.state')}</th>
            <th className="px-4 py-2 text-right">{t('fsystem:f1.allocated_amount')}</th>
            <th className="px-4 py-2 text-right">{t('fsystem:f1.committed_amount')}</th>
            <th className="px-4 py-2 text-right">{t('fsystem:f1.remaining_amount')}</th>
          </tr>
        </thead>
        <tbody>
          {allocations.map((allocation) => {
                        const committed = allocation.amount_committed || 0
            const pending = allocation.amount_pending || 0
            const approved = allocation.amount_approved || 0
            const remaining = allocation.amount - committed
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
                <td className="px-4 py-2 text-right">{allocation.amount.toLocaleString()}</td>
                <td className="px-4 py-2 text-right">
                  {committed.toLocaleString()}
                  <span className="text-xs text-muted-foreground ml-1">
                    (Pending: {pending.toLocaleString()}, Approved: {approved.toLocaleString()})
                  </span>
                </td>
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