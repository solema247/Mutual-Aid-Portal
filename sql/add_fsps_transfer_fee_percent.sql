-- Transfer fee % on FSPs — used to calculate transfer_segments.transfer_fee_amount
ALTER TABLE public.fsps
  ADD COLUMN IF NOT EXISTS transfer_fee_percent numeric;

COMMENT ON COLUMN public.fsps.transfer_fee_percent IS
  'Transfer fee as a percent of activity amount (e.g. 2.5 = 2.5%). Used to calculate transfer_segments.transfer_fee_amount.';
