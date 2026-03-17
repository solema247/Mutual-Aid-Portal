'use client'

import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Receipt, AlertCircle } from 'lucide-react'

export interface MoUsNeedingPaymentItem<T = { id: string; mou_code: string; state: string | null }> {
  mou: T
  confirmed: number
  total: number
  missing: number
}

interface MoUsNeedingPaymentAlertProps<T = { id: string; mou_code: string; state: string | null }> {
  items: MoUsNeedingPaymentItem<T>[]
  grantIdByMouId: Record<string, string>
  onOpenPayment: (mou: T) => void
}

export default function MoUsNeedingPaymentAlert<T extends { id: string; mou_code: string; state: string | null }>({
  items,
  grantIdByMouId,
  onOpenPayment
}: MoUsNeedingPaymentAlertProps<T>) {
  const { t } = useTranslation('f3')

  if (items.length === 0) return null

  return (
    <Card className="w-full border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-amber-800 dark:text-amber-200">
          <AlertCircle className="h-5 w-5 shrink-0" />
          {t('payment_priority_title')}
        </CardTitle>
        <p className="text-sm text-amber-700 dark:text-amber-300/90">
          {t('payment_priority_description')}
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
          {t('payment_priority_count', { count: items.length })}
        </p>
        <ul className="space-y-2">
          {items.map(({ mou, confirmed, total, missing }) => (
            <li
              key={mou.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-white px-3 py-2 dark:border-amber-800/50 dark:bg-amber-950/30"
            >
              <div className="min-w-0">
                <span className="font-medium text-foreground">{mou.mou_code}</span>
                {mou.state && (
                  <span className="ml-2 text-muted-foreground">— {mou.state}</span>
                )}
                {grantIdByMouId[mou.id] && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({grantIdByMouId[mou.id]})
                  </span>
                )}
                <span className="ml-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                  {confirmed === 0
                    ? `0/${total} ${t('payment_priority_projects')}`
                    : t('payment_priority_partial', { confirmed, total, missing })}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/40"
                onClick={() => onOpenPayment(mou)}
              >
                <Receipt className="mr-1.5 h-3.5 w-3.5" />
                {confirmed === 0 ? t('add_payment') : t('view_payment_short')}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
