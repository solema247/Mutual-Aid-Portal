'use client'

import { useTranslation } from 'react-i18next'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { F4SectorRow } from '@/lib/f4ExpenseSectors'
import { sectorPillClassName } from '@/lib/f4ExpenseUi'

interface F4ExpenseSectorSelectProps {
  sectors: F4SectorRow[]
  valueEn: string
  onChangeEn: (sectorNameEn: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

function sectorLabel (s: F4SectorRow, lang: string): string {
  const en = (s.sector_name_en || '').trim()
  if (lang.startsWith('ar')) {
    const ar = (s.sector_name_ar || '').trim()
    return ar || en
  }
  return en
}

export function F4ExpenseSectorSelect ({
  sectors,
  valueEn,
  onChangeEn,
  placeholder = 'Select sector',
  className,
  disabled,
}: F4ExpenseSectorSelectProps) {
  const { i18n } = useTranslation()
  const lang = i18n.language || 'en'
  const trimmed = (valueEn || '').trim()
  const selected = sectors.find((s) => s.sector_name_en.trim() === trimmed)

  return (
    <Select
      disabled={disabled || sectors.length === 0}
      value={selected?.id ?? ''}
      onValueChange={(id) => {
        const s = sectors.find((x) => x.id === id)
        onChangeEn(s ? s.sector_name_en.trim() : '')
      }}
    >
      <SelectTrigger className={cn('h-8 w-full min-w-0', className)}>
        {selected ? (
          <span
            className={cn(
              'inline-flex max-w-full truncate rounded-full border px-2 py-0.5 text-xs font-medium',
              sectorPillClassName(selected.sector_name_en)
            )}
          >
            {sectorLabel(selected, lang)}
          </span>
        ) : (
          <SelectValue placeholder={sectors.length === 0 ? '…' : placeholder} />
        )}
      </SelectTrigger>
      <SelectContent>
        {sectors.map((s) => (
          <SelectItem key={s.id} value={s.id} className="py-1.5">
            <span
              className={cn(
                'inline-flex max-w-full rounded-full border px-2.5 py-0.5 text-xs font-medium',
                sectorPillClassName(s.sector_name_en)
              )}
            >
              {sectorLabel(s, lang)}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Read-only colored sector pill (uses stored English name + locale label lookup). */
export function F4SectorPill ({
  valueEn,
  sectors,
}: {
  valueEn: string | null | undefined
  sectors: F4SectorRow[]
}) {
  const { i18n } = useTranslation()
  const lang = i18n.language || 'en'
  const trimmed = (valueEn || '').trim()
  if (!trimmed) return <span className="text-muted-foreground">-</span>
  const row = sectors.find((s) => s.sector_name_en.trim() === trimmed)
  const label = row ? sectorLabel(row, lang) : trimmed
  return (
    <span
      className={cn(
        'inline-flex max-w-full truncate rounded-full border px-2.5 py-0.5 text-xs font-medium',
        sectorPillClassName(trimmed)
      )}
      title={label}
    >
      {label}
    </span>
  )
}
