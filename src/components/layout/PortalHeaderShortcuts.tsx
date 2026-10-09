'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Inbox, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type PortalHeaderShortcutsProps = {
  showEnvironment?: boolean
  showAccessInbox?: boolean
  accessInboxLabel?: string
}

/**
 * Top-bar shortcuts for Environment (cog) and Access inbox/requests.
 */
export default function PortalHeaderShortcuts({
  showEnvironment = false,
  showAccessInbox = false,
  accessInboxLabel = 'Access requests',
}: PortalHeaderShortcutsProps) {
  const pathname = usePathname()
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    if (!showAccessInbox) {
      setPendingCount(0)
      return
    }
    let cancelled = false
    fetch('/api/canvas/access-requests?count_only=1')
      .then((r) => (r.ok ? r.json() : { pending_count: 0 }))
      .then((data) => {
        if (!cancelled) setPendingCount(Number(data.pending_count) || 0)
      })
      .catch(() => {
        if (!cancelled) setPendingCount(0)
      })
    return () => {
      cancelled = true
    }
  }, [showAccessInbox, pathname])

  if (!showEnvironment && !showAccessInbox) return null

  const inboxTitle =
    pendingCount > 0 ? `${accessInboxLabel} (${pendingCount})` : accessInboxLabel

  return (
    <>
      {showEnvironment ? (
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 rounded-md text-white hover:text-brand-orange hover:bg-white/10 border-0 shadow-none"
          title="Environment"
          aria-label="Environment"
        >
          <Link href="/err-portal/environment">
            <Settings className="h-5 w-5" strokeWidth={2} />
          </Link>
        </Button>
      ) : null}
      {showAccessInbox ? (
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="relative h-8 w-8 shrink-0 rounded-md text-white hover:text-brand-orange hover:bg-white/10 border-0 shadow-none"
          title={inboxTitle}
          aria-label={inboxTitle}
        >
          <Link href="/err-portal/access-requests">
            <Inbox className="h-5 w-5" strokeWidth={2} />
            {pendingCount > 0 ? (
              <span
                className={cn(
                  'absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full',
                  'bg-brand-orange px-1 text-[10px] font-semibold leading-none text-white',
                )}
              >
                {pendingCount > 99 ? '99+' : pendingCount}
              </span>
            ) : null}
          </Link>
        </Button>
      ) : null}
    </>
  )
}
