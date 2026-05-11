'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { F4SectorRow } from '@/lib/f4ExpenseSectors'

interface F4ExpenseSectorSelectProps {
  sectors: F4SectorRow[]
  valueEn: string
  onChangeEn: (sectorNameEn: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function F4ExpenseSectorSelect ({
  sectors,
  valueEn,
  onChangeEn,
  placeholder = 'Select sector',
  className,
  disabled,
}: F4ExpenseSectorSelectProps) {
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
      <SelectTrigger className={className ?? 'h-8 w-full'}>
        <SelectValue placeholder={sectors.length === 0 ? '…' : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {sectors.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.sector_name_en.trim()}
            {s.sector_name_ar ? ` (${s.sector_name_ar})` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
