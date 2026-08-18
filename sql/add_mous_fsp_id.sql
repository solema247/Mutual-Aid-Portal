-- Link MOUs to the FSP that paid them. Used to roll up F3 payment confirmations as FSP treasury out.
ALTER TABLE public.mous
  ADD COLUMN IF NOT EXISTS fsp_id uuid REFERENCES public.fsps(id);

COMMENT ON COLUMN public.mous.fsp_id IS
  'FSP that paid this MOU. Treasury out = confirmed project expenses on MOUs with this FSP.';

CREATE INDEX IF NOT EXISTS mous_fsp_id_idx ON public.mous (fsp_id);
