'use client'

import Link from 'next/link'
import { Inbox, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'

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
  if (!showEnvironment && !showAccessInbox) return null

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
          className="h-8 w-8 shrink-0 rounded-md text-white hover:text-brand-orange hover:bg-white/10 border-0 shadow-none"
          title={accessInboxLabel}
          aria-label={accessInboxLabel}
        >
          <Link href="/err-portal/access-requests">
            <Inbox className="h-5 w-5" strokeWidth={2} />
          </Link>
        </Button>
      ) : null}
    </>
  )
}
