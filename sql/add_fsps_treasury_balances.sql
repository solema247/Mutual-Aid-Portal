-- FSP treasury balances (cash at the financial service provider)
-- In  = money received into this FSP treasury
-- Out = money disbursed from this FSP treasury
-- Balance = In − Out (computed in the app; not stored)
-- Apply via sudan-err-portal-schema (see docs/db-workflow.md) or run locally when approved.

ALTER TABLE public.fsps
  ADD COLUMN IF NOT EXISTS treasury_in_usd numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS treasury_out_usd numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.fsps.treasury_in_usd IS
  'USD received into this FSP treasury (cash in).';
COMMENT ON COLUMN public.fsps.treasury_out_usd IS
  'USD disbursed from this FSP treasury (cash out).';
