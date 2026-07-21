-- Lookup table for Decision Maker dropdown (MAC / Ops / PC, extensible)
create table if not exists public.distribution_decision_maker (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.distribution_decision_maker is
  'Decision maker options for distribution decision create/edit (grant management).';

create index if not exists distribution_decision_maker_active_sort_idx
  on public.distribution_decision_maker (is_active, sort_order, name);

insert into public.distribution_decision_maker (name, sort_order)
values
  ('MAC', 10),
  ('Ops', 20),
  ('PC', 30)
on conflict (name) do update
set
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

alter table public.distribution_decision_maker enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'distribution_decision_maker'
      and policyname = 'distribution_decision_maker_select_authenticated'
  ) then
    create policy distribution_decision_maker_select_authenticated
      on public.distribution_decision_maker
      for select
      to authenticated
      using (true);
  end if;
end $$;

-- Persist decision_maker on the canonical decision table
alter table public.distribution_decision_master_sheet_1
  add column if not exists decision_maker text;

comment on column public.distribution_decision_master_sheet_1.decision_maker is
  'Decision maker label (e.g. MAC, Ops, PC) from distribution_decision_maker.';
