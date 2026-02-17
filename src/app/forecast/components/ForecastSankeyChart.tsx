'use client'

import { useEffect, useMemo, useState } from 'react'
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

/**
 * Minimum link value for layout. Use 0 to preserve data proportions so node heights
 * match the sum of link widths (flow conservation). A positive value inflates small
 * links and can make middle-layer nodes appear larger than the links feeding them.
 */
const MIN_LINK_VALUE = 0

type NodeTooltipData = { name: string; value?: number; actualValue?: number; levelTotal?: number; x: number; y: number } | null

/** Custom Sankey node: rect (pastel color) + label inside + hover tooltip + click to focus */
function SankeyNodeWithLabel(props: {
  x: number
  y: number
  width: number
  height: number
  payload: { name: string; color?: string; depth?: number; value?: number; actualValue?: number; levelTotal?: number; index?: number }
  fill?: string
  stroke?: string
  selectedNodeIndex?: number | null
  downstreamNodeIndices?: Set<number>
  onHover?: (data: NodeTooltipData, e?: React.MouseEvent) => void
  onSelect?: (index: number | null) => void
  [key: string]: unknown
}) {
  const { x, y, width, height, payload, fill, stroke, selectedNodeIndex, downstreamNodeIndices, onHover, onSelect } = props
  const nodeColor = payload.color ?? fill ?? 'var(--chart-1)'
  const actualValue = (payload as { actualValue?: number }).actualValue
  const levelTotal = (payload as { levelTotal?: number }).levelTotal
  const nodeIndex = (payload as { index?: number }).index ?? -1
  const isSelected = selectedNodeIndex != null && selectedNodeIndex === nodeIndex
  const isInDownstreamFlow = !downstreamNodeIndices || downstreamNodeIndices.has(nodeIndex)
  const isDimmed = selectedNodeIndex != null && !isInDownstreamFlow
  const isLeftColumn = payload.depth === 0
  const isRightColumn = payload.depth === 2
  const textX = isLeftColumn ? x + width + 4 : isRightColumn ? x - 4 : x + width / 2
  const textAnchor = isLeftColumn ? 'start' : isRightColumn ? 'end' : 'middle'
  return (
    <g
      onMouseEnter={(e) => onHover?.({ name: payload.name, actualValue, levelTotal, x: e.clientX, y: e.clientY }, e)}
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
  downstreamLinkIndices?: Set<number>
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
    downstreamLinkIndices,
  } = props
  const isInDownstreamFlow =
    selectedNodeIndex == null || !downstreamLinkIndices || downstreamLinkIndices.has(index)
  const sourceColor = (payload.source as { color?: string })?.color ?? '#b8d4e3'
  const targetColor = (payload.target as { color?: string })?.color ?? '#e3c9b8'
  const gradientId = `sankey-link-${index}`
  const h = linkWidth / 2
  const pathD = `M ${sourceX},${sourceY - h} C ${sourceControlX},${sourceY - h} ${targetControlX},${targetY - h} ${targetX},${targetY - h} L ${targetX},${targetY + h} C ${targetControlX},${targetY + h} ${sourceControlX},${sourceY + h} ${sourceX},${sourceY + h} Z`
  return (
    <g style={{ opacity: isInDownstreamFlow ? 0.9 : 0.2 }}>
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

  const { downstreamNodeIndices, downstreamLinkIndices } = useMemo(() => {
    if (!data?.links || selectedNodeIndex == null) {
      return { downstreamNodeIndices: new Set<number>(), downstreamLinkIndices: new Set<number>() }
    }
    const links = data.links
    // Downstream: from selected node, follow links source → target
    const downNodes = new Set<number>([selectedNodeIndex])
    const downLinks = new Set<number>()
    let changed = true
    while (changed) {
      changed = false
      links.forEach((link, i) => {
        if (downNodes.has(link.source) && !downNodes.has(link.target)) {
          downNodes.add(link.target)
          downLinks.add(i)
          changed = true
        }
      })
    }
    // Upstream: from selected node, follow links target → source (flows that lead into this node)
    const upNodes = new Set<number>([selectedNodeIndex])
    const upLinks = new Set<number>()
    changed = true
    while (changed) {
      changed = false
      links.forEach((link, i) => {
        if (upNodes.has(link.target) && !upNodes.has(link.source)) {
          upNodes.add(link.source)
          upLinks.add(i)
          changed = true
        }
      })
    }
    const downstreamNodeIndices = new Set<number>([...downNodes, ...upNodes])
    const downstreamLinkIndices = new Set<number>([...downLinks, ...upLinks])
    return { downstreamNodeIndices, downstreamLinkIndices }
  }, [data?.links, selectedNodeIndex])

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
          const links = body.links
          const outSum = new Array<number>(n).fill(0)
          const inSum = new Array<number>(n).fill(0)
          for (const l of links) {
            outSum[l.source] += l.value
            inSum[l.target] += l.value
          }
          const actualTotalByNode = outSum.map((out, i) => (out > 0 ? out : inSum[i]))
          const depth = new Array<number>(n)
          for (let i = 0; i < n; i++) {
            const hasIncoming = links.some((l) => l.target === i)
            const hasOutgoing = links.some((l) => l.source === i)
            depth[i] = !hasIncoming ? 0 : !hasOutgoing ? 2 : 1
          }
          const levelTotalByDepth = [0, 0, 0]
          for (let i = 0; i < n; i++) levelTotalByDepth[depth[i]] += actualTotalByNode[i]
          const nodesWithColors = body.nodes.map((node, i) => ({
            ...node,
            index: i,
            depth: depth[i],
            color: PASTEL_COLORS[i % PASTEL_COLORS.length],
            actualValue: actualTotalByNode[i],
            levelTotal: levelTotalByDepth[depth[i]],
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
          <CardTitle>{t('forecast:charts.sankey_title', 'Transfer method to state')}</CardTitle>
          <CardDescription>
            {t('forecast:charts.sankey_desc', 'Flow from transfer method (origin) to state (destination) by amount · Click a node to focus; click again or Escape to clear. Tooltip % is share of total at each node level.')}
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
          <CardTitle>{t('forecast:charts.sankey_title', 'Transfer method to state')}</CardTitle>
          <CardDescription>
            {t('forecast:charts.sankey_desc', 'Flow from transfer method (origin) to state (destination) by amount · Click a node to focus; click again or Escape to clear. Tooltip % is share of total at each node level.')}
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
          <CardTitle>{t('forecast:charts.sankey_title', 'Transfer method to state')}</CardTitle>
          <CardDescription>
            {t('forecast:charts.sankey_desc', 'Flow from transfer method (origin) to state (destination) by amount · Click a node to focus; click again or Escape to clear. Tooltip % is share of total at each node level.')}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center min-h-[320px]">
          <p className="text-sm text-muted-foreground">{t('forecast:charts.no_data', 'No forecast data yet')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="flex flex-1 flex-col min-h-0">
      <CardHeader>
        <CardTitle>{t('forecast:charts.sankey_title', 'Transfer method to state')}</CardTitle>
        <CardDescription>
          {t('forecast:charts.sankey_desc', 'Flow from transfer method (origin) to state (destination) by amount · Click a node to focus; click again or Escape to clear. Tooltip % is share of total at each node level.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="relative flex flex-1 flex-col min-h-0">
        <div
          className="w-full h-[480px] cursor-default"
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
                  downstreamNodeIndices={downstreamNodeIndices}
                  onHover={setNodeTooltip}
                  onSelect={setSelectedNodeIndex}
                />
              )}
              link={(props) => (
                <SankeyLinkGradient
                  {...props}
                  selectedNodeIndex={selectedNodeIndex}
                  downstreamLinkIndices={downstreamLinkIndices}
                />
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
                {nodeTooltip.levelTotal != null &&
                  nodeTooltip.levelTotal > 0 &&
                  nodeTooltip.actualValue != null && (
                    <span className="ml-1.5">
                      (
                      {new Intl.NumberFormat(undefined, {
                        maximumFractionDigits: 1,
                        minimumFractionDigits: 1,
                      }).format(
                        (100 * (nodeTooltip.actualValue / nodeTooltip.levelTotal))
                      )}
                      %)
                    </span>
                  )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
