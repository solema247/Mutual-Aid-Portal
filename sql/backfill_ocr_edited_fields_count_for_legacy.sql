-- Optional: Backfill ocr_edited_fields_count for legacy F1s so they appear in the OCR accuracy % card.
-- Sets NULL → 0 (count as "accepted with no edits") for portal F1s that predate the OCR metric.
-- Run once in Supabase SQL editor if you want the OCR card to include previously uploaded F1s.

UPDATE err_projects
SET ocr_edited_fields_count = 0
WHERE ocr_edited_fields_count IS NULL
  AND source = 'mutual_aid_portal';
