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
  fill,
  onFillStart,
  className,
}: {
  children: React.ReactNode
  fillKey: F4ExpenseFillKey
  rowIndex: number
  fill: FillState
  onFillStart: (key: F4ExpenseFillKey, row: number, e: React.PointerEvent) => void
  className?: string
}) {
  const inRange =
    fill &&
    fill.key === fillKey &&
    rowIndex >= Math.min(fill.fromRow, fill.hoverRow) &&
    rowIndex <= Math.max(fill.fromRow, fill.hoverRow)

  return (
    <div
      className={cn(
        'group/fill relative min-h-8',
        inRange && 'rounded-sm bg-primary/10 ring-1 ring-primary/30',
        className
      )}
      data-fill-row={rowIndex}
      data-fill-key={fillKey}
      onPointerEnter={() => {
        /* hover row updated via document listener */
      }}
    >
      {children}
      <FillHandle
        active={fill?.key === fillKey && fill.fromRow === rowIndex}
        onPointerDown={(e) => onFillStart(fillKey, rowIndex, e)}
      />
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

  const patchRow = useCallback(
    (idx: number, patch: Partial<F4ExpenseRow>) => {
      const arr = [...expensesRef.current]
      arr[idx] = { ...arr[idx], ...patch }
      onChangeRef.current(arr)
    },
    []
  )

  const onFillStart = useCallback((key: F4ExpenseFillKey, row: number, e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    setFill({ key, fromRow: row, hoverRow: row })
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

  return (
    <div className="border rounded overflow-x-auto select-text">
      {expenses.length === 0 ? (
        <div className="p-3 text-sm text-muted-foreground">
          {emptyLabel || (t('f4.preview.expenses.empty') as string)}
        </div>
      ) : (
        <Table className="select-text">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[14%] py-1 px-2 text-xs">{t('f4.preview.expenses.cols.activity')}</TableHead>
              <TableHead className="w-[18%] py-1 px-2 text-xs">{t('f4.preview.expenses.cols.description')}</TableHead>
              <TableHead className="w-[10%] py-1 px-2 text-right text-xs">Amount (SDG)</TableHead>
              <TableHead className="w-[10%] py-1 px-2 text-right text-xs">Amount (USD)</TableHead>
              <TableHead className="w-[12%] py-1 px-2 text-xs">{t('f4.preview.expenses.cols.payment_date')}</TableHead>
              <TableHead className="w-[10%] py-1 px-2 text-xs">{t('f4.preview.expenses.cols.method')}</TableHead>
              <TableHead className="w-[10%] py-1 px-2 text-xs">{t('f4.preview.expenses.cols.receipt_no')}</TableHead>
              <TableHead className="w-[12%] py-1 px-2 text-xs">{t('f4.preview.expenses.cols.seller')}</TableHead>
              {editable ? (
                <TableHead className="w-[8%] py-1 px-2 text-xs text-right">
                  {t('f4.preview.expenses.cols.actions')}
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.map((ex, idx) => (
              <TableRow key={(ex.expense_id as string) || idx} className="text-sm">
                <TableCell className="py-1 px-2 align-top">
                  {editable ? (
                    <FillableWrap fillKey="expense_activity" rowIndex={idx} fill={fill} onFillStart={onFillStart}>
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
                    <FillableWrap fillKey="expense_amount_sdg" rowIndex={idx} fill={fill} onFillStart={onFillStart}>
                      <F4FormattedAmountInput
                        value={ex.expense_amount_sdg}
                        placeholder="SDG"
                        onChange={(enteredValue) => {
                          const sdg = enteredValue
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
                    <FillableWrap fillKey="expense_amount" rowIndex={idx} fill={fill} onFillStart={onFillStart}>
                      <F4FormattedAmountInput
                        value={ex.expense_amount}
                        placeholder="USD"
                        onChange={(enteredValue) => {
                          const usd = enteredValue
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
                    <FillableWrap fillKey="payment_date" rowIndex={idx} fill={fill} onFillStart={onFillStart}>
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
                    <FillableWrap fillKey="payment_method" rowIndex={idx} fill={fill} onFillStart={onFillStart}>
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
                    <FillableWrap fillKey="receipt_no" rowIndex={idx} fill={fill} onFillStart={onFillStart}>
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
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        const arr = [...expenses]
                        arr.splice(idx, 1)
                        onChange(arr)
                      }}
                    >
                      {t('f4.preview.expenses.cols.delete')}
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
