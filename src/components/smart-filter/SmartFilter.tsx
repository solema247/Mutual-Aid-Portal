'use client'

import * as React from 'react'
import { useSearchParams } from 'next/navigation'
import { Filter, ChevronDown, Eraser } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { FilterChip } from './FilterChip'
import type { ActiveFilter, FilterFieldConfig, FilterValues, SmartFilterProps, FilterValue } from './types'

const DEFAULT_URL_PREFIX = 'f_'

/** Parse URL search params into filter values (for hydration / server) */
export function parseFiltersFromSearchParams(
  searchParams: URLSearchParams,
  prefix: string = DEFAULT_URL_PREFIX,
  fields: FilterFieldConfig[] = []
): FilterValues {
  const fieldById = new Map(fields.map((f) => [f.id, f]))
  const out: FilterValues = {}
  searchParams.forEach((value, key) => {
    if (!key.startsWith(prefix)) return
    const fieldId = key.slice(prefix.length)
    if (fieldId.endsWith('_from')) {
      const base = fieldId.replace(/_from$/, '')
      const to = searchParams.get(`${prefix}${base}_to`) ?? ''
      out[base] = [value, to]
    } else if (fieldId.endsWith('_to')) {
      const base = fieldId.replace(/_to$/, '')
      if (out[base] == null) out[base] = ['', value]
      else (out[base] as [string, string])[1] = value
    } else {
      const field = fieldById.get(fieldId)
      if (field?.type === 'multi_select') {
        out[fieldId] = value.includes('|') ? value.split('|').filter(Boolean) : value ? [value] : []
      } else {
        out[fieldId] = value
      }
    }
  })
  return out
}

/** Serialize filter values to URL search params */
export function filtersToSearchParams(
  filters: ActiveFilter[],
  prefix: string = DEFAULT_URL_PREFIX,
  fields: FilterFieldConfig[] = []
): Record<string, string> {
  const fieldById = new Map(fields.map((f) => [f.id, f]))
  const params: Record<string, string> = {}
  filters.forEach((f) => {
    const field = fieldById.get(f.fieldId)
    if (field?.type === 'multi_select' && Array.isArray(f.value)) {
      const joined = f.value.map((v) => String(v).trim()).filter(Boolean).join('|')
      if (joined) params[`${prefix}${f.fieldId}`] = joined
      return
    }
    if (Array.isArray(f.value) && field?.type === 'date_range') {
      if (f.value[0]) params[`${prefix}${f.fieldId}_from`] = f.value[0]
      if (f.value[1]) params[`${prefix}${f.fieldId}_to`] = f.value[1]
    } else if (f.value != null && String(f.value).trim() !== '') {
      params[`${prefix}${f.fieldId}`] = String(f.value)
    }
  })
  return params
}

export function SmartFilter({
  fields,
  filters,
  onFiltersChange,
  urlParamPrefix = DEFAULT_URL_PREFIX,
  className,
  title,
  count,
  extraCounts,
}: SmartFilterProps) {
  const searchParams = useSearchParams()
  const [addFilterOpen, setAddFilterOpen] = React.useState(false)

  const activeFieldIds = React.useMemo(() => new Set(filters.map((f) => f.fieldId)), [filters])

  const toggleCategoryFilter = React.useCallback(
    (field: FilterFieldConfig, checked: boolean) => {
      if (checked) {
        if (activeFieldIds.has(field.id)) return
        let defaultValue: FilterValue = ''
        if (field.type === 'date_range') defaultValue = ['', '']
        else if (field.type === 'multi_select') defaultValue = []
        onFiltersChange([
          ...filters,
          { id: `${field.id}-${Date.now()}`, fieldId: field.id, value: defaultValue },
        ])
        return
      }
      onFiltersChange(filters.filter((f) => f.fieldId !== field.id))
    },
    [activeFieldIds, filters, onFiltersChange]
  )

  const updateFilter = React.useCallback(
    (id: string, value: FilterValue) => {
      onFiltersChange(
        filters.map((f) => (f.id === id ? { ...f, value } : f))
      )
    },
    [filters, onFiltersChange]
  )

  const removeFilter = React.useCallback(
    (id: string) => {
      onFiltersChange(filters.filter((f) => f.id !== id))
    },
    [filters, onFiltersChange]
  )

  const clearAll = React.useCallback(() => {
    onFiltersChange([])
  }, [onFiltersChange])

  // Sync to URL when filters change (client-side)
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(searchParams.toString())
    const newParams = filtersToSearchParams(filters, urlParamPrefix, fields)
    let changed = false
    const keysToDelete: string[] = []
    params.forEach((_, key) => {
      if (key.startsWith(urlParamPrefix)) keysToDelete.push(key)
    })
    keysToDelete.forEach((k) => {
      params.delete(k)
      changed = true
    })
    Object.entries(newParams).forEach(([k, v]) => {
      if (params.get(k) !== v) {
        params.set(k, v)
        changed = true
      }
    })
    if (changed && window.history?.replaceState) {
      const url = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`
      window.history.replaceState(null, '', url)
    }
  }, [filters, urlParamPrefix, searchParams, fields])

  // Hydrate from URL on mount (once)
  const hydratedRef = React.useRef(false)
  React.useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true
    const fromUrl = parseFiltersFromSearchParams(searchParams, urlParamPrefix, fields)
    const fromUrlEntries = Object.entries(fromUrl).filter(([fieldId, v]) => {
      const field = fields.find((f) => f.id === fieldId)
      if (field?.type === 'multi_select' && Array.isArray(v)) {
        return v.length > 0
      }
      if (Array.isArray(v)) return v[0]?.trim() || v[1]?.trim()
      return String(v).trim() !== ''
    })
    if (fromUrlEntries.length === 0) return
    const toAdd: ActiveFilter[] = []
    fromUrlEntries.forEach(([fieldId, value]) => {
      const field = fields.find((f) => f.id === fieldId)
      if (field) toAdd.push({ id: `${fieldId}-${Date.now()}-${Math.random()}`, fieldId, value })
    })
    if (toAdd.length > 0) onFiltersChange(toAdd)
  }, [fields, onFiltersChange, searchParams, urlParamPrefix])

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {(title != null || count != null || (extraCounts != null && extraCounts.length > 0)) && (
          <h2 className="text-xl font-semibold text-foreground">
            {title}
            {count != null && (
              <span className="ml-1.5 font-normal text-muted-foreground">({count})</span>
            )}
            {extraCounts?.map((item) => (
              <span key={item.label} className="ml-3 font-normal text-muted-foreground">
                <span className="font-semibold text-foreground">{item.label}</span>
                <span className="ml-1.5">({item.count})</span>
              </span>
            ))}
          </h2>
        )}
        <Popover open={addFilterOpen} onOpenChange={setAddFilterOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs font-medium"
              aria-expanded={addFilterOpen}
              aria-haspopup="listbox"
            >
              <Filter className="h-3.5 w-3.5" />
              Add filter
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="bottom"
            sideOffset={6}
            collisionPadding={12}
            className="z-[200] w-56 max-h-72 overflow-y-auto p-2"
            role="group"
            aria-label="Add filter"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <div className="px-2 pb-1.5 pt-0.5 text-xs font-medium text-muted-foreground">
              Add filter
            </div>
            <div className="mb-1 h-px bg-border" role="separator" />
            {fields.length === 0 ? (
              <div className="px-2 py-2 text-xs text-muted-foreground">
                No filters available
              </div>
            ) : (
              fields.map((field) => {
                const checked = activeFieldIds.has(field.id)
                return (
                  <label
                    key={field.id}
                    className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) => {
                        toggleCategoryFilter(field, value === true)
                      }}
                      aria-label={field.label}
                    />
                    <span className="truncate">{field.label}</span>
                  </label>
                )
              })
            )}
          </PopoverContent>
        </Popover>
      </div>

      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {filters.map((filter) => {
            const field = fields.find((f) => f.id === filter.fieldId)
            if (!field) return null
            return (
              <FilterChip
                key={filter.id}
                filter={filter}
                field={field}
                onValueChange={(v) => updateFilter(filter.id, v)}
                onRemove={() => removeFilter(filter.id)}
              />
            )
          })}
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Eraser className="h-4 w-4 shrink-0" />
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}
