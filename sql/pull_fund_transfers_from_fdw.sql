-- Copy latest Fund_Request files from FDW onto portal tables.
-- Run in Supabase SQL Editor.
--
-- Airtable stores the document on fund_request, not transfer_segment.
-- This:
--   1. Refreshes fund_requests.file_name / file_link from FDW when FDW has a file
--   2. Copies that file onto transfer_segments that still have no file
--
-- Does not change amounts, grant_id, status, or received date.
-- Does not overwrite a transfer file that was already attached in the portal.

-- 1) Fund request files from FDW
UPDATE public.fund_requests p
SET
  file_name = f.file_name,
  file_link = f.file_link,
  updated_at = now()
FROM public.fund_request f
WHERE p.request_id = f.request_id
  AND coalesce(f.file_link, '') <> ''
  AND (
    p.file_link IS DISTINCT FROM f.file_link
    OR p.file_name IS DISTINCT FROM f.file_name
  );

-- 2) Copy parent fund-request file onto transfers with no file yet
UPDATE public.transfer_segments t
SET
  file_name = p.file_name,
  file_link = p.file_link,
  updated_at = now()
FROM public.fund_requests p
WHERE t.fund_request_id = p.id
  AND t.file_link IS NULL
  AND coalesce(p.file_link, '') <> '';
