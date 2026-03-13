'use client'

import { CheckCircle, Clock, AlertCircle, XCircle, HelpCircle } from 'lucide-react'
import { type ScreeningStatus } from '@/app/err-portal/compliance/mockData'

interface ScreeningStatusBadgeProps {
  status: ScreeningStatus
  pendingCount?: number
  flaggedCount?: number
}

export function ScreeningStatusBadge({ status, pendingCount, flaggedCount }: ScreeningStatusBadgeProps) {
  const config = {
    Cleared: {
      icon: CheckCircle,
      className: 'bg-green-100 text-green-800 border-green-200',
      label: 'Cleared'
    },
    Pending: {
      icon: Clock,
      className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      label: pendingCount ? `Pending (${pendingCount})` : 'Pending'
    },
    Flagged: {
      icon: AlertCircle,
      className: 'bg-orange-100 text-orange-800 border-orange-200',
      label: flaggedCount ? `Flagged (${flaggedCount})` : 'Flagged'
    },
    Rejected: {
      icon: XCircle,
      className: 'bg-red-100 text-red-800 border-red-200',
      label: 'Rejected'
    },
    'Not Required': {
      icon: HelpCircle,
      className: 'bg-gray-100 text-gray-600 border-gray-200',
      label: 'Not Required'
    }
  }

  const { icon: Icon, className, label } = config[status]

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${className}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}
