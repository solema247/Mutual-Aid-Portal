'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { ActiveFilter, FilterFieldConfig, FilterSelectOption, FilterValue } from './types'
import { STATUS_DISPLAY } from './status-config'

const CHIP_COLORS: Record<string, string> = {
  donor: 'bg-blue-500/10 border-blue-500/30 [&_.chip-dot]:bg-blue-500',
  partner: 'bg-blue-500/10 border-blue-500/30 [&_.chip-dot]:bg-blue-500',
  project_status: 'bg-orange-500/10 border-orange-500/30 [&_.chip-dot]:bg-orange-500',
  f4_status: 'bg-amber-500/10 border-amber-500/30 [&_.chip-dot]:bg-amber-500',
  f5_status: 'bg-emerald-500/10 border-emerald-500/30 [&_.chip-dot]:bg-emerald-500',
  state: 'bg-primary/10 border-primary/30 [&_.chip-dot]:bg-primary',
  locality: 'bg-lime-500/10 border-lime-500/30 [&_.chip-dot]:bg-lime-500',
  date_range: 'bg-violet-500/10 border-violet-500/30 [&_.chip-dot]:bg-violet-500',
  transfer_date_range: 'bg-fuchsia-500/10 border-fuchsia-500/30 [&_.chip-dot]:bg-fuchsia-500',
  date_transfer_exists: 'bg-sky-500/10 border-sky-500/30 [&_.chip-dot]:bg-sky-500',
  historical_new: 'bg-slate-500/10 border-slate-500/30 [&_.chip-dot]:bg-slate-500',
  grant_segment: 'bg-cyan-500/10 border-cyan-500/30 [&_.chip-dot]:bg-cyan-500',
  restriction: 'bg-cyan-500/10 border-cyan-500/30 [&_.chip-dot]:bg-cyan-500',
  grant: 'bg-indigo-500/10 border-indigo-500/30 [&_.chip-dot]:bg-indigo-500',
  grant_serial: 'bg-teal-500/10 border-teal-500/30 [&_.chip-dot]:bg-teal-500',
  grant_id: 'bg-teal-500/10 border-teal-500/30 [&_.chip-dot]:bg-teal-500',
  search: 'bg-teal-500/10 border-teal-500/30 [&_.chip-dot]:bg-teal-500',
  decision_id: 'bg-teal-500/10 border-teal-500/30 [&_.chip-dot]:bg-teal-500',
  report_status: 'bg-orange-500/10 border-orange-500/30 [&_.chip-dot]:bg-orange-500',
  base_room: 'bg-primary/10 border-primary/30 [&_.chip-dot]:bg-primary',
  expense_category: 'bg-rose-500/10 border-rose-500/30 [&_.chip-dot]:bg-rose-500',
  role: 'bg-indigo-500/10 border-indigo-500/30 [&_.chip-dot]:bg-indigo-500',
  status: 'bg-emerald-500/10 border-emerald-500/30 [&_.chip-dot]:bg-emerald-500',
  scope: 'bg-violet-500/10 border-violet-500/30 [&_.chip-dot]:bg-violet-500',
  err: 'bg-cyan-500/10 border-cyan-500/30 [&_.chip-dot]:bg-cyan-500',
}

export interface FilterChipProps {
  filter: ActiveFilter
  field: FilterFieldConfig
  onValueChange: (value: FilterValue) => void
  onRemove: () => void
  options?: FilterSelectOption[]
  /** When true, value controls are non-interactive (e.g. locality before state). */
  disabled?: boolean
  className?: string
}

export function FilterChip({
  filter,
  field,
  onValueChange,
  onRemove,
  options = field.type === 'select' || field.type === 'multi_select' ? field.options : undefined,
  disabled = false,
  className,
}: FilterChipProps) {
  const { t } = useTranslation('common')
  const colorClass = CHIP_COLORS[field.id] ?? 'bg-muted border-border [&_.chip-dot]:bg-muted-foreground'
  const [multiOpen, setMultiOpen] = React.useState(false)

  const multiSelected = React.useMemo(() => {
    if (field.type !== 'multi_select' || !Array.isArray(filter.value)) return [] as string[]
    return filter.value.map((v) => String(v)).filter(Boolean)
  }, [field.type, filter.value])

  const multiOptionValues = React.useMemo(
    () => (options ?? []).map((opt) => opt.value),
    [options]
  )

  const allMultiSelected =
    multiOptionValues.length > 0 && multiOptionValues.every((v) => multiSelected.includes(v))
  const someMultiSelected = multiSelected.length > 0 && !allMultiSelected

  const toggleMultiValue = (optionValue: string) => {
    const current = multiSelected
    const next = current.includes(optionValue)
      ? current.filter((v) => v !== optionValue)
      : [...current, optionValue]
    onValueChange(next)
  }

  const toggleSelectAllMulti = () => {
    onValueChange(allMultiSelected ? [] : [...multiOptionValues])
  }

  const multiLabel =
    multiSelected.length === 0
      ? (field.placeholder ?? 'All')
      : multiSelected.length === 1
        ? (options?.find((o) => o.value === multiSelected[0])?.label ?? multiSelected[0])
        : `${multiSelected.length} selected`

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium text-foreground',
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
            'h-7 rounded-sm border-0 bg-transparent px-2 shadow-none',
            field.id === 'grant_serial' || field.id === 'grant_id' || field.id === 'decision_id' || field.id === 'search'
              ? 'min-w-[280px] w-[min(100%,34rem)] max-w-[min(100vw-2rem,42rem)] text-[11px] leading-tight placeholder:text-muted-foreground'
              : 'w-24 text-xs'
          )}
        />
      )}

      {field.type === 'multi_select' && (
        <Popover open={multiOpen} onOpenChange={setMultiOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              className="h-7 min-w-[140px] rounded-sm border-0 bg-transparent px-2 text-left text-xs hover:bg-black/5 dark:hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
              aria-expanded={multiOpen}
              aria-haspopup="listbox"
            >
              {multiLabel}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="bottom"
            sideOffset={6}
            collisionPadding={12}
            className="z-[200] w-64 max-h-64 overflow-y-auto p-2"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            {multiOptionValues.length > 0 && (
              <label className="mb-1 flex cursor-pointer items-center gap-2 rounded-sm border-b border-border px-2 py-1.5 text-xs font-medium hover:bg-accent">
                <Checkbox
                  checked={allMultiSelected ? true : someMultiSelected ? 'indeterminate' : false}
                  onCheckedChange={toggleSelectAllMulti}
                />
                <span>{t('select_all')}</span>
              </label>
            )}
            {(options ?? []).map((opt) => {
              const checked = multiSelected.includes(opt.value)
              return (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleMultiValue(opt.value)}
                  />
                  <span className="truncate">{opt.label}</span>
                </label>
              )
            })}
          </PopoverContent>
        </Popover>
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
