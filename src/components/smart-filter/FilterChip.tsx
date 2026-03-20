'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ActiveFilter, FilterFieldConfig, FilterSelectOption } from './types'
import { STATUS_DISPLAY } from './status-config'

const CHIP_COLORS: Record<string, string> = {
  donor: 'bg-blue-500/10 border-blue-500/30 [&_.chip-dot]:bg-blue-500',
  f4_status: 'bg-amber-500/10 border-amber-500/30 [&_.chip-dot]:bg-amber-500',
  f5_status: 'bg-emerald-500/10 border-emerald-500/30 [&_.chip-dot]:bg-emerald-500',
  state: 'bg-primary/10 border-primary/30 [&_.chip-dot]:bg-primary',
  date_range: 'bg-violet-500/10 border-violet-500/30 [&_.chip-dot]:bg-violet-500',
  historical_new: 'bg-slate-500/10 border-slate-500/30 [&_.chip-dot]:bg-slate-500',
  grant_segment: 'bg-cyan-500/10 border-cyan-500/30 [&_.chip-dot]:bg-cyan-500',
  grant: 'bg-indigo-500/10 border-indigo-500/30 [&_.chip-dot]:bg-indigo-500',
  grant_serial: 'bg-teal-500/10 border-teal-500/30 [&_.chip-dot]:bg-teal-500',
  expense_category: 'bg-rose-500/10 border-rose-500/30 [&_.chip-dot]:bg-rose-500',
}

export interface FilterChipProps {
  filter: ActiveFilter
  field: FilterFieldConfig
  onValueChange: (value: string | [string, string]) => void
  onRemove: () => void
  options?: FilterSelectOption[]
  className?: string
}

export function FilterChip({
  filter,
  field,
  onValueChange,
  onRemove,
  options = field.type === 'select' ? field.options : undefined,
  className,
}: FilterChipProps) {
  const colorClass = CHIP_COLORS[field.id] ?? 'bg-muted border-border [&_.chip-dot]:bg-muted-foreground'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-sm border px-2.5 py-1.5 text-xs font-medium text-foreground',
        colorClass,
        className
      )}
    >
      <span className="chip-dot h-1.5 w-1.5 shrink-0 rounded-full" />
      <span className="shrink-0">{field.label}:</span>

      {field.type === 'text' && (
        <Input
          type="text"
          value={(filter.value as string) ?? ''}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={field.placeholder}
          className={cn(
            'h-7 rounded-sm border-0 bg-transparent px-2 text-xs shadow-none',
            field.id === 'grant_serial' ? 'min-w-[200px] w-[200px]' : 'w-24'
          )}
        />
      )}

      {field.type === 'select' && (
        <Select
          value={(filter.value as string)?.trim() ? (filter.value as string) : '__all__'}
          onValueChange={(v) => onValueChange(v === '__all__' ? '' : v)}
        >
          <SelectTrigger className="h-7 min-w-[140px] rounded-sm border-0 bg-transparent shadow-none px-2 text-xs focus:ring-0 [&>:last-child]:hidden">
            <SelectValue placeholder={field.placeholder} />
          </SelectTrigger>
          <SelectContent className={field.id === 'f4_status' || field.id === 'f5_status' ? 'report-tracker-status-select' : undefined}>
            <SelectItem value="__all__" className="text-xs">
              {field.placeholder ?? 'All'}
            </SelectItem>
            {(field.id === 'f4_status' || field.id === 'f5_status'
              ? STATUS_DISPLAY.map((d) => (
                  <SelectItem key={d.value} value={d.value} className="text-xs">
                    <span
                      className="inline-block rounded-[12px] py-1 px-3 text-xs font-medium"
                      style={{ backgroundColor: d.pillBg, color: d.pillText }}
                    >
                      {d.label}
                    </span>
                  </SelectItem>
                ))
              : (options ?? []).map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))
            )}
          </SelectContent>
        </Select>
      )}

      {field.type === 'date' && (
        <Input
          type="date"
          value={(filter.value as string) ?? ''}
          onChange={(e) => onValueChange(e.target.value)}
          className="h-7 w-36 rounded-sm border-0 bg-transparent px-2 text-xs shadow-none"
        />
      )}

      {field.type === 'date_range' && (
        <div className="flex items-center gap-1">
          <Input
            type="date"
            value={Array.isArray(filter.value) ? filter.value[0] ?? '' : ''}
            onChange={(e) => {
              const to = Array.isArray(filter.value) ? filter.value[1] ?? '' : ''
              onValueChange([e.target.value, to])
            }}
            className="h-7 w-32 rounded-sm border-0 bg-transparent px-2 text-xs shadow-none"
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="date"
            value={Array.isArray(filter.value) ? filter.value[1] ?? '' : ''}
            onChange={(e) => {
              const from = Array.isArray(filter.value) ? filter.value[0] ?? '' : ''
              onValueChange([from, e.target.value])
            }}
            className="h-7 w-32 rounded-sm border-0 bg-transparent px-2 text-xs shadow-none"
          />
        </div>
      )}

      <button
        type="button"
        onClick={onRemove}
        className="rounded p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
        aria-label="Remove filter"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  )
}
