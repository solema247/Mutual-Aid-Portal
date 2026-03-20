'use client'

import * as React from 'react'
import { useSearchParams } from 'next/navigation'
import { Filter, ChevronDown, Eraser } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { FilterChip } from './FilterChip'
import type { ActiveFilter, FilterFieldConfig, FilterValues, SmartFilterProps } from './types'

const DEFAULT_URL_PREFIX = 'f_'

/** Parse URL search params into filter values (for hydration / server) */
export function parseFiltersFromSearchParams(
  searchParams: URLSearchParams,
  prefix: string = DEFAULT_URL_PREFIX
): FilterValues {
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
      out[fieldId] = value
    }
  })
  return out
}

/** Serialize filter values to URL search params */
export function filtersToSearchParams(
  filters: ActiveFilter[],
  prefix: string = DEFAULT_URL_PREFIX
): Record<string, string> {
  const params: Record<string, string> = {}
  filters.forEach((f) => {
    if (Array.isArray(f.value)) {
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
}: SmartFilterProps) {
  const searchParams = useSearchParams()
  const [addFilterOpen, setAddFilterOpen] = React.useState(false)

  const activeFieldIds = React.useMemo(() => new Set(filters.map((f) => f.fieldId)), [filters])
  const availableFields = React.useMemo(
    () => fields.filter((f) => !activeFieldIds.has(f.id)),
    [fields, activeFieldIds]
  )

  const addFilter = React.useCallback(
    (field: FilterFieldConfig) => {
      const defaultValue =
        field.type === 'date_range' ? (['', ''] as [string, string]) : ''
      onFiltersChange([
        ...filters,
        { id: `${field.id}-${Date.now()}`, fieldId: field.id, value: defaultValue },
      ])
    },
    [filters, onFiltersChange]
  )

  const updateFilter = React.useCallback(
    (id: string, value: string | [string, string]) => {
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
    const newParams = filtersToSearchParams(filters, urlParamPrefix)
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
  }, [filters, urlParamPrefix, searchParams])

  // Hydrate from URL on mount (once)
  const hydratedRef = React.useRef(false)
  React.useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true
    const fromUrl = parseFiltersFromSearchParams(searchParams, urlParamPrefix)
    const fromUrlEntries = Object.entries(fromUrl).filter(
      ([_, v]) => (Array.isArray(v) ? v.some(Boolean) : String(v).trim() !== '')
    )
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
        {(title != null || count != null) && (
          <h2 className="text-xl font-semibold text-foreground">
            {title}
            {count != null && (
              <span className="ml-1.5 font-normal text-muted-foreground">({count})</span>
            )}
          </h2>
        )}
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            className="min-w-0 border-0 bg-transparent p-0 shadow-none hover:bg-transparent text-muted-foreground hover:text-foreground"
            onClick={() => setAddFilterOpen((o) => !o)}
            aria-expanded={addFilterOpen}
            aria-haspopup="listbox"
          >
            <Filter className="h-4 w-4 mr-1.5" />
            Add filter
            <ChevronDown className="h-4 w-4 ml-1" />
          </Button>
          {addFilterOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                aria-hidden
                onClick={() => setAddFilterOpen(false)}
              />
              <div
                className="absolute right-0 top-full z-50 mt-1 min-w-[12rem] rounded-md border border-border bg-popover py-1 shadow-md"
                role="listbox"
              >
                {availableFields.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    All filters added
                  </div>
                ) : (
                  availableFields.map((field) => (
                    <button
                      key={field.id}
                      type="button"
                      role="option"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                      onClick={() => {
                        addFilter(field)
                        setAddFilterOpen(false)
                      }}
                    >
                      {field.label}
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
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
