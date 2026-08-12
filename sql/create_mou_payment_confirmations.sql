-- Multiple payment confirmations per project (issue #89).
-- Replaces the single-entry JSON in mous.payment_confirmation_file for new writes.
-- Run in Supabase SQL Editor.
--
-- Relationships:
--   err_projects 1—N mou_payment_confirmations
--   mou_payment_confirmations 1—N mou_payment_files
-- Storage paths: f3-mous/{mouId}/{projectId}/{paymentConfirmationId}/{uuid}-{originalFileName}

CREATE TABLE IF NOT EXISTS public.mou_payment_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mou_id uuid NOT NULL REFERENCES public.mous(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.err_projects(id) ON DELETE CASCADE,
  exchange_rate numeric NULL,
  transfer_date date NULL,
  created_by text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mou_payment_confirmations_mou_id
  ON public.mou_payment_confirmations(mou_id);
CREATE INDEX IF NOT EXISTS idx_mou_payment_confirmations_project_id
  ON public.mou_payment_confirmations(project_id);
CREATE INDEX IF NOT EXISTS idx_mou_payment_confirmations_project_transfer
  ON public.mou_payment_confirmations(project_id, transfer_date);

COMMENT ON TABLE public.mou_payment_confirmations IS
  'Payment confirmation records for F3 MOU projects (multiple per project).';

CREATE TABLE IF NOT EXISTS public.mou_payment_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_confirmation_id uuid NOT NULL
    REFERENCES public.mou_payment_confirmations(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  original_name text NOT NULL,
  file_type text NULL,
  file_size bigint NULL,
  uploaded_by text NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mou_payment_files_confirmation_id
  ON public.mou_payment_files(payment_confirmation_id);

COMMENT ON TABLE public.mou_payment_files IS
  'Supporting files for a mou_payment_confirmations row (multiple per confirmation).';

-- Keep updated_at fresh on confirmation edits
CREATE OR REPLACE FUNCTION public.set_mou_payment_confirmations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mou_payment_confirmations_updated_at
  ON public.mou_payment_confirmations;
CREATE TRIGGER trg_mou_payment_confirmations_updated_at
  BEFORE UPDATE ON public.mou_payment_confirmations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_mou_payment_confirmations_updated_at();

ALTER TABLE public.mou_payment_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mou_payment_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can select mou_payment_confirmations"
  ON public.mou_payment_confirmations;
DROP POLICY IF EXISTS "Authenticated can insert mou_payment_confirmations"
  ON public.mou_payment_confirmations;
DROP POLICY IF EXISTS "Authenticated can update mou_payment_confirmations"
  ON public.mou_payment_confirmations;
DROP POLICY IF EXISTS "Authenticated can delete mou_payment_confirmations"
  ON public.mou_payment_confirmations;

CREATE POLICY "Authenticated can select mou_payment_confirmations"
  ON public.mou_payment_confirmations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert mou_payment_confirmations"
  ON public.mou_payment_confirmations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update mou_payment_confirmations"
  ON public.mou_payment_confirmations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete mou_payment_confirmations"
  ON public.mou_payment_confirmations FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can select mou_payment_files"
  ON public.mou_payment_files;
DROP POLICY IF EXISTS "Authenticated can insert mou_payment_files"
  ON public.mou_payment_files;
DROP POLICY IF EXISTS "Authenticated can update mou_payment_files"
  ON public.mou_payment_files;
DROP POLICY IF EXISTS "Authenticated can delete mou_payment_files"
  ON public.mou_payment_files;

CREATE POLICY "Authenticated can select mou_payment_files"
  ON public.mou_payment_files FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert mou_payment_files"
  ON public.mou_payment_files FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update mou_payment_files"
  ON public.mou_payment_files FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete mou_payment_files"
  ON public.mou_payment_files FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mou_payment_confirmations TO authenticated;
GRANT ALL ON public.mou_payment_confirmations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mou_payment_files TO authenticated;
GRANT ALL ON public.mou_payment_files TO service_role;

-- ---------------------------------------------------------------------------
-- One-time backfill from mous.payment_confirmation_file JSON / legacy path.
-- Skips projects that already have rows in mou_payment_confirmations.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  mou_rec record;
  parsed jsonb;
  entry jsonb;
  project_key text;
  conf_id uuid;
  v_file_path text;
  v_exchange_rate numeric;
  v_transfer_date date;
  project_count int;
  single_project_id uuid;
BEGIN
  FOR mou_rec IN
    SELECT
      m.id,
      m.payment_confirmation_file,
      m.exchange_rate,
      m.transfer_date
    FROM public.mous AS m
    WHERE m.payment_confirmation_file IS NOT NULL
      AND btrim(m.payment_confirmation_file) <> ''
  LOOP
    parsed := NULL;
    BEGIN
      parsed := mou_rec.payment_confirmation_file::jsonb;
    EXCEPTION WHEN others THEN
      parsed := NULL;
    END;

    -- JSON map: { [project_id]: { file_path, exchange_rate, transfer_date } }
    IF parsed IS NOT NULL AND jsonb_typeof(parsed) = 'object' THEN
      FOR project_key, entry IN SELECT * FROM jsonb_each(parsed)
      LOOP
        IF NOT EXISTS (
          SELECT 1 FROM public.err_projects ep WHERE ep.id = project_key::uuid
        ) THEN
          CONTINUE;
        END IF;

        IF EXISTS (
          SELECT 1
          FROM public.mou_payment_confirmations c
          WHERE c.mou_id = mou_rec.id AND c.project_id = project_key::uuid
        ) THEN
          CONTINUE;
        END IF;

        v_file_path := NULLIF(btrim(COALESCE(entry->>'file_path', '')), '');
        BEGIN
          v_exchange_rate := NULLIF(entry->>'exchange_rate', '')::numeric;
        EXCEPTION WHEN others THEN
          v_exchange_rate := NULL;
        END;
        BEGIN
          v_transfer_date := NULLIF(entry->>'transfer_date', '')::date;
        EXCEPTION WHEN others THEN
          v_transfer_date := NULL;
        END;

        IF v_file_path IS NULL AND v_exchange_rate IS NULL AND v_transfer_date IS NULL THEN
          CONTINUE;
        END IF;

        INSERT INTO public.mou_payment_confirmations (
          mou_id, project_id, exchange_rate, transfer_date, created_by
        ) VALUES (
          mou_rec.id,
          project_key::uuid,
          v_exchange_rate,
          v_transfer_date,
          'migration:payment_confirmation_file'
        )
        RETURNING id INTO conf_id;

        IF v_file_path IS NOT NULL THEN
          INSERT INTO public.mou_payment_files (
            payment_confirmation_id, file_path, original_name, uploaded_by
          ) VALUES (
            conf_id,
            v_file_path,
            COALESCE(NULLIF(regexp_replace(v_file_path, '^.*/', ''), ''), 'payment-confirmation'),
            'migration:payment_confirmation_file'
          );
        END IF;
      END LOOP;

    -- Legacy: plain storage key on the MOU (optionally with mou.exchange_rate / transfer_date)
    ELSE
      SELECT COUNT(*), MIN(ep.id)
        INTO project_count, single_project_id
      FROM public.err_projects ep
      WHERE ep.mou_id = mou_rec.id;

      IF project_count = 1 AND single_project_id IS NOT NULL THEN
        IF EXISTS (
          SELECT 1
          FROM public.mou_payment_confirmations c
          WHERE c.mou_id = mou_rec.id AND c.project_id = single_project_id
        ) THEN
          CONTINUE;
        END IF;

        v_file_path := NULLIF(btrim(mou_rec.payment_confirmation_file), '');
        IF v_file_path IS NULL
           AND mou_rec.exchange_rate IS NULL
           AND mou_rec.transfer_date IS NULL THEN
          CONTINUE;
        END IF;

        INSERT INTO public.mou_payment_confirmations (
          mou_id, project_id, exchange_rate, transfer_date, created_by
        ) VALUES (
          mou_rec.id,
          single_project_id,
          mou_rec.exchange_rate,
          mou_rec.transfer_date,
          'migration:payment_confirmation_file'
        )
        RETURNING id INTO conf_id;

        IF v_file_path IS NOT NULL THEN
          INSERT INTO public.mou_payment_files (
            payment_confirmation_id, file_path, original_name, uploaded_by
          ) VALUES (
            conf_id,
            v_file_path,
            COALESCE(NULLIF(regexp_replace(v_file_path, '^.*/', ''), ''), 'payment-confirmation'),
            'migration:payment_confirmation_file'
          );
        END IF;
      END IF;
    END IF;
  END LOOP;
END $$;
