# Database schema (private)

Production Supabase **schema and migrations are not in this public repo**.

They live in the private repository:

**`sudan-err-portal-schema`** (GitHub, private — team access only)

## Why

This project is open source. Migration SQL exposes table structure, RLS policies, and internal database logic. That stays private; the app code stays public.

## If you need to change the database

1. Get access to `sudan-err-portal-schema`.
2. Follow the workflow in that repo’s `docs/db-workflow.md`.
3. Schema changes require approval from **@solema247** before merge and production apply.

## If you only work on the app

Clone this repo as usual. You do **not** need the schema repo unless you are changing production database structure.

After schema changes, maintainers may update `src/lib/database.types.ts` in this repo to match.
