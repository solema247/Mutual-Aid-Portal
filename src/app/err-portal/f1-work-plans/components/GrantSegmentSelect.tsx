'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabaseClient'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fetchActiveGrantSegments, type GrantSegment } from '@/lib/grantSegments'

type GrantSegmentSelectProps = {
  value: string | undefined
  onValueChange: (value: string | undefined) => void
  triggerClassName?: string
  disabled?: boolean
}

export function GrantSegmentSelect ({
  value,
  onValueChange,
  triggerClassName,
  disabled
}: GrantSegmentSelectProps) {
  const { t, i18n } = useTranslation('fsystem')
  const [segments, setSegments] = useState<GrantSegment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const rows = await fetchActiveGrantSegments(supabase)
        if (!cancelled) setSegments(rows)
      } catch (e) {
        console.error(e)
        if (!cancelled) setSegments([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const labelFor = (s: GrantSegment) => {
    if (i18n.language?.startsWith('ar') && s.label_ar) return s.label_ar
    return s.label_en
  }

  const codes = useMemo(() => new Set(segments.map((s) => s.code)), [segments])
  const orphanCode =
    value && !codes.has(value) ? value : null

  const selectValue =
    value && (codes.has(value) || orphanCode) ? value : undefined

  const busy = disabled || loading

  return (
    <Select
      value={selectValue}
      onValueChange={(v) => onValueChange(v || undefined)}
      disabled={busy}
    >
      <SelectTrigger className={triggerClassName}>
        <SelectValue
          placeholder={
            loading ? t('f1.loading_grant_segments') : t('f1.select_grant_segment')
          }
        />
      </SelectTrigger>
      <SelectContent>
        {orphanCode && (
          <SelectItem value={orphanCode}>{orphanCode}</SelectItem>
        )}
        {segments.map((s) => (
          <SelectItem key={s.id} value={s.code}>
            {labelFor(s)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
