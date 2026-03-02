'use client'

import * as React from 'react'
import { Info, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface DonutSegment {
  label: string
  value: number
  color: string
}

interface StatsDonutCardProps {
  title: string
  /** Main percentage or value shown large (e.g. 78.19) */
  mainValue: string
  /** Optional suffix e.g. '%' */
  mainSuffix?: string
  /** Secondary line below main (e.g. "Jan, 2022") */
  secondary?: React.ReactNode
  /** Optional third line (e.g. "Remaining 3,992") */
  tertiary?: React.ReactNode
  /** For multi-segment donut: segments in order (F4/F5 statuses). For single: pass one segment for filled, rest is gray. */
  segments: DonutSegment[]
  /** If true, donut shows one segment (segments[0]) as filled and the rest as gray (for Tracker). */
  singleSegmentMode?: boolean
  className?: string
  /** Optional icon in header (e.g. BarChart3) */
  icon?: React.ReactNode
}

const DEFAULT_EMPTY_COLOR = '#e5e7eb'

function DonutSvg({
  segments,
  singleSegmentMode,
  size = 120,
  strokeWidth = 14,
}: {
  segments: DonutSegment[]
  singleSegmentMode?: boolean
  size?: number
  strokeWidth?: number
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  const r = (size - strokeWidth) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r

  if (total === 0) {
    return (
      <svg width={size} height={size} className="shrink-0">
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={DEFAULT_EMPTY_COLOR}
          strokeWidth={strokeWidth}
        />
      </svg>
    )
  }

  if (singleSegmentMode && segments.length > 0) {
    const pct = total > 0 ? (segments[0].value / total) * 100 : 0
    const filled = (pct / 100) * circumference
    const gap = circumference - filled
    const color = segments[0].color
    return (
      <svg width={size} height={size} className="shrink-0">
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={DEFAULT_EMPTY_COLOR}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${filled} ${gap}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </svg>
    )
  }

  let offset = 0
  const segmentArcs = segments.map((seg) => {
    const pct = total > 0 ? seg.value / total : 0
    const length = pct * circumference
    const result = { ...seg, length, offset }
    offset += length
    return result
  })

  return (
    <svg width={size} height={size} className="shrink-0">
      {segmentArcs.map((seg, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={seg.color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${seg.length} ${circumference - seg.length}`}
          strokeDashoffset={-seg.offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      ))}
    </svg>
  )
}

export function StatsDonutCard({
  title,
  mainValue,
  mainSuffix = '%',
  secondary,
  tertiary,
  segments,
  singleSegmentMode = false,
  className,
  icon,
}: StatsDonutCardProps) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col rounded-xl border-0 bg-white p-5 shadow-md overflow-hidden',
        className
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {icon && <span className="shrink-0 text-primary">{icon}</span>}
          <span className="min-w-0 truncate font-semibold text-foreground">{title}</span>
          <button
            type="button"
            className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="More info"
          >
            <Info className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Options"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 flex min-w-0 flex-1 flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-2xl font-bold tabular-nums text-foreground">
            {mainValue}
            {mainSuffix}
          </div>
          {secondary != null && (
            <div className="mt-0.5 text-sm text-muted-foreground">{secondary}</div>
          )}
          {tertiary != null && (
            <div className="mt-0.5 text-sm text-muted-foreground">{tertiary}</div>
          )}
        </div>
        <DonutSvg
          segments={segments}
          singleSegmentMode={singleSegmentMode}
          size={100}
          strokeWidth={12}
        />
      </div>

      {!singleSegmentMode && segments.length > 0 && (
        <div className="mt-3 flex min-w-0 flex-wrap gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          {segments.map((seg, i) => {
            const total = segments.reduce((s, x) => s + x.value, 0)
            const pct = total > 0 ? ((seg.value / total) * 100).toFixed(1) : '0'
            return (
              <span key={i} className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: seg.color }}
                />
                {seg.label}: {pct}%
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
