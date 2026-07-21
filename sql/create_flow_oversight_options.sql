-- Lookup table for Flow Oversight dropdown (Lo-hub / Almalam / Gesr, extensible)
create table if not exists public.flow_oversight_options (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.flow_oversight_options is
  'Flow oversight options for distribution decision create/edit (grant management).';

create index if not exists flow_oversight_options_active_sort_idx
  on public.flow_oversight_options (is_active, sort_order, name);

insert into public.flow_oversight_options (name, sort_order)
values
  ('Lo-hub', 10),
  ('Almalam', 20),
  ('Gesr', 30)
on conflict (name) do update
set
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

alter table public.flow_oversight_options enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'flow_oversight_options'
      and policyname = 'flow_oversight_options_select_authenticated'
  ) then
    create policy flow_oversight_options_select_authenticated
      on public.flow_oversight_options
      for select
      to authenticated
      using (true);
  end if;
end $$;

-- Persist flow_oversight on the canonical decision table
alter table public.distribution_decision_master_sheet_1
  add column if not exists flow_oversight text;

comment on column public.distribution_decision_master_sheet_1.flow_oversight is
  'Flow oversight label (e.g. Lo-hub, Almalam, Gesr) from flow_oversight_options.';
