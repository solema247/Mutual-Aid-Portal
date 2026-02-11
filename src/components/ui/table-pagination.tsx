'use client'

import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface TablePaginationProps {
  /** Total number of items */
  totalItems: number
  /** Current 1-based page */
  currentPage: number
  /** Called when page changes */
  onPageChange: (page: number) => void
  /** Items per page */
  itemsPerPage: number
  /** Optional label for the items (e.g. "projects", "entries") */
  itemLabel?: string
  /** Optional class for the container */
  className?: string
}

export function TablePagination({
  totalItems,
  currentPage,
  onPageChange,
  itemsPerPage,
  itemLabel = 'entries',
  className,
}: TablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage))
  const startIndex = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1
  const endIndex = Math.min(currentPage * itemsPerPage, totalItems)

  if (totalItems <= itemsPerPage) return null

  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mt-4',
        className
      )}
    >
      <p className="text-sm text-brand-body">
        Showing {startIndex} to {endIndex} of {totalItems} {itemLabel}
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
  )
}
