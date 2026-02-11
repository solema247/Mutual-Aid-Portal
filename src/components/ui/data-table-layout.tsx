'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface DataTableLayoutProps {
  /** Table title (e.g. "Invoices") */
  title: string
  /** Table content */
  children: React.ReactNode
  /** Optional class for the card wrapper */
  className?: string
  /** Show "Show X entries" dropdown; undefined = hide */
  entriesPerPage?: number
  onEntriesPerPageChange?: (value: number) => void
  entriesPerPageOptions?: number[]
  /** Optional search: value and handlers; undefined = hide search */
  searchPlaceholder?: string
  searchValue?: string
  onSearchChange?: (value: string) => void
  onSearchGo?: () => void
  /** Pagination; undefined = hide */
  totalItems?: number
  currentPage?: number
  onPageChange?: (page: number) => void
  itemsPerPage?: number
  /** Optional extra actions (e.g. primary button) to show next to title or in top bar */
  actions?: React.ReactNode
}

export function DataTableLayout({
  title,
  children,
  className,
  entriesPerPage = 10,
  onEntriesPerPageChange,
  entriesPerPageOptions = [10, 15, 25, 50],
  searchPlaceholder = 'Search...',
  searchValue = '',
  onSearchChange,
  onSearchGo,
  totalItems = 0,
  currentPage = 1,
  onPageChange,
  itemsPerPage = 10,
  actions,
}: DataTableLayoutProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage))
  const startIndex = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1
  const endIndex = Math.min(currentPage * itemsPerPage, totalItems)

  const showEntries = onEntriesPerPageChange != null
  const showSearch = onSearchChange != null
  const showPagination = onPageChange != null && totalItems > 0 && itemsPerPage > 0

  return (
    <div className={cn('rounded-lg bg-white p-4 border border-table-border shadow-sm', className)}>
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-brand-body">{title}</h2>
        {actions && <div className="flex items-center gap-2 [&_button]:text-brand-purple [&_button:hover]:text-brand-orange [&_svg]:text-brand-purple [&_svg:hover]:text-brand-orange">{actions}</div>}
      </div>

      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {showEntries && (
          <div className="flex items-center gap-2 text-sm text-brand-body">
            <span>Show</span>
            <Select
              value={String(entriesPerPage)}
              onValueChange={(v) => onEntriesPerPageChange(Number(v))}
            >
              <SelectTrigger className="h-8 w-16 rounded-md border-table-border bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {entriesPerPageOptions.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>entries</span>
          </div>
        )}
        {showSearch && (
          <div className="flex items-center gap-2">
            <Input
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSearchGo?.()}
              className="h-8 w-48 sm:w-56"
            />
            {onSearchGo && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-3"
                onClick={onSearchGo}
              >
                Go →
              </Button>
            )}
          </div>
        )}
        {!showEntries && !showSearch && <div />}
      </div>

      {children}

      {showPagination && (
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-brand-body">
            Showing {startIndex} to {endIndex} of {totalItems} entries
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 border-brand-dark-blue text-brand-dark-blue bg-white px-3 hover:bg-brand-orange hover:text-white hover:border-brand-orange"
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
            >
              <ChevronLeft className="h-4 w-4 mr-0.5" />
              Previous
            </Button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number
              if (totalPages <= 5) pageNum = i + 1
              else if (currentPage <= 3) pageNum = i + 1
              else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i
              else pageNum = currentPage - 2 + i
              return (
                <Button
                  key={pageNum}
                  variant={currentPage === pageNum ? 'default' : 'outline'}
                  size="sm"
                  className={cn(
                    'h-8 min-w-8 px-2',
                    currentPage === pageNum
                      ? 'bg-brand-orange text-white hover:bg-brand-orange/90'
                      : 'border-brand-dark-blue text-brand-dark-blue bg-white hover:bg-brand-orange hover:text-white hover:border-brand-orange'
                  )}
                  onClick={() => onPageChange(pageNum)}
                >
                  {pageNum}
                </Button>
              )
            })}
            <Button
              variant="outline"
              size="sm"
              className="h-8 border-brand-dark-blue text-brand-dark-blue bg-white px-3 hover:bg-brand-orange hover:text-white hover:border-brand-orange"
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage >= totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-0.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
