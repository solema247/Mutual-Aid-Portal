-- Run this in Supabase SQL Editor (Dashboard → SQL Editor).
-- Creates a function in the public schema that reads from partners.donor_forecasts_summary_view.
-- The API cannot query the partners schema directly (PGRST106); this RPC runs with definer rights.

create or replace function public.get_forecast_summary()
returns table(month text, status text, amount numeric)
language sql
security definer
set search_path = public, partners
as $$
  select
    d.month::text,
    coalesce(d.status, 'unknown')::text,
    sum(d.amount) as amount
  from partners.donor_forecasts_summary_view d
  group by d.month, d.status
  order by d.month, d.status;
$$;

-- Optional: allow anonymous or authenticated to call (adjust to your RLS needs)
-- grant execute on function public.get_forecast_summary() to anon;
-- grant execute on function public.get_forecast_summary() to authenticated;
