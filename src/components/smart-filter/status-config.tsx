/**
 * F4 / F5 status display: label, color, and icon per status.
 * Used in table dropdowns and filter chips.
 * Badge: padding 4px 12px, border-radius 12px.
 * Chart: use chartColor (saturated) for donut segments on white.
 */

import type { LucideIcon } from 'lucide-react'
import { CheckCircle, Clock, MinusCircle, Eye } from 'lucide-react'

export const STATUS_DISPLAY: Array<{
  value: string
  label: string
  icon: LucideIcon
  iconClassName: string
  textClassName: string
  /** Badge: background (hex) */
  pillBg: string
  /** Badge: text color (hex) */
  pillText: string
  /** Donut/chart segment: saturated color for visibility on white */
  chartColor: string
}> = [
  {
    value: 'completed',
    label: 'Completed',
    icon: CheckCircle,
    iconClassName: 'text-green-600',
    textClassName: 'text-green-600',
    pillBg: '#dcfce7',
    pillText: '#15803d',
    chartColor: '#15803d',
  },
  {
    value: 'waiting',
    label: 'Waiting',
    icon: Clock,
    iconClassName: 'text-orange-600',
    textClassName: 'text-orange-600',
    pillBg: '#fef3c7',
    pillText: '#b45309',
    chartColor: '#d97706',
  },
  {
    value: 'partial',
    label: 'Partial',
    icon: MinusCircle,
    iconClassName: 'text-red-600',
    textClassName: 'text-red-600',
    pillBg: '#fee2e2',
    pillText: '#b91c1c',
    chartColor: '#b91c1c',
  },
  {
    value: 'in review',
    label: 'Under review',
    icon: Eye,
    iconClassName: 'text-blue-600',
    textClassName: 'text-blue-600',
    pillBg: '#dbeafe',
    pillText: '#1d4ed8',
    chartColor: '#1d4ed8',
  },
]

export function getStatusDisplay(status: string) {
  const s = (status ?? '').trim().toLowerCase()
  return STATUS_DISPLAY.find((d) => d.value === s) ?? STATUS_DISPLAY[1]
}
