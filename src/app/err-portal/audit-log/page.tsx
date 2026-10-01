import { Suspense } from 'react'
import AuditLogPage from './AuditLogPage'

/**
 * Audit Log page. Access is enforced by the client UI + /api/audit-logs*
 * (active support / admin / superadmin). Do not gate here with
 * createServerComponentClient — that path does not see the same session as
 * the rest of the ERR portal and incorrectly 404s logged-in viewers.
 */
export default function AuditLogRoutePage() {
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
