'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'
import '@/i18n/config'

// Fallback URL from docs/SURVEYS.md; override with NEXT_PUBLIC_SURVEY_LOHUB_URL if set
const LOHUB_SURVEY_URL =
  process.env.NEXT_PUBLIC_SURVEY_LOHUB_URL ||
  'https://docs.google.com/forms/d/e/1FAIpQLSeQ_ko7-NVnkILrKsB7Uc91R_OLdwt9jGRtWQvZMAOSvjPjKg/viewform?usp=header'
const ERR_VOLUNTEER_SURVEY_URL = process.env.NEXT_PUBLIC_SURVEY_ERR_VOLUNTEER_URL || ''

export default function SurveysPage() {
  const { t } = useTranslation(['err', 'common'])
  const router = useRouter()
  const { can, isLoading } = useAllowedFunctions()
  const canViewPage = can('surveys_view_page')

  useEffect(() => {
    if (!isLoading && !canViewPage) {
      router.replace('/err-portal')
    }
  }, [canViewPage, isLoading, router])

  if (isLoading) return <div className="p-6">Loading...</div>
  if (!canViewPage) return null

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="space-y-6">
        <Link href="/err-portal" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground -ml-2">
          <ArrowLeft className="h-4 w-4" />
          {t('common:back_to_home')}
        </Link>
        <h1 className="text-3xl font-bold">
          {t('err:surveys', 'Surveys')}
        </h1>
        <p className="text-muted-foreground">
          {t('err:surveys_description', 'User feedback surveys for the evaluation (Feb–March 2026). Please complete the survey relevant to your role.')}
        </p>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('err:surveys_lohub_title', 'Localization Hub feedback')}</CardTitle>
              <CardDescription>
                {t('err:surveys_lohub_desc', 'For Localization Hub staff – time for analysis, data and tools, tracking, digital literacy (target 4/5).')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {LOHUB_SURVEY_URL ? (
                <a
                  href={LOHUB_SURVEY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white shadow-sm h-9 px-4 py-2"
                >
                  {t('err:surveys_open_form', 'Open survey')}
                </a>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t('err:surveys_link_placeholder', 'Survey link will be added here. Set NEXT_PUBLIC_SURVEY_LOHUB_URL or see docs/SURVEYS.md.')}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
