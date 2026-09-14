-- Shared Project Management rollup cache (server/admin only).
-- One row per access scope; rebuilds upsert in place — does not grow as a history log.
-- Apply in sudan-err-portal Supabase before relying on shared cache in /api/overview/rollup.

CREATE TABLE IF NOT EXISTS public.rollup_cache (
  cache_key text PRIMARY KEY,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rollup_cache ENABLE ROW LEVEL SECURITY;

-- No policies / grants for anon or authenticated: only service role (admin client) may read/write.
REVOKE ALL ON TABLE public.rollup_cache FROM anon, authenticated;
