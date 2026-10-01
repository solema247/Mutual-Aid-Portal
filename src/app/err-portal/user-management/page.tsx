import { Suspense } from 'react'
import UserManagement from './components/UserManagement'

export default function UserManagementPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <UserManagement />
    </Suspense>
  )
}
