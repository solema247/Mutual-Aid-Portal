'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface CompactStatCardProps {
  title: string
  value: string | number
  /** Optional: e.g. "↑ 13.5%" in a green pill */
  changeLabel?: React.ReactNode
  /** Optional: small text below, e.g. "Compared to last week" */
  subtitle?: React.ReactNode
  icon?: React.ReactNode
  /** Optional: simple bar heights for sparkline (0–1 normalized). If not provided, a default sparkline is shown. */
  sparklineData?: number[]
  className?: string
}

function SparklineBars({ data }: { data: number[] }) {
  const values = data.length > 0 ? data : [0.3, 0.5, 0.4, 0.7, 0.5, 0.8, 0.6, 0.4, 0.7, 0.5]
  const max = Math.max(...values, 0.01)
  return (
    <div className="flex items-end gap-0.5 h-8" aria-hidden>
      {values.map((v, i) => (
        <div
          key={i}
          className="w-1 rounded-sm bg-emerald-500 min-h-[2px]"
          style={{ height: `${Math.max(2, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  )
}

export function CompactStatCard({
  title,
  value,
  changeLabel,
  subtitle,
  icon,
  sparklineData,
  className,
}: CompactStatCardProps) {
  return (
    <div
      className={cn(
        'flex flex-col rounded-xl bg-gray-900 p-4 text-white shadow-md',
        className
      )}
    >
      <div className="flex items-center gap-2">
        {icon && <span className="text-white/90">{icon}</span>}
        <span className="text-sm font-medium text-white/90">{title}</span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div>
          <span className="text-2xl font-bold tabular-nums">{value}</span>
          {changeLabel != null && (
            <span className="ml-2 inline-flex items-center rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white">
              {changeLabel}
            </span>
          )}
          {subtitle != null && (
            <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>
          )}
        </div>
        <SparklineBars data={sparklineData ?? []} />
      </div>
    </div>
  )
}
