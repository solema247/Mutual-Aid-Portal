-- Attach a proof/receipt file to each transfer segment.
-- Storage path goes in file_link (images bucket, e.g. f0-transfer-segments/...).
-- Run in Supabase SQL Editor.

ALTER TABLE public.transfer_segments
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS file_link text;

COMMENT ON COLUMN public.transfer_segments.file_name IS 'Original filename of the attached transfer document';
COMMENT ON COLUMN public.transfer_segments.file_link IS 'Storage path in the images bucket (f0-transfer-segments/...) or an external URL';
