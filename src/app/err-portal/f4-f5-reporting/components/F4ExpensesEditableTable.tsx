'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { F4SectorRow } from '@/lib/f4ExpenseSectors'
import {
  applyExpenseFill,
  formatAmountDisplay,
  type F4ExpenseFillKey,
} from '@/lib/f4ExpenseUi'
import { F4ExpandableTextInput, F4FormattedAmountInput } from './F4ExpenseCellEditors'
import { F4ExpenseSectorSelect, F4SectorPill } from './F4ExpenseSectorSelect'
import { F4PaymentMethodPill, F4PaymentMethodSelect } from './F4PaymentMethodSelect'

export type F4ExpenseRow = {
  expense_id?: string | number
  expense_activity?: string | null
  expense_description?: string | null
  expense_amount_sdg?: number | null
  expense_amount?: number | null
  payment_date?: string | null
  payment_method?: string | null
  receipt_no?: string | null
  seller?: string | null
  is_draft?: boolean
  [key: string]: unknown
}

type FillState = { key: F4ExpenseFillKey; fromRow: number; hoverRow: number } | null

const STICKY_FIRST_COL =
  'sticky left-0 z-20 bg-background shadow-[2px_0_5px_-2px_rgba(0,0,0,0.12)]'

/**
 * Detect fine pointer + hover (mouse/trackpad), independent of viewport width.
 * Narrow split-screen panels on a laptop still report fine pointer.
 */
function useFinePointerInput (): boolean {
  const [finePointer, setFinePointer] = useState(true)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    const sync = () => setFinePointer(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  return finePointer
}

function FillHandle ({
  active,
  onPointerDown,
}: {
  active?: boolean
  onPointerDown: (e: React.PointerEvent) => void
}) {
  return (
    <span
      role="presentation"
      onPointerDown={onPointerDown}
      className={cn(
        'absolute bottom-0 right-0 z-10 h-2.5 w-2.5 translate-x-1/4 translate-y-1/4 cursor-crosshair rounded-[1px] border border-background bg-primary',
        'opacity-0 group-hover/fill:opacity-100',
        active && 'opacity-100 ring-2 ring-primary/40'
      )}
      title="Drag to fill"
    />
  )
}

function FillableWrap ({
  children,
  fillKey,
  rowIndex,
  rowCount,
  fill,
  onFillStart,
  onFillDown,
  fillDownLabel,
  showPointerFill,
  showTouchFillDown,
  className,
}: {
  children: React.ReactNode
  fillKey: F4ExpenseFillKey
  rowIndex: number
  rowCount: number
  fill: FillState
  onFillStart: (key: F4ExpenseFillKey, row: number, e: React.PointerEvent) => void
  onFillDown: (key: F4ExpenseFillKey, fromRow: number) => void
  fillDownLabel: string
  showPointerFill: boolean
  showTouchFillDown: boolean
  className?: string
}) {
  const inRange =
    fill &&
    fill.key === fillKey &&
    rowIndex >= Math.min(fill.fromRow, fill.hoverRow) &&
    rowIndex <= Math.max(fill.fromRow, fill.hoverRow)
  const canFillDown = showTouchFillDown && rowIndex < rowCount - 1

  return (
    <div
      className={cn(
        'relative min-h-8',
        showPointerFill && 'group/fill',
        inRange && 'rounded-sm bg-primary/10 ring-1 ring-primary/30',
        className
      )}
      data-fill-row={rowIndex}
      data-fill-key={fillKey}
    >
      {children}
      {showPointerFill ? (
        <FillHandle
          active={fill?.key === fillKey && fill.fromRow === rowIndex}
          onPointerDown={(e) => onFillStart(fillKey, rowIndex, e)}
        />
      ) : null}
      {canFillDown ? (
        <button
          type="button"
          className={cn(
            'mt-1 w-full rounded border border-dashed border-muted-foreground/40 px-1 py-0.5',
            'text-[10px] font-medium text-muted-foreground active:bg-muted'
          )}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onFillDown(fillKey, rowIndex)
          }}
        >
          {fillDownLabel}
        </button>
      ) : null}
    </div>
  )
}

interface F4ExpensesEditableTableProps {
  expenses: F4ExpenseRow[]
  onChange: (next: F4ExpenseRow[]) => void
  sectors: F4SectorRow[]
  fxRate: number | null
  editable?: boolean
  emptyLabel?: string
}

export function F4ExpensesEditableTable ({
  expenses,
  onChange,
  sectors,
  fxRate,
  editable = true,
  emptyLabel,
}: F4ExpensesEditableTableProps) {
  const { t, i18n } = useTranslation(['f4f5'])
  const locale = i18n.language || 'en'
  const fillDownLabel = t('f4.preview.expenses.fill_down', { defaultValue: 'Fill Down' }) as string
  const finePointer = useFinePointerInput()
  const [fill, setFill] = useState<FillState>(null)
  const fillRef = useRef<FillState>(null)
  const expensesRef = useRef(expenses)
  const fxRef = useRef(fxRate)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    fillRef.current = fill
  }, [fill])
  useEffect(() => {
    expensesRef.current = expenses
  }, [expenses])
  useEffect(() => {
    fxRef.current = fxRate
  }, [fxRate])
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const patchRow = useCallback((idx: number, patch: Partial<F4ExpenseRow>) => {
    const arr = [...expensesRef.current]
    arr[idx] = { ...arr[idx], ...patch }
    onChangeRef.current(arr)
  }, [])

  const removeRow = useCallback((idx: number) => {
    const arr = [...expensesRef.current]
    arr.splice(idx, 1)
    onChangeRef.current(arr)
  }, [])

  const onFillStart = useCallback((key: F4ExpenseFillKey, row: number, e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    setFill({ key, fromRow: row, hoverRow: row })
  }, [])

  /** Touch Fill Down: reuse applyExpenseFill from this row through the last row. */
  const onFillDown = useCallback((key: F4ExpenseFillKey, fromRow: number) => {
    const rows = expensesRef.current
    const toRow = rows.length - 1
    if (toRow <= fromRow) return
    onChangeRef.current(
      applyExpenseFill(rows, key, fromRow, toRow, fxRef.current) as F4ExpenseRow[]
    )
  }, [])

  useEffect(() => {
    if (!fill) return

    const onMove = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
      const cell = el?.closest?.('[data-fill-row][data-fill-key]') as HTMLElement | null
      if (!cell) return
      const key = cell.getAttribute('data-fill-key') as F4ExpenseFillKey | null
      const row = Number(cell.getAttribute('data-fill-row'))
      const cur = fillRef.current
      if (!cur || !key || key !== cur.key || !Number.isFinite(row)) return
      if (row !== cur.hoverRow) {
        setFill({ ...cur, hoverRow: row })
      }
    }

    const onUp = () => {
      const cur = fillRef.current
      setFill(null)
      if (!cur) return
      if (cur.fromRow === cur.hoverRow) return
      onChangeRef.current(
        applyExpenseFill(expensesRef.current, cur.key, cur.fromRow, cur.hoverRow, fxRef.current) as F4ExpenseRow[]
      )
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [fill])

  if (expenses.length === 0) {
    return (
      <div className="border rounded p-3 text-sm text-muted-foreground select-text">
        {emptyLabel || (t('f4.preview.expenses.empty') as string)}
      </div>
    )
  }

  const rowCount = expenses.length

  const fillWrapProps = (fillKey: F4ExpenseFillKey, rowIndex: number) => ({
    fillKey,
    rowIndex,
    rowCount,
    fill,
    onFillStart,
    onFillDown,
    fillDownLabel,
    showPointerFill: finePointer,
    showTouchFillDown: !finePointer,
  })

  return (
    <div className="w-full max-w-full min-w-0 border rounded overflow-x-auto select-text overscroll-x-contain">
      <Table className="select-text min-w-[1100px] w-max">
        <TableHeader>
          <TableRow>
            <TableHead
              className={cn(
                'min-w-[140px] py-1 px-2 text-xs',
                STICKY_FIRST_COL,
                'z-30 bg-muted/95'
              )}
            >
              {t('f4.preview.expenses.cols.activity')}
            </TableHead>
            <TableHead className="min-w-[180px] py-1 px-2 text-xs">
              {t('f4.preview.expenses.cols.description')}
            </TableHead>
            <TableHead className="min-w-[110px] py-1 px-2 text-right text-xs">Amount (SDG)</TableHead>
            <TableHead className="min-w-[110px] py-1 px-2 text-right text-xs">Amount (USD)</TableHead>
            <TableHead className="min-w-[130px] py-1 px-2 text-xs">
              {t('f4.preview.expenses.cols.payment_date')}
            </TableHead>
            <TableHead className="min-w-[120px] py-1 px-2 text-xs">
              {t('f4.preview.expenses.cols.method')}
            </TableHead>
            <TableHead className="min-w-[110px] py-1 px-2 text-xs">
              {t('f4.preview.expenses.cols.receipt_no')}
            </TableHead>
            <TableHead className="min-w-[140px] py-1 px-2 text-xs">
              {t('f4.preview.expenses.cols.seller')}
            </TableHead>
            {editable ? (
              <TableHead className="min-w-[80px] py-1 px-2 text-xs text-right">
                {t('f4.preview.expenses.cols.actions')}
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {expenses.map((ex, idx) => (
            <TableRow key={(ex.expense_id as string) || idx} className="text-sm">
              <TableCell className={cn('py-1 px-2 align-top', STICKY_FIRST_COL)}>
                {editable ? (
                  <FillableWrap {...fillWrapProps('expense_activity', idx)}>
                    <F4ExpenseSectorSelect
                      sectors={sectors}
                      valueEn={ex.expense_activity || ''}
                      onChangeEn={(sectorNameEn) => patchRow(idx, { expense_activity: sectorNameEn })}
                      placeholder={t('f4.preview.expenses.sector_placeholder') as string}
                      className="h-8 w-full"
                    />
                  </FillableWrap>
                ) : (
                  <F4SectorPill valueEn={ex.expense_activity} sectors={sectors} />
                )}
              </TableCell>

              <TableCell className="py-1 px-2 align-top">
                {editable ? (
                  <F4ExpandableTextInput
                    value={ex.expense_description || ''}
                    onChange={(v) => patchRow(idx, { expense_description: v })}
                    placeholder={t('f4.preview.expenses.cols.description') as string}
                  />
                ) : (
                  <span className="block max-w-[14rem] whitespace-pre-wrap break-words text-sm">
                    {ex.expense_description || '-'}
                  </span>
                )}
              </TableCell>

              <TableCell className="py-1 px-2 text-right align-top">
                {editable ? (
                  <FillableWrap {...fillWrapProps('expense_amount_sdg', idx)}>
                    <F4FormattedAmountInput
                      value={ex.expense_amount_sdg}
                      placeholder="SDG"
                      onChange={(sdg) => {
                        patchRow(idx, {
                          expense_amount_sdg: sdg,
                          expense_amount:
                            fxRate && fxRate > 0 && sdg != null && sdg > 0
                              ? +(sdg / fxRate).toFixed(2)
                              : ex.expense_amount,
                        })
                      }}
                    />
                  </FillableWrap>
                ) : (
                  formatAmountDisplay(ex.expense_amount_sdg, locale) || '-'
                )}
              </TableCell>

              <TableCell className="py-1 px-2 text-right align-top">
                {editable ? (
                  <FillableWrap {...fillWrapProps('expense_amount', idx)}>
                    <F4FormattedAmountInput
                      value={ex.expense_amount}
                      placeholder="USD"
                      onChange={(usd) => {
                        patchRow(idx, {
                          expense_amount: usd,
                          expense_amount_sdg:
                            fxRate && fxRate > 0 && usd != null && usd > 0
                              ? +(usd * fxRate).toFixed(2)
                              : ex.expense_amount_sdg,
                        })
                      }}
                    />
                  </FillableWrap>
                ) : (
                  formatAmountDisplay(ex.expense_amount, locale) || '-'
                )}
              </TableCell>

              <TableCell className="py-1 px-2 align-top">
                {editable ? (
                  <FillableWrap {...fillWrapProps('payment_date', idx)}>
                    <Input
                      className="h-8"
                      type="date"
                      value={ex.payment_date || ''}
                      onChange={(e) => patchRow(idx, { payment_date: e.target.value })}
                    />
                  </FillableWrap>
                ) : (
                  ex.payment_date ? new Date(ex.payment_date).toLocaleDateString() : '-'
                )}
              </TableCell>

              <TableCell className="py-1 px-2 align-top">
                {editable ? (
                  <FillableWrap {...fillWrapProps('payment_method', idx)}>
                    <F4PaymentMethodSelect
                      value={ex.payment_method || 'Bank Transfer'}
                      onChange={(v) => patchRow(idx, { payment_method: v })}
                      placeholder={t('f4.preview.expenses.cols.method') as string}
                    />
                  </FillableWrap>
                ) : (
                  <F4PaymentMethodPill value={ex.payment_method} />
                )}
              </TableCell>

              <TableCell className="py-1 px-2 align-top">
                {editable ? (
                  <FillableWrap {...fillWrapProps('receipt_no', idx)}>
                    <Input
                      className="h-8"
                      placeholder={t('f4.preview.expenses.cols.receipt_no') as string}
                      value={ex.receipt_no || ''}
                      onChange={(e) => patchRow(idx, { receipt_no: e.target.value })}
                    />
                  </FillableWrap>
                ) : (
                  ex.receipt_no || '-'
                )}
              </TableCell>

              <TableCell className="py-1 px-2 align-top">
                {editable ? (
                  <F4ExpandableTextInput
                    value={ex.seller || ''}
                    onChange={(v) => patchRow(idx, { seller: v })}
                    placeholder={t('f4.preview.expenses.cols.seller') as string}
                  />
                ) : (
                  <span className="block max-w-[10rem] whitespace-pre-wrap break-words text-sm">
                    {ex.seller || '-'}
                  </span>
                )}
              </TableCell>

              {editable ? (
                <TableCell className="py-1 px-2 text-right align-top">
                  <Button variant="destructive" size="sm" onClick={() => removeRow(idx)}>
                    {t('f4.preview.expenses.cols.delete')}
                  </Button>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
