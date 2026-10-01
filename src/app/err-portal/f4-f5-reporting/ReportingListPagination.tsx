'use client'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PAGE_SIZE_OPTIONS } from '@/lib/f4f5/listQueryParams'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { buildReportingPageNumbers, REPORTING_TABLE_FOOTER } from './reportingTableShell'

export type ReportingPaginationPending =
  | null
  | 'prev'
  | 'next'
  | 'pageSize'
  | { page: number }

type PaginationMeta = {
  page: number
  pageSize: number
  total: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

type ReportingListPaginationProps = {
  pagination: PaginationMeta
  pending: ReportingPaginationPending
  /** True while a non-blocking list refresh is in flight (rows stay visible). */
  listRefreshing: boolean
  hasRows: boolean
  listLoading: boolean
  previousLabel: string
  nextLabel: string
  onGoToPage: (page: number) => void
  onPrevious: () => void
  onNext: () => void
  onPageSizeChange: (pageSize: string) => void
}

export function ReportingListPagination({
  pagination,
  pending,
  listRefreshing,
  hasRows,
  listLoading,
  previousLabel,
  nextLabel,
  onGoToPage,
  onPrevious,
  onNext,
  onPageSizeChange,
}: ReportingListPaginationProps) {
  const pageNumbers = buildReportingPageNumbers(pagination.page, pagination.totalPages)
  const controlsLocked =
    pending != null || listRefreshing || (listLoading && hasRows)

  if (pagination.total <= 0 || (!hasRows && listLoading)) {
    return null
  }

  const showSpinner = (match: ReportingPaginationPending) => {
    if (pending == null) return false
    if (typeof pending === 'object' && pending != null && 'page' in pending) {
      return typeof match === 'object' && match != null && 'page' in match && match.page === pending.page
    }
    return pending === match
  }

  return (
    <div className={REPORTING_TABLE_FOOTER}>
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="tabular-nums">
          Showing {(pagination.page - 1) * pagination.pageSize + 1}–
          {Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total}
        </span>
        <div className="flex items-center gap-2">
          <span>Rows</span>
          <Select
            value={String(pagination.pageSize)}
            disabled={controlsLocked}
            onValueChange={(v) => {
              if (controlsLocked) return
              onPageSizeChange(v)
            }}
          >
            <SelectTrigger className="h-8 w-[72px] border-input bg-background text-xs">
              {showSpinner('pageSize') ? (
                <Loader2 className="size-3.5 animate-spin mx-auto" aria-hidden />
              ) : (
                <SelectValue />
              )}
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center gap-1" aria-busy={controlsLocked}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-2 text-xs"
          onClick={() => {
            if (controlsLocked || !pagination.hasPreviousPage) return
            onPrevious()
          }}
          disabled={!pagination.hasPreviousPage || controlsLocked}
        >
          {showSpinner('prev') ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <ChevronLeft className="size-3.5" />
          )}
          {previousLabel}
        </Button>
        {pageNumbers.map((page, idx) =>
          page === 'ellipsis' ? (
            <span key={`ellipsis-${idx}`} className="px-1 text-xs text-muted-foreground">
              …
            </span>
          ) : (
            <Button
              key={page}
              type="button"
              variant={page === pagination.page ? 'default' : 'outline'}
              size="sm"
              className="h-8 w-8 p-0 text-xs"
              onClick={() => {
                if (controlsLocked || page === pagination.page) return
                onGoToPage(page)
              }}
              disabled={controlsLocked || page === pagination.page}
              aria-current={page === pagination.page ? 'page' : undefined}
            >
              {showSpinner({ page }) ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                page
              )}
            </Button>
          )
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-2 text-xs"
          onClick={() => {
            if (controlsLocked || !pagination.hasNextPage) return
            onNext()
          }}
          disabled={!pagination.hasNextPage || controlsLocked}
        >
          {nextLabel}
          {showSpinner('next') ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
        </Button>
      </div>
    </div>
  )
}
