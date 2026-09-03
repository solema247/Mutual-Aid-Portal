'use client'

import { ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const GITHUB_PROJECT_BOARD_URL =
  process.env.NEXT_PUBLIC_GITHUB_PROJECT_BOARD_URL ||
  'https://github.com/users/solema247/projects/6/views/7'

export function GithubProjectBoardCard () {
  const { t } = useTranslation(['err'])

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">
          {t('err:raise_ticket_board_title', 'Project board')}
        </CardTitle>
        <CardDescription>
          {t(
            'err:raise_ticket_board_desc',
            'Track status and progress for portal work directly in GitHub.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <a
          href={GITHUB_PROJECT_BOARD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white shadow-sm h-9 px-4 py-2"
        >
          {t('err:raise_ticket_board_cta', 'Open GitHub project board')}
          <ExternalLink className="h-4 w-4 opacity-90" aria-hidden />
        </a>
      </CardContent>
    </Card>
  )
}
