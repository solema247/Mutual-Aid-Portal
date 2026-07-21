-- Multiple decision documents per distribution decision (portal).
-- Legacy Airtable file_name/file_link remain as the primary/first document for sync.
alter table public.distribution_decision_master_sheet_1
  add column if not exists decision_documents jsonb not null default '[]'::jsonb;

comment on column public.distribution_decision_master_sheet_1.decision_documents is
  'Array of {id, file_name, file_link, source?, uploaded_at?} decision document attachments';

-- Seed from existing single file_name/file_link where present and documents empty
update public.distribution_decision_master_sheet_1
set decision_documents = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'file_name', coalesce(nullif(trim(file_name), ''), 'Document'),
    'file_link', trim(file_link),
    'source', case
      when trim(file_link) ~* '^https?://' then 'airtable'
      else 'portal'
    end,
    'uploaded_at', coalesce(updated_at, created_at, now())
  )
)
where coalesce(decision_documents, '[]'::jsonb) = '[]'::jsonb
  and file_link is not null
  and nullif(trim(file_link), '') is not null;
