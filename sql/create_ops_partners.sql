-- Ops partners for grant-management distribution decision Partner dropdown.
create table if not exists public.ops_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ops_partners is
  'Operational partners for distribution decision Partner dropdown (grant management).';

create index if not exists ops_partners_active_sort_idx
  on public.ops_partners (is_active, sort_order, name);

-- Seed initial list (idempotent)
insert into public.ops_partners (name, sort_order)
values
  ('P2H', 10),
  ('Gisa', 20),
  ('DCA', 30),
  ('Avaaz', 40),
  ('Acted', 50),
  ('SSC', 60),
  ('Donations', 70),
  ('Protect AID', 80),
  ('CDP', 90)
on conflict (name) do update
set
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

alter table public.ops_partners enable row level security;

-- Read for authenticated users; writes via service role / admin only for now
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ops_partners' and policyname = 'ops_partners_select_authenticated'
  ) then
    create policy ops_partners_select_authenticated
      on public.ops_partners
      for select
      to authenticated
      using (true);
  end if;
end $$;
