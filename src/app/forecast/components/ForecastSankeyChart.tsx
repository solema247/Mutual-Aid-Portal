'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ResponsiveContainer, Sankey } from 'recharts'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type SankeyData = { nodes: { name: string }[]; links: { source: number; target: number; value: number }[] }

export function ForecastSankeyChart() {
  const { t } = useTranslation(['forecast', 'common'])
  const [data, setData] = useState<SankeyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch('/api/forecast/sankey')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load sankey data')
        return res.json()
      })
      .then((body: SankeyData) => {
        if (cancelled) return
        if (body?.nodes && Array.isArray(body.nodes) && body?.links && Array.isArray(body.links)) {
          setData(body)
        } else {
          setData({ nodes: [], links: [] })
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('forecast:charts.sankey_title', 'Transfer method to state')}</CardTitle>
          <CardDescription>{t('forecast:charts.sankey_desc', 'Flow from transfer method (origin) to state (destination) by amount')}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center min-h-[320px]">
          <p className="text-sm text-muted-foreground">{t('common:loading')}</p>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('forecast:charts.sankey_title', 'Transfer method to state')}</CardTitle>
          <CardDescription>{t('forecast:charts.sankey_desc', 'Flow from transfer method (origin) to state (destination) by amount')}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center min-h-[320px]">
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    )
  }

  if (!data || data.links.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('forecast:charts.sankey_title', 'Transfer method to state')}</CardTitle>
          <CardDescription>{t('forecast:charts.sankey_desc', 'Flow from transfer method (origin) to state (destination) by amount')}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center min-h-[320px]">
          <p className="text-sm text-muted-foreground">{t('forecast:charts.no_data', 'No forecast data yet')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('forecast:charts.sankey_title', 'Transfer method to state')}</CardTitle>
        <CardDescription>{t('forecast:charts.sankey_desc', 'Flow from transfer method (origin) to state (destination) by amount')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="w-full h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <Sankey
              data={data}
              node={{ fill: 'var(--chart-1)', stroke: 'var(--border)' }}
              link={{ stroke: 'var(--chart-2)', fillOpacity: 0.6 }}
              nodePadding={16}
              nodeWidth={12}
              margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
            />
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
