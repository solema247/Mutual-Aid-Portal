# Function Permissions Page

**URL:** `http://localhost:3000/err-portal/user-management/permissions`

**Purpose:** Manage which users can perform which actions. Role defaults apply first; per-user overrides add or remove permissions.

---

## 1. What the page does

- **Select user** – Dropdown of active users (excluding superadmins). Optional `?userId=<id>` in the URL pre-selects that user.
- **View permissions** – For the selected user, shows all function permissions grouped by module (F1 Work Plans, F2 Approvals, F3 MOUs, Grant Management, F4 & F5 Reporting, User Management, Room Management). Each function is a checkbox: checked = allowed, unchecked = not allowed.
- **Edit overrides** – Checking/unchecking updates local state. “Save changes” sends only the **override** lists (`add` / `remove`) to the API; the underlying role default is not changed.
- **Persistence** – Overrides are stored in `src/data/userOverrides.json` (keyed by user `id`). On the server, this file is read from disk on each permission check so changes take effect without restart.

---

## 2. Access control

- Only **admin** and **superadmin** can open this page.
- The permissions page checks `/api/users/me`; if `role` is not `admin` or `superadmin`, it redirects to `/err-portal/user-management`.
- The three permissions APIs (`/api/permissions/functions`, `/api/permissions/user/[userId]`, `/api/permissions/user/[userId]/overrides`) also require an authenticated user with role `admin` or `superadmin` (403 otherwise).

---

## 3. Data model

### Roles

- `superadmin` – Has all function codes (hardcoded in logic, not in JSON).
- `admin` – Default: all functions (empty array in `rolePermissions.json` is treated as “all”).
- `state_err` / `base_err` – Default set from `rolePermissions.json`.

### Functions

- Each function has: `code` (e.g. `f1_approve`, `grant_create_cycle`), `module`, `label_en`, `label_ar`.
- Full list: **`src/data/functions.json`**.

### Role defaults

- **`src/data/rolePermissions.json`**  
  - Keys: `base_err`, `state_err`, `admin`.  
  - Values: arrays of function codes.  
  - `admin: []` means “all functions”.  
  - `superadmin` is not in the file; code gives them all.

### User overrides

- **`src/data/userOverrides.json`**  
  - Keys: user UUID (from `users.id`).  
  - Value per user: `{ "add": string[], "remove": string[] }`.  
  - **Effective permissions** = role default, then apply `remove`, then apply `add`.

---

## 4. API endpoints

| Method | Path | Purpose | Response / body |
|--------|------|--------|-----------------|
| GET | `/api/permissions/functions` | List all functions grouped by module (for checkboxes) | `Record<module, FunctionDefinition[]>` |
| GET | `/api/permissions/user/[userId]` | Get one user’s effective permissions + role base + overrides | `{ user, allowed[], roleBase[], overrides: { add[], remove[] } }` |
| PUT | `/api/permissions/user/[userId]/overrides` | Save overrides for that user | Body: `{ add: string[], remove: string[] }` → 200 `{ ok: true }` |

All require auth; only admin/superadmin get 200. Unauthenticated → 401; forbidden → 403.

---

## 5. Page flow (implementation reference)

1. **Mount** – Permissions page calls `/api/users/me`; if not admin/superadmin, redirect to `/err-portal/user-management`.
2. **Load functions** – `PermissionsManager` calls `GET /api/permissions/functions` once; stores result by module for rendering.
3. **Load users** – `PermissionsManager` uses `getActiveUsers()` (from `@/app/api/users/utils/users`) with `status: 'active'`, then filters out superadmin; populates the user dropdown.
4. **URL pre-select** – If `?userId=...` is present and that id is in the users list, set it as `selectedUserId`.
5. **Select user** – When `selectedUserId` changes, call `GET /api/permissions/user/{userId}`; set `allowed`, `roleBase`, `overrides.add`, `overrides.remove` in state.
6. **Toggle checkbox** – For function `code`:  
   - If **checking**: remove `code` from `remove`; if not in role base, add to `add`; add to `allowed`.  
   - If **unchecking**: remove `code` from `add`; if in role base, add to `remove`; remove from `allowed`.  
   (So the UI always reflects effective permission; save only sends add/remove.)
7. **Save** – When user clicks “Save changes”, `PUT /api/permissions/user/{userId}/overrides` with `{ add, remove }`. API reads `userOverrides.json`, updates the entry for `userId`, writes file back.

---

## 6. How permissions are enforced elsewhere

- **Current user’s allowed list** – `GET /api/users/me` returns `allowed_functions: string[]`. That array is computed in the API using the same logic as in **`src/lib/permissions.ts`** (role + overrides from `userOverrides.json`).
- **UI (buttons / links)** – Components use the hook **`useAllowedFunctions()`** from **`src/hooks/useAllowedFunctions.ts`**, which fetches `/api/users/me` and exposes `can(code: string)`. Buttons are disabled or given a “no permission” tooltip when `!can('function_code')`.
- **API (sensitive actions)** – Route handlers call **`requirePermission(functionCode)`** from **`src/lib/requirePermission.ts`**, which loads the current user from session and calls **`can(user, functionCode)`** from **`src/lib/permissions.ts`**; if false, respond with 403.

So: the **Function Permissions** page only edits overrides; the same **`permissions.ts`** logic is used for both the “me” allowed list and for `requirePermission` in APIs.

---

## 7. Relevant code files

Use these when reimplementing the page or RBAC in another branch.

### Page and UI

| File | Role |
|------|------|
| `src/app/err-portal/user-management/permissions/page.tsx` | Permissions route; auth check; renders title + `<PermissionsManager>`. |
| `src/app/err-portal/user-management/permissions/components/PermissionsManager.tsx` | Main UI: user select, function list by module, checkboxes, toggle logic, save to overrides API. |

### Entry point from User Management

| File | Role |
|------|------|
| `src/app/err-portal/user-management/page.tsx` | Renders `<UserManagement />`. |
| `src/app/err-portal/user-management/components/UserManagement.tsx` | Shows “Function Permissions” link (admin/superadmin only) to `/err-portal/user-management/permissions`. |
| `src/app/err-portal/user-management/components/ActiveUsersList.tsx` | “Permissions” link per row → `/err-portal/user-management/permissions?userId={id}`. |

### Permissions APIs

| File | Role |
|------|------|
| `src/app/api/permissions/functions/route.ts` | GET: returns functions by module; uses `getFunctionsByModule()` from `@/lib/permissions`. |
| `src/app/api/permissions/user/[userId]/route.ts` | GET: returns allowed, roleBase, overrides for one user; reads `userOverrides.json`, uses `getAllowedSetFromOverrides`, `getRoleBase`. |
| `src/app/api/permissions/user/[userId]/overrides/route.ts` | PUT: body `{ add, remove }`; reads/writes `src/data/userOverrides.json` for that userId. |

### Core permissions logic

| File | Role |
|------|------|
| `src/lib/permissions.ts` | Role defaults, override application, `can()`, `getAllowedFunctions`, `getRoleBase`, `getFunctionsByModule`, `getAllowedSetFromOverrides`. Reads `functions.json`, `rolePermissions.json`, and (on server) `userOverrides.json`. |
| `src/lib/requirePermission.ts` | `requirePermission(functionCode)` for API routes: session → user → `can(user, functionCode)` → 403 if false. |
| `src/hooks/useAllowedFunctions.ts` | Client: fetch `/api/users/me`, expose `can(code)` from `allowed_functions`. |

### User and auth

| File | Role |
|------|------|
| `src/app/api/users/me/route.ts` | Returns current user and `allowed_functions` via `getAllowedFunctions()` from `@/lib/permissions`. |
| `src/app/api/users/utils/users.ts` | `getActiveUsers()` used by PermissionsManager for the user dropdown. |
| `src/app/api/users/types/users.ts` | User / list types. |
| `src/lib/supabaseClient.ts` | Client Supabase (used elsewhere on user-management; permissions page uses fetch to APIs). |
| `src/lib/supabaseRouteClient.ts` | Server Supabase used by the permissions API routes. |

### Data (RBAC config)

| File | Role |
|------|------|
| `src/data/functions.json` | All function definitions (code, module, label_en, label_ar). |
| `src/data/rolePermissions.json` | Default function codes per role (base_err, state_err, admin). |
| `src/data/userOverrides.json` | Per-user overrides: `{ "user-uuid": { "add": [], "remove": [] } }`; written by overrides API. |

### Layout and shared UI

| File | Role |
|------|------|
| `src/app/err-portal/layout.tsx` | Wraps all `/err-portal` routes (sidebar, etc.). |
| `src/components/ui/card.tsx` | Card, CardHeader, CardTitle, CardContent. |
| `src/components/ui/button.tsx` | Button. |
| `src/components/ui/checkbox.tsx` | Checkbox. |
| `src/components/ui/select.tsx` | Select for user dropdown. |

---

## 8. Checklist for implementing in another branch

- [ ] Copy or adapt **`src/data/functions.json`** and **`src/data/rolePermissions.json`** (and ensure **`src/data/userOverrides.json`** exists and is writable by the app).
- [ ] Implement or reuse **`src/lib/permissions.ts`** (role base + overrides, `can()`, `getAllowedFunctions`, `getFunctionsByModule`, `getAllowedSetFromOverrides`).
- [ ] Implement **`GET /api/permissions/functions`** and **GET/PUT** for **`/api/permissions/user/[userId]`** and **`/api/permissions/user/[userId]/overrides`** (auth + read/write overrides file).
- [ ] Ensure **`/api/users/me`** returns **`allowed_functions`** using the same permissions logic.
- [ ] Add the permissions route page and **PermissionsManager** (user select, load user permissions, checkboxes by module, toggle logic, save overrides).
- [ ] Restrict the permissions page and the three permissions APIs to admin/superadmin.
- [ ] Use **`requirePermission(functionCode)`** in any API route that performs a sensitive action, and **`useAllowedFunctions()`** / **`can(code)`** in the UI where you need to hide or disable actions.
