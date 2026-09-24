# Audit Log (Phase 2 foundation)

Server-side append-only event store for the ERR Portal.

**Status:** Phases 2–6C. User Management, Permission Manager, Audit Log UI, and F1–F5 business mutations are instrumented.

## Storage

- Table: `public.audit_logs` (`sql/create_audit_logs.sql`)
- Writes: **service role only** via `logAuditEvent()` in `src/lib/auditLog.ts`
- Reads: RLS allows SELECT for active `support` / `admin` / `superadmin` (`is_audit_log_viewer()`)
- No authenticated INSERT / UPDATE / DELETE

## Helper

```ts
import { logAuditEvent } from '@/lib/auditLog'

await logAuditEvent({
  action: 'user.role_changed',
  actorUserId: caller.id, // public.users.id when already known
  targetType: 'user',
  targetId: targetUser.id,
  oldValues: { role: 'state_err' },
  newValues: { role: 'admin' },
  metadata: { source_route: 'PATCH /api/users/[userId]' },
  request, // optional Request for IP / User-Agent
})
```

- Failures are **logged** (`console.error`) and returned as `{ ok: false }` — they do **not** throw, so business transactions stay unchanged.
- Actor may be passed explicitly (`actorUserId`) or resolved from the cookie session (`resolveAuditActor`).

## Event taxonomy (initial)

### User-initiated (default `metadata.source = "user"`)

| Action | Meaning |
|--------|---------|
| `user.created` | Portal user account created |
| `user.updated` | Non-role/status profile fields (e.g. display name) |
| `user.role_changed` | Role change |
| `user.status_changed` | active / suspended / pending transitions |
| `user.deleted` | Soft-delete (`status = deleted`) |
| `user.scope_changed` | `err_id` / `partner_id` / `visible_states` / `can_see_all_states` |
| `user.permission_changed` | User permission overrides changed |
| `user.permissions_reset` | Overrides cleared (e.g. after role change) |

Internal role keys (`base_err`, `state_err`, `partner`, `admin`, `support`, `superadmin`) are stored as-is — display labels belong in the UI.

### System / internal (`metadata.source = "system"`)

Reserved for intentional ops/system trails in later phases.

**Do not** emit a user or system audit event for:

- Silent permission seeding on `GET /api/permissions/overview` (`ensureRoleDefaultsSeeded` / `ensureAdminUsersCreate`)

That behavior is authorization infrastructure, not a user action.

### Deferred (later phases)

Any remaining lower-priority fields such as `grant_segment`.

## Sanitization

`old_values`, `new_values`, and `metadata` pass through `sanitizeAuditRecord()`. Sensitive keys (passwords, tokens, service keys, `pin_hash`, etc.) are replaced with `[REDACTED]`.

MOU contact/banking/signature fields are stored as presence markers (`[PRESENT]`) via `pickMouAuditChanges` — never raw account or signature content.

Never store raw file contents or full request bodies.

## Soft-delete

`actor_user_id` references `users(id) ON DELETE SET NULL`. Soft-delete keeps the user row, so historical actor references remain valid.

## Validation

Offline checks (no DB writes):

```bash
npx tsx scripts/validate-audit-log-foundation.ts
```

Optional DB smoke insert (requires `.env.local` + applied SQL; cleans up after itself):

```bash
AUDIT_LOG_VALIDATE_WRITE=1 npx tsx scripts/validate-audit-log-foundation.ts
```

## Phase 3 — User Management instrumentation

Server-side hooks (after successful mutation; audit failures do not fail the API):

| Endpoint | Events |
|----------|--------|
| `POST /api/users` | `user.created` |
| `PATCH /api/users/[userId]` | `user.updated`, `user.role_changed`, `user.status_changed`, `user.scope_changed` (side effects), `user.permissions_reset` (role change) |
| `DELETE /api/users/[userId]` | `user.deleted` |
| `PUT /api/users/[userId]/access-rights` | `user.role_changed`, `user.scope_changed`, `user.permissions_reset` (role change only) |

Shared helpers: `src/lib/userManagementAudit.ts`.

**Not yet instrumented:** pending approve/decline client paths.

## Phase 4 — Permission Manager instrumentation

Server-side hooks after successful mutation (audit failures never fail the API):

| Endpoint | Events |
|----------|--------|
| `PUT /api/permissions/role-defaults/[role]` | `user.permission_changed` (`target_type: role`, `target_id: null`) |
| `PUT /api/permissions/user/[userId]/overrides` | `user.permission_changed` **or** `user.permissions_reset` when `add=[]` & `remove=[]` (manual clear-to-default) |
| `POST /api/permissions/bulk-overrides` | same per successful user |
| `POST /api/permissions/overrides/merge` | `user.permission_changed` per successful user (changed fields only) |

**Not audited:** `GET /api/permissions/overview`, `GET /api/permissions/functions`, automatic seeding (`ensureRoleDefaultsSeeded` / `ensureAdminUsersCreate`).

## Phase 5 — Audit Log UI (read-only)

| Piece | Location |
|-------|----------|
| Page | `/err-portal/audit-log` |
| API | `GET /api/audit-logs`, `GET /api/audit-logs/filter-options` |
| Auth | Role-based: active `support` / `admin` / `superadmin` (`requireAuditLogViewer` / `canViewAuditLogUi`) — mirrors SQL `is_audit_log_viewer()`, no new function code |
| Nav | Admin sidebar item when viewer role |

UI: search, SmartFilter (action / actor / target type / date range), paginated table (25/50/100), details Sheet. No write/export/delete.

### List search (API)

Server-side before pagination. Terms are classified (UUID, email-like, numeric, action-like, general). Email-like includes `@` and conservative local-part queries (e.g. `hamza`, `hamza@`, `@example.com`) for Auth/display-name resolution; short grant codes like `LCC` are not treated as email. Grant/business identifiers (e.g. `LCC-KF-CB-0626-0009`) match `metadata.grant_serial`, `new_values.grant_serial_id`, related `grant_id` JSON fields, and `err_projects.grant_id` / `grant_serial_id` pre-lookup. UUID terms use equality on target/metadata IDs only (no broad ILIKE).

**Count (Phase 2A):** Row fetch does not always request `count: 'exact'`. When the page returns fewer than `pageSize` rows (or page 1 is empty), `total` is derived exactly as `(page - 1) * pageSize + rowCount` with no separate `COUNT(*)`. When the page is full (`rowCount === pageSize`) or an empty page beyond page 1, a lightweight head-only count query reuses the same `applyAuditLogListFilters` predicates. UI totals remain exact, not approximate.

**Pagination (Phase 2B):** List rows use keyset pagination when the client sends optional `cursor` (base64url JSON `{ t: created_at, i: id }` from the previous page’s last row). Ordering is `created_at DESC, id DESC`. All list filters are applied first; the cursor adds `(created_at < t) OR (created_at = t AND id < i)`. Page 1 uses `LIMIT pageSize` without a cursor. Page greater than 1 without `cursor` still uses legacy OFFSET (`.range`) for compatibility. Response adds `nextCursor` and `hasNextPage`; `total` and Phase 2A count logic are unchanged. Each workspace tab stores `startCursorByPage` in memory (page *N* uses the cursor returned after page *N − 1*); filter/search/date/page-size changes reset cursors to `{ 1: null }`.

## Phase 6B — F1 / F2 / F3 instrumentation

Helper: `src/lib/f123Audit.ts` (`emitF123Audit`). Emit after successful mutation only; failures never fail the API.

### F1

| Endpoint | Event | Target |
|----------|-------|--------|
| `POST /api/f1/workplan` | `f1.workplan_created` | `project` |
| `POST /api/f1/err/feedback` | `f1.feedback_submitted` | `project` (one event) |
| `POST /api/f1/err/create-serial` | `f1.serial_created` | `project` (owns nested fsystem create) |
| `POST /api/f1/err/assign-grant` | `f1.serial_assigned` | `project` |
| `POST /api/f1/err/move-to-f2` | `f1.moved_to_f2` | `project` (per project) |
| `POST /api/f1/pre-assign` | `f1.pre_assigned` | `project` |
| `POST /api/projects/[id]/documents` | `f1.document_added` | `project_document` |
| `DELETE /api/projects/[id]/documents/[docId]` | `f1.document_removed` | `project_document` |

### F2

| Endpoint | Event | Target |
|----------|-------|--------|
| `POST /api/f2/uncommitted/commit` | `f2.committed` | `project` (per project; canonical only) |
| `POST /api/f2/committed/decommit` | `f2.decommitted` | `project` |
| `PATCH /api/f2/uncommitted` | `f2.project_updated` **or** `f2.approval_file_attached` | `project` (never both) |
| `PATCH /api/f2/projects/[id]/editor` | `f2.project_edited` | `project` (full ProjectEditor content; Uncommitted + Committed) |
| `DELETE /api/f2/uncommitted` | `f2.project_deleted` | `project` |
| `POST /api/f2/committed/assign` | `f2.assigned` | `project` (per success) |
| `POST /api/f2/committed/reassign` | `f2.reassigned` | `project` (per success) |

### F3

| Endpoint | Event | Target |
|----------|-------|--------|
| `POST /api/f3/mous` | `f3.mou_created` | `mou` (one aggregate) |
| `PATCH /api/f3/mous/[id]` | `f3.mou_updated` | `mou` |
| `POST /api/f3/mous/[id]/assign` | `f3.mou_assigned` | `mou` (one aggregate) |
| `POST /api/f3/mous/[id]/reassign` | `f3.mou_reassigned` | `mou` (one aggregate) |
| `POST /api/f3/mous/[id]/projects/add` | `f3.mou_projects_added` | `mou` |
| `POST /api/f3/mous/[id]/projects/remove` | `f3.mou_projects_removed` | `mou` |
| `POST /api/f3/mous/[id]/regenerate` | `f3.mou_regenerated` | `mou` |
| `POST /api/f3/mous/[id]/signed-mou` | `f3.signed_mou_uploaded` | `mou` |
| `POST .../payment-confirmation` | `f3.payment_confirmation_created` | `payment_confirmation` (one event even with files) |
| `PATCH .../payment-confirmation/[confirmationId]` | `f3.payment_confirmation_updated` | `payment_confirmation` |
| `DELETE .../payment-confirmation/[confirmationId]` | `f3.payment_confirmation_deleted` | `payment_confirmation` |
| `POST .../[confirmationId]/files` | `f3.payment_file_added` | `payment_file` (per file) |
| `DELETE .../files/[fileId]` | `f3.payment_file_removed` | `payment_file` |

**Intentionally not audited in 6B:** legacy `POST /api/f2/uncommitted` commit, `POST /api/f2/move-file`, nested `POST /api/fsystem/grant-serials/create`, `PATCH .../grant-segment`, all GETs.

## Phase 6C — F4 / F5 instrumentation

Helper: same `emitF123Audit`. Emit after successful mutation only; failures never fail the API.

| Endpoint | Event | Target |
|----------|-------|--------|
| `POST /api/f4/save` | `f4.report_created` | `f4_summary` (`target_id` = `project_id` when UUID; `metadata.summary_id` = numeric id) |
| `POST /api/f4/update` | `f4.report_updated` | `f4_summary` |
| `DELETE /api/f4/summary/[id]` | `f4.report_deleted` | `f4_summary` |
| `PATCH /api/f4/summary/[id]/review` | `f4.reviewed` | `f4_summary` (Accept and Reject; status in new_values) |
| `POST /api/f5/save` | `f5.report_created` | `f5_report` |
| `POST /api/f5/update` | `f5.report_updated` | `f5_report` |
| `DELETE /api/f5/report/[id]` | `f5.report_deleted` | `f5_report` |
| `PATCH /api/projects/[id]/reporting-status` | `project.reporting_status_changed` | `project` (canonical for Reporting / PM / Tracker) |
| `PATCH /api/projects/[id]/status` (`completed`) | `project.completed` | `project` (explicit Complete Project only) |
| `PATCH /api/projects/[id]/implemented-sector` | `project.implemented_sector_changed` | `project` (manual only) |

**Side effects folded into parent metadata (not separate events):** F4/F5 save `*_status → partial`; F5 `implemented_sector` / `end_date` sync; delete → `waiting`; reporting-status auto project completion (`auto_completed_project: true`).

**Intentionally not audited in 6C:** all GETs, `upload/init`, `parse` / `parse-snips`, exchange-rate GET, OCR legacy routes.