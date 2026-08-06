-- Portal-native FSPs, fund requests, and transfer segments
-- Apply via sudan-err-portal-schema (see docs/db-workflow.md) — requires approval.
-- Airtable sources: FSPs tblPDugkSk6DL7UaW, Fund_Request tblaE8Q9hwv4WtUYi, Transfer_Segment tbl5yeqArFbIQdzC8

CREATE TABLE IF NOT EXISTS public.fsps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'Prospect',
  contact_person text,
  contact_email text,
  contract_filename text,
  contract_url text,
  contract_signed date,
  airtable_record_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fsps_name_unique UNIQUE (name)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fsps_airtable_record_id
  ON public.fsps (airtable_record_id) WHERE airtable_record_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.fund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL,
  date_submitted date,
  requested_amount numeric,
  partner_name text,
  file_name text,
  file_link text,
  airtable_record_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fund_requests_request_id_unique UNIQUE (request_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fund_requests_airtable_record_id
  ON public.fund_requests (airtable_record_id) WHERE airtable_record_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.fund_request_decisions (
  fund_request_id uuid NOT NULL REFERENCES public.fund_requests(id) ON DELETE CASCADE,
  decision_id_proposed text NOT NULL REFERENCES public.distribution_decision_master_sheet_1(decision_id_proposed),
  PRIMARY KEY (fund_request_id, decision_id_proposed)
);

CREATE INDEX IF NOT EXISTS idx_fund_request_decisions_decision
  ON public.fund_request_decisions (decision_id_proposed);

CREATE TABLE IF NOT EXISTS public.transfer_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id text NOT NULL,
  auto_number integer,
  fund_request_id uuid REFERENCES public.fund_requests(id) ON DELETE CASCADE,
  request_id text,
  grant_id text,
  fsp_id uuid REFERENCES public.fsps(id) ON DELETE SET NULL,
  decision_id_proposed text,
  purpose text,
  status text,
  activity_amount numeric,
  transfer_fee_amount numeric,
  transfer_received_date date,
  partner_name text,
  comment text,
  airtable_record_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transfer_segments_transfer_id_unique UNIQUE (transfer_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_transfer_segments_airtable_record_id
  ON public.transfer_segments (airtable_record_id) WHERE airtable_record_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transfer_segments_fund_request
  ON public.transfer_segments (fund_request_id);

CREATE INDEX IF NOT EXISTS idx_transfer_segments_grant_id
  ON public.transfer_segments (grant_id);

CREATE INDEX IF NOT EXISTS idx_transfer_segments_fsp_id
  ON public.transfer_segments (fsp_id);

ALTER TABLE public.fsps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_request_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfer_segments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY fsps_authenticated_all ON public.fsps FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY fund_requests_authenticated_all ON public.fund_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY fund_request_decisions_authenticated_all ON public.fund_request_decisions FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY transfer_segments_authenticated_all ON public.transfer_segments FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
