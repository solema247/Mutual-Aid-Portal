-- Task 13: payment confirmation FSP so treasury out can follow the paying FSP
-- Transfer in = transfer_segments.fsp_id
-- Transfer out = mou_payment_confirmations.fsp_id

ALTER TABLE public.mou_payment_confirmations
  ADD COLUMN IF NOT EXISTS fsp_id uuid
  REFERENCES public.fsps(id)
  ON DELETE SET NULL;

COMMENT ON COLUMN public.mou_payment_confirmations.fsp_id IS
  'FSP that paid this confirmation. Treasury out rolls up confirmed project expenses by this FSP, falling back to the MOU-level FSP when null.';

CREATE INDEX IF NOT EXISTS mou_payment_confirmations_fsp_id_idx
  ON public.mou_payment_confirmations (fsp_id);

-- Backfill is not included because public.mous.fsp_id does not exist.
-- Replace <correct_mous_fsp_column> with the actual FSP column on public.mous:
--
-- UPDATE public.mou_payment_confirmations AS pc
-- SET fsp_id = m.<correct_mous_fsp_column>
-- FROM public.mous AS m
-- WHERE pc.mou_id = m.id
--   AND pc.fsp_id IS NULL
--   AND m.<correct_mous_fsp_column> IS NOT NULL;
