import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { notFound } from 'next/navigation'
import { canViewAuditLogUi } from '@/lib/auditLogAccess'
import AuditLogPage from './AuditLogPage'

/**
 * Server gate: unauthorized roles get the standard App Router 404.
 * Authorized roles (active support/admin/superadmin) render the client page.
 * API routes remain independently protected.
 */
export default async function AuditLogRoutePage() {
  const supabase = createServerComponentClient({ cookies })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user?.id) {
    notFound()
  }

  const { data: user } = await supabase
    .from('users')
    .select('role, status')
    .eq('auth_user_id', session.user.id)
    .maybeSingle()

  if (!canViewAuditLogUi(user?.role, user?.status)) {
    notFound()
  }

  return (
    <Suspense
      fallback={
        <div className="p-4 text-sm text-muted-foreground">Loading…</div>
      }
    >
      <AuditLogPage />
    </Suspense>
  )
}
