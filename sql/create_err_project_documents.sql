-- Additional supporting documents attached to a portal project (not F1–F5 pipeline files).
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.err_project_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.err_projects(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_key text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by text NULL
);

CREATE INDEX IF NOT EXISTS idx_err_project_documents_project_id
  ON public.err_project_documents(project_id);

COMMENT ON TABLE public.err_project_documents IS
  'Additional supporting documents attached to a project (not F1-F5 pipeline files).';

ALTER TABLE public.err_project_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can select err_project_documents" ON public.err_project_documents;
DROP POLICY IF EXISTS "Authenticated can insert err_project_documents" ON public.err_project_documents;
DROP POLICY IF EXISTS "Authenticated can update err_project_documents" ON public.err_project_documents;
DROP POLICY IF EXISTS "Authenticated can delete err_project_documents" ON public.err_project_documents;

CREATE POLICY "Authenticated can select err_project_documents"
  ON public.err_project_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert err_project_documents"
  ON public.err_project_documents FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update err_project_documents"
  ON public.err_project_documents FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete err_project_documents"
  ON public.err_project_documents FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.err_project_documents TO authenticated;
GRANT ALL ON public.err_project_documents TO service_role;
