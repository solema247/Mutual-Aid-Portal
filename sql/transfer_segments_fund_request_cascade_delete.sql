-- Deleting a fund request should also delete its transfer segments.
ALTER TABLE public.transfer_segments
  DROP CONSTRAINT IF EXISTS transfer_segments_fund_request_id_fkey;

ALTER TABLE public.transfer_segments
  ADD CONSTRAINT transfer_segments_fund_request_id_fkey
  FOREIGN KEY (fund_request_id)
  REFERENCES public.fund_requests(id)
  ON DELETE CASCADE;
