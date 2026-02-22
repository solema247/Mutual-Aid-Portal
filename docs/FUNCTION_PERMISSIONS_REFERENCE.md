# Function Permissions — Reference Code for Another Codebase

Use this as a copy-paste reference to implement **adjusting user actions per page** (role defaults + per-user overrides). Each section is self-contained and commented.

---

## 1. Data file shapes

**`src/data/functions.json`** — One entry per gated action. `code` is the id used in `can('code')` and in overrides.

```json
[
  { "code": "f1_approve", "module": "f1", "label_ar": "...", "label_en": "Approve project" },
  { "code": "users_approve", "module": "users", "label_ar": "...", "label_en": "Approve user" }
]
```

**`src/data/rolePermissions.json`** — Default function codes per role. `admin: []` = all. `superadmin` is handled in code (gets all).

```json
{
  "base_err": ["f1_upload", "f1_approve", "..."],
  "state_err": ["f1_upload", "f2_commit", "..."],
  "admin": []
}
```

**`src/data/userOverrides.json`** — Per-user overrides. Key = `users.id` (UUID). Applied on top of role default: first `remove`, then `add`.

```json
{
  "user-uuid-1": { "add": [], "remove": ["f5_upload", "f3_edit_mou"] },
  "user-uuid-2": { "add": ["f2_approve"], "remove": [] }
}
```

---

## 2. Core permissions module — `src/lib/permissions.ts`

Effective permission = **role default** → apply **remove** → apply **add**. Server reads `userOverrides.json` from disk on each check so changes apply without restart.

```ts
/**
 * Central permissions: role defaults + user overrides.
 * Exports: can(user, code), getAllowedFunctions(user), getRoleBase(role),
 * getFunctionsByModule(), getAllowedSetFromOverrides(user, overridesMap).
 */

// import functionsList from '@/data/functions.json'
// import rolePermissions from '@/data/rolePermissions.json'
// import userOverridesStatic from '@/data/userOverrides.json'

// export type Role = 'superadmin' | 'admin' | 'state_err' | 'base_err'
// export interface PermissionUser { id: string; role: Role }
// export interface FunctionDefinition { code: string; module: string; label_ar: string; label_en: string }
// export interface UserOverride { add?: string[]; remove?: string[] }
// export type UserOverridesMap = Record<string, UserOverride>

// const allCodes = (functionsList as FunctionDefinition[]).map((f) => f.code)
// const roleDefaults = rolePermissions as Record<string, string[]>

// /** On server: read userOverrides.json from disk so saves take effect without restart. */
// function getOverrides(): UserOverridesMap {
//   if (typeof window !== 'undefined') return staticOverrides
//   try {
//     const fs = require('fs'), path = require('path')
//     const p = path.join(process.cwd(), 'src', 'data', 'userOverrides.json')
//     if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'))
//   } catch (e) {}
//   return staticOverrides
// }

// /** Role base: superadmin => all; admin with [] => all; else list from rolePermissions. */
// function getBaseAllowedForRole(role: string): Set<string> {
//   if (role === 'superadmin') return new Set(allCodes)
//   const list = roleDefaults[role]
//   if (role === 'admin' && (!list || list.length === 0)) return new Set(allCodes)
//   return new Set(list || [])
// }

// export function getRoleBase(role: string): string[] {
//   return Array.from(getBaseAllowedForRole(role))
// }

// /** Allowed set = role base, then apply override.remove then override.add. */
// export function getAllowedSetFromOverrides(user: PermissionUser, overridesMap: UserOverridesMap): Set<string> {
//   if (user.role === 'superadmin') return new Set(allCodes)
//   const base = getBaseAllowedForRole(user.role)
//   const override = overridesMap[user.id]
//   if (!override) return base
//   const result = new Set(base)
//   if (override.remove?.length) override.remove.forEach((c) => result.delete(c))
//   if (override.add?.length) override.add.forEach((c) => result.add(c))
//   return result
// }

// function getAllowedSet(user: PermissionUser): Set<string> {
//   return getAllowedSetFromOverrides(user, getOverrides())
// }

// export function can(user: PermissionUser | null, functionCode: string): boolean {
//   if (!user) return false
//   return getAllowedSet(user).has(functionCode)
// }

// export function getFunctionList(): FunctionDefinition[] {
//   return functionsList as FunctionDefinition[]
// }

// export function getAllowedFunctions(user: PermissionUser | null): string[] {
//   if (!user) return []
//   return Array.from(getAllowedSet(user))
// }

// export function getFunctionsByModule(): Record<string, FunctionDefinition[]> {
//   const list = getFunctionList()
//   const byModule: Record<string, FunctionDefinition[]> = {}
//   for (const f of list) {
//     if (!byModule[f.module]) byModule[f.module] = []
//     byModule[f.module].push(f)
//   }
//   return byModule
// }
```

---

## 3. Require permission in API routes — `src/lib/requirePermission.ts`

Call at the start of any API route that performs a sensitive action. Returns `{ user }` if allowed, or a `NextResponse` to return (401/403/404).

```ts
// import { NextResponse } from 'next/server'
// import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
// import { can, type PermissionUser } from '@/lib/permissions'

// export async function requirePermission(functionCode: string): Promise<{ user: { id: string; role: string } } | NextResponse> {
//   const supabase = getSupabaseRouteClient()
//   const { data: { session }, error: sessionError } = await supabase.auth.getSession()
//   if (sessionError || !session) {
//     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
//   }
//   const { data: userRow, error: userError } = await supabase
//     .from('users')
//     .select('id, role')
//     .eq('auth_user_id', session.user.id)
//     .single()
//   if (userError || !userRow) {
//     return NextResponse.json({ error: 'User not found' }, { status: 404 })
//   }
//   const permUser: PermissionUser = { id: userRow.id, role: userRow.role as PermissionUser['role'] }
//   if (!can(permUser, functionCode)) {
//     return NextResponse.json(
//       { error: 'Forbidden - You do not have permission for this action', code: 'PERMISSION_DENIED', functionCode },
//       { status: 403 }
//     )
//   }
//   return { user: { id: userRow.id, role: userRow.role } }
// }

// --- Usage in an API route:
// const auth = await requirePermission('users_approve')
// if (auth instanceof NextResponse) return auth
// const { user } = auth
// // ... proceed with action
```

---

## 4. Client hook — `src/hooks/useAllowedFunctions.ts`

Fetches `/api/users/me` and exposes `can(code)` so you can disable/hide buttons per action.

```ts
// 'use client'
// import { useEffect, useState } from 'react'

// export function useAllowedFunctions(): { allowedFunctions: string[]; can: (code: string) => boolean; isLoading: boolean } {
//   const [allowedFunctions, setAllowedFunctions] = useState<string[]>([])
//   const [isLoading, setIsLoading] = useState(true)
//   useEffect(() => {
//     let cancelled = false
//     fetch('/api/users/me')
//       .then((r) => r.ok ? r.json() : { allowed_functions: [] })
//       .then((data) => { if (!cancelled) setAllowedFunctions(data.allowed_functions ?? []) })
//       .catch(() => { if (!cancelled) setAllowedFunctions([]) })
//       .finally(() => { if (!cancelled) setIsLoading(false) })
//     return () => { cancelled = true }
//   }, [])
//   const can = (code: string): boolean => {
//     if (allowedFunctions.length === 0 && isLoading) return true
//     if (allowedFunctions.length === 0) return false
//     return allowedFunctions.includes(code)
//   }
//   return { allowedFunctions, can, isLoading }
// }
```

---

## 5. Expose allowed_functions on “me” — `src/app/api/users/me/route.ts`

Your existing `GET /api/users/me` must return `allowed_functions` so the client hook can drive `can()`.

```ts
// In your GET handler, after loading user from session:
// const allowed_functions = getAllowedFunctions({ id: userData.id, role: userData.role })
// return NextResponse.json({
//   id: userData.id,
//   display_name: userData.display_name,
//   role: userData.role,
//   // ... other fields
//   allowed_functions,
// })
```

---

## 6. Adjusting user actions in the UI (per page)

Use `useAllowedFunctions()` then guard buttons with `can('function_code')`: disable, tooltip, or hide.

```tsx
// --- In your page/component:
// import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'

// const { can } = useAllowedFunctions()

// Disable + tooltip when no permission:
// <button
//   title={!can('users_approve') ? 'No permission' : 'Approve'}
//   onClick={() => handleApprove(user.id)}
//   disabled={!can('users_approve')}
// >
//   Approve
// </button>

// Hide action entirely when no permission:
// {can('users_decline') && (
//   <button onClick={() => handleDecline(user.id)}>Decline</button>
// )}

// Optional: disable and show “no permission” tooltip:
// <Button disabled={!can('grant_edit_call')} title={!can('grant_edit_call') ? 'You do not have permission' : undefined}>
//   Edit
// </Button>
```

---

## 7. Permissions API routes (for the Function Permissions admin UI)

**GET `/api/permissions/functions`** — List all functions by module (admin/superadmin only).

```ts
// GET: auth session -> ensure role is admin or superadmin -> return getFunctionsByModule()
```

**GET `/api/permissions/user/[userId]`** — For one user: allowed list, role base, and overrides (admin/superadmin only).

```ts
// GET: auth -> ensure admin/superadmin -> load target user -> readOverrides() from disk
// -> getAllowedSetFromOverrides(permUser, overrides), getRoleBase(role)
// return { user: { id, display_name, role }, allowed: [...], roleBase: [...], overrides: { add: [...], remove: [...] }
```

**PUT `/api/permissions/user/[userId]/overrides`** — Save overrides for that user (admin/superadmin only).

```ts
// PUT: auth -> ensure admin/superadmin -> body { add: string[], remove: string[] }
// readOverrides(), set overrides[userId] = { add, remove } (or delete key if both empty), writeOverrides()
// return { ok: true }
```

---

## 8. File list (for porting)

| Purpose | File |
|--------|------|
| Core logic | `src/lib/permissions.ts` |
| API guard | `src/lib/requirePermission.ts` |
| Client hook | `src/hooks/useAllowedFunctions.ts` |
| Me endpoint | `src/app/api/users/me/route.ts` (add `allowed_functions`) |
| Permissions APIs | `src/app/api/permissions/functions/route.ts`, `user/[userId]/route.ts`, `user/[userId]/overrides/route.ts` |
| Data | `src/data/functions.json`, `rolePermissions.json`, `userOverrides.json` |
| UI (example) | Any component using `useAllowedFunctions()` and `can('code')` for buttons/links |
