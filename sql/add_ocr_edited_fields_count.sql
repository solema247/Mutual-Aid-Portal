-- Add OCR acceptance metric for F1 uploads (FCDO evaluation indicator).
-- Run this in Supabase SQL editor or via migration.
-- ocr_edited_fields_count: number of key fields the user changed after OCR+AI extraction.
-- NULL = legacy or non-OCR upload; 0 = accepted as-is; >0 = number of fields edited.
ALTER TABLE err_projects
ADD COLUMN IF NOT EXISTS ocr_edited_fields_count integer;

COMMENT ON COLUMN err_projects.ocr_edited_fields_count IS 'F1 OCR acceptance: number of key fields edited after extraction. NULL = no OCR; 0 = accepted as-is.';
