'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  PAYMENT_METHOD_OPTIONS,
  paymentMethodPillClassName,
} from '@/lib/f4ExpenseUi'

interface F4PaymentMethodSelectProps {
  value: string
  onChange: (method: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function F4PaymentMethodSelect ({
  value,
  onChange,
  placeholder = 'Method',
  className,
  disabled,
}: F4PaymentMethodSelectProps) {
  const current = (value || 'Bank Transfer').trim() || 'Bank Transfer'

  return (
    <Select disabled={disabled} value={current} onValueChange={onChange}>
      <SelectTrigger className={cn('h-8 w-full min-w-0', className)}>
        <span
          className={cn(
            'inline-flex max-w-full truncate rounded-full border px-2 py-0.5 text-xs font-medium',
            paymentMethodPillClassName(current)
          )}
        >
          {current}
        </span>
      </SelectTrigger>
      <SelectContent>
        {PAYMENT_METHOD_OPTIONS.map((m) => (
          <SelectItem key={m} value={m} className="py-1.5">
            <span
              className={cn(
                'inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium',
                paymentMethodPillClassName(m)
              )}
            >
              {m}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function F4PaymentMethodPill ({ value }: { value: string | null | undefined }) {
  const v = (value || '').trim()
  if (!v) return <span className="text-muted-foreground">-</span>
  return (
    <span
      className={cn(
        'inline-flex max-w-full truncate rounded-full border px-2.5 py-0.5 text-xs font-medium',
        paymentMethodPillClassName(v)
      )}
    >
      {v}
    </span>
  )
}
