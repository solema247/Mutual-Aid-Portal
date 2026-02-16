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

type SankeyData = { nodes: { name: string; color?: string }[]; links: { source: number; target: number; value: number }[] }

const PASTEL_COLORS = [
  '#b8d4e3', '#e3c9b8', '#c9e3b8', '#e3b8d4', '#d4b8e3',
  '#b8e3d4', '#e3d4b8', '#d4e3b8', '#b8c9e3', '#e3b8c9',
]

/** Minimum link value used for layout so small flows (e.g. under 250k) stay visible */
const MIN_LINK_VALUE = 250_000

type NodeTooltipData = { name: string; value?: number; actualValue?: number; x: number; y: number } | null

/** Custom Sankey node: rect (pastel color) + label inside + hover tooltip + click to focus */
function SankeyNodeWithLabel(props: {
  x: number
  y: number
  width: number
  height: number
  payload: { name: string; color?: string; depth?: number; value?: number; actualValue?: number; index?: number }
  fill?: string
  stroke?: string
  selectedNodeIndex?: number | null
  onHover?: (data: NodeTooltipData, e?: React.MouseEvent) => void
  onSelect?: (index: number | null) => void
  [key: string]: unknown
}) {
  const { x, y, width, height, payload, fill, stroke, selectedNodeIndex, onHover, onSelect } = props
  const nodeColor = payload.color ?? fill ?? 'var(--chart-1)'
  const actualValue = (payload as { actualValue?: number }).actualValue
  const nodeIndex = (payload as { index?: number }).index ?? -1
  const isSelected = selectedNodeIndex != null && selectedNodeIndex === nodeIndex
  const isDimmed = selectedNodeIndex != null && !isSelected
  const isRightColumn = payload.depth === 2
  const textX = isRightColumn ? x - 4 : x + width / 2
  const textAnchor = isRightColumn ? 'end' : 'middle'
  return (
    <g
      onMouseEnter={(e) => onHover?.({ name: payload.name, actualValue, x: e.clientX, y: e.clientY }, e)}
      onMouseLeave={() => onHover?.(null)}
      onClick={(e) => {
        e.stopPropagation()
        onSelect?.(isSelected ? null : nodeIndex >= 0 ? nodeIndex : null)
      }}
      style={{ cursor: 'pointer', opacity: isDimmed ? 0.3 : 1 }}
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={nodeColor}
        stroke={stroke ?? 'var(--border)'}
        strokeWidth={isSelected ? 2 : 1}
      />
      <text
        x={textX}
        y={y + height / 2}
        textAnchor={textAnchor}
        dominantBaseline="middle"
        fill="rgba(0,0,0,0.8)"
        fontSize={12}
      >
        {payload.name}
      </text>
    </g>
  )
}

/** Custom Sankey link: gradient from source node color to target node color; dim when not connected to selected node */
function SankeyLinkGradient(props: {
  sourceX: number
  targetX: number
  sourceY: number
  targetY: number
  sourceControlX: number
  targetControlX: number
  linkWidth: number
  index: number
  payload: { source: { color?: string; index?: number }; target: { color?: string; index?: number }; value?: number }
  selectedNodeIndex?: number | null
  [key: string]: unknown
}) {
  const {
    sourceX,
    targetX,
    sourceY,
    targetY,
    sourceControlX,
    targetControlX,
    linkWidth,
    index,
    payload,
    selectedNodeIndex,
  } = props
  const sourceIndex = (payload.source as { index?: number })?.index ?? -1
  const targetIndex = (payload.target as { index?: number })?.index ?? -1
  const isConnectedToSelected =
    selectedNodeIndex == null ||
    selectedNodeIndex === sourceIndex ||
    selectedNodeIndex === targetIndex
  const sourceColor = (payload.source as { color?: string })?.color ?? '#b8d4e3'
  const targetColor = (payload.target as { color?: string })?.color ?? '#e3c9b8'
  const gradientId = `sankey-link-${index}`
  const h = linkWidth / 2
  const pathD = `M ${sourceX},${sourceY - h} C ${sourceControlX},${sourceY - h} ${targetControlX},${targetY - h} ${targetX},${targetY - h} L ${targetX},${targetY + h} C ${targetControlX},${targetY + h} ${sourceControlX},${sourceY + h} ${sourceX},${sourceY + h} Z`
  return (
    <g style={{ opacity: isConnectedToSelected ? 0.9 : 0.2 }}>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={sourceColor} />
          <stop offset="100%" stopColor={targetColor} />
        </linearGradient>
      </defs>
      <path
        d={pathD}
        fill={`url(#${gradientId})`}
        stroke="none"
      />
    </g>
  )
}

export function ForecastSankeyChart() {
  const { t } = useTranslation(['forecast', 'common'])
  const [data, setData] = useState<SankeyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nodeTooltip, setNodeTooltip] = useState<NodeTooltipData>(null)
  const [selectedNodeIndex, setSelectedNodeIndex] = useState<number | null>(null)

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
          const n = body.nodes.length
          const outSum = new Array<number>(n).fill(0)
          const inSum = new Array<number>(n).fill(0)
          for (const l of body.links) {
            outSum[l.source] += l.value
            inSum[l.target] += l.value
          }
          const actualTotalByNode = outSum.map((out, i) => (out > 0 ? out : inSum[i]))
          const nodesWithColors = body.nodes.map((node, i) => ({
            ...node,
            index: i,
            color: PASTEL_COLORS[i % PASTEL_COLORS.length],
            actualValue: actualTotalByNode[i],
          }))
          const linksWithMin = body.links.map((l) => ({
            ...l,
            value: Math.max(l.value, MIN_LINK_VALUE),
          }))
          setData({ ...body, nodes: nodesWithColors, links: linksWithMin })
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
          <CardTitle>{t('forecast:charts.sankey_title', 'Org type to transfer method to state')}</CardTitle>
          <CardDescription>
          {t('forecast:charts.sankey_desc', 'Flow from org type → transfer method → state by amount')}
          {' · '}
          <span className="text-muted-foreground">
            {t('forecast:charts.sankey_click_hint', 'Click a node to focus; click again or Escape to clear.')}
          </span>
        </CardDescription>
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
          <CardTitle>{t('forecast:charts.sankey_title', 'Org type to transfer method to state')}</CardTitle>
          <CardDescription>
          {t('forecast:charts.sankey_desc', 'Flow from org type → transfer method → state by amount')}
          {' · '}
          <span className="text-muted-foreground">
            {t('forecast:charts.sankey_click_hint', 'Click a node to focus; click again or Escape to clear.')}
          </span>
        </CardDescription>
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
          <CardTitle>{t('forecast:charts.sankey_title', 'Org type to transfer method to state')}</CardTitle>
          <CardDescription>
          {t('forecast:charts.sankey_desc', 'Flow from org type → transfer method → state by amount')}
          {' · '}
          <span className="text-muted-foreground">
            {t('forecast:charts.sankey_click_hint', 'Click a node to focus; click again or Escape to clear.')}
          </span>
        </CardDescription>
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
        <CardTitle>{t('forecast:charts.sankey_title', 'Org type to transfer method to state')}</CardTitle>
        <CardDescription>
          {t('forecast:charts.sankey_desc', 'Flow from org type → transfer method → state by amount')}
          {' · '}
          <span className="text-muted-foreground">
            {t('forecast:charts.sankey_click_hint', 'Click a node to focus; click again or Escape to clear.')}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="relative">
        <div
          className="w-full h-[400px] cursor-default"
          tabIndex={0}
          onClick={() => setSelectedNodeIndex(null)}
          onKeyDown={(e) => e.key === 'Escape' && setSelectedNodeIndex(null)}
        >
          <ResponsiveContainer width="100%" height="100%">
            <Sankey
              data={data}
              node={(props) => (
                <SankeyNodeWithLabel
                  {...props}
                  stroke="var(--border)"
                  selectedNodeIndex={selectedNodeIndex}
                  onHover={setNodeTooltip}
                  onSelect={setSelectedNodeIndex}
                />
              )}
              link={(props) => (
                <SankeyLinkGradient {...props} selectedNodeIndex={selectedNodeIndex} />
              )}
              nodePadding={16}
              nodeWidth={12}
              margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
            />
          </ResponsiveContainer>
        </div>
        {nodeTooltip && (
          <div
            className="pointer-events-none fixed z-50 rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md"
            style={{
              left: nodeTooltip.x + 12,
              top: nodeTooltip.y,
              transform: 'translateY(-50%)',
            }}
          >
            <div className="font-medium">{nodeTooltip.name}</div>
            {(nodeTooltip.actualValue != null || nodeTooltip.value != null) && (
              <div className="text-muted-foreground mt-0.5">
                {new Intl.NumberFormat(undefined, {
                  maximumFractionDigits: 0,
                  minimumFractionDigits: 0,
                }).format(nodeTooltip.actualValue ?? nodeTooltip.value ?? 0)}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
