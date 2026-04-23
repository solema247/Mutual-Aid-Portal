-- Run this in Supabase SQL Editor if `grant_segments` already exists.
-- Adds Arabic labels, inserts Forum + F-System Scaling, refreshes sort order.

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
