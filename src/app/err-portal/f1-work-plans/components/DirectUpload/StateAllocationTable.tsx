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
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-2 text-left">{t('fsystem:f1.state')}</th>
              <th className="px-4 py-2 text-right">{t('fsystem:f1.allocated_amount')}</th>
              <th className="px-4 py-2 text-right">{t('fsystem:f1.remaining_amount')}</th>
            </tr>
          </thead>
          <tbody>
            {allocations.map((allocation) => {
              const remaining = allocation.amount - (allocation.amount_used || 0)
              const isOverAllocated = highlightedAmount !== undefined && 
                                    highlightedAmount > remaining
              
              return (
                <tr 
                  key={allocation.id} 
                  className={cn(
                    "border-t",
                    onSelectAllocation && "cursor-pointer hover:bg-muted/50",
                    selectedAllocationId === allocation.id && "bg-green-50 border-l-4 border-l-green-600",
                    isOverAllocated && "opacity-50"  // Dim if over allocated
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
      </div>
      {onSelectAllocation && (
        <p className="text-sm text-muted-foreground mt-2">
          {t('fsystem:f1.select_allocation_hint')}
        </p>
      )}
    </div>
  )
}