-- Lookup table for distribution Restriction dropdown
create table if not exists public.distribution_restriction_options (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.distribution_restriction_options is
  'Restriction options for distribution decision create/edit (grant management).';

create index if not exists distribution_restriction_options_active_sort_idx
  on public.distribution_restriction_options (is_active, sort_order, name);

insert into public.distribution_restriction_options (name, sort_order)
values
  ('Health', 10),
  ('Livelihood', 20),
  ('Contingency Fund', 30),
  ('Protection', 40),
  ('WERR', 50),
  ('Capacity Building', 60),
  ('Archive', 70),
  ('Flexible', 80),
  ('Ops', 90),
  ('MAG', 100)
on conflict (name) do update
set
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

alter table public.distribution_restriction_options enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'distribution_restriction_options'
      and policyname = 'distribution_restriction_options_select_authenticated'
  ) then
    create policy distribution_restriction_options_select_authenticated
      on public.distribution_restriction_options
      for select
      to authenticated
      using (true);
  end if;
end $$;
