'use client'

import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { FileQuestion } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import '@/i18n/config'

/**
 * App Router standard 404 page.
 * Used by next/navigation `notFound()` across the app.
 */
export default function NotFound() {
  const { t } = useTranslation('common')

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4 py-10 sm:px-6">
      <Card className="w-full max-w-md rounded-lg border border-slate-100 bg-white py-0 shadow-sm dark:border-border/40 dark:bg-card">
        <CardContent className="flex flex-col items-center gap-5 px-6 py-10 text-center sm:px-8 sm:py-12">
          <div className="flex size-12 items-center justify-center rounded-lg bg-brand-bg text-brand-light-blue">
            <FileQuestion className="size-6" aria-hidden />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              404
            </p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {t('not_found_title', { defaultValue: 'Page not found' })}
            </h1>
            <p className="max-w-sm text-sm text-muted-foreground">
              {t('not_found_description', {
                defaultValue: "The page you're looking for could not be found.",
              })}
            </p>
          </div>

          <Button asChild className="mt-1">
            <Link href="/err-portal">
              {t('back_to_portal', { defaultValue: 'Back to Portal' })}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
