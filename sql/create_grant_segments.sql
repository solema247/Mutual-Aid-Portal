-- Lookup table for F1 grant segment choices (stored on err_projects.grant_segment as code).
-- Run in Supabase SQL Editor after review.

CREATE TABLE IF NOT EXISTS public.grant_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label_en text NOT NULL,
  label_ar text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.grant_segments IS 'Selectable grant segments for F1 work plans; code is persisted on err_projects.grant_segment';

CREATE INDEX IF NOT EXISTS grant_segments_active_sort_idx
  ON public.grant_segments (is_active, sort_order);

-- Seed / refresh rows (safe to re-run: updates labels and order on conflict).
INSERT INTO public.grant_segments (code, label_en, label_ar, sort_order, is_active) VALUES
  ('Flexible', 'Flexible', 'مرن', 10, true),
  ('Sustainability', 'Sustainability', 'الاستدامة', 20, true),
  ('WRR', 'WRR', NULL, 30, true),
  ('Capacity Building', 'Capacity Building', 'بناء القدرات', 40, true),
  ('Forum', 'Forum', 'منتدى', 50, true),
  ('F-System Scaling', 'F-System Scaling', NULL, 60, true)
ON CONFLICT (code) DO UPDATE SET
  label_en = EXCLUDED.label_en,
  label_ar = EXCLUDED.label_ar,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

ALTER TABLE public.grant_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grant_segments_select_authenticated" ON public.grant_segments;

-- Portal users need read access for dropdowns.
CREATE POLICY "grant_segments_select_authenticated"
  ON public.grant_segments
  FOR SELECT
  TO authenticated
  USING (true);

-- Inserts/updates/deletes: use Supabase SQL Editor (postgres role) or service role — both bypass RLS.

GRANT SELECT ON TABLE public.grant_segments TO authenticated;
