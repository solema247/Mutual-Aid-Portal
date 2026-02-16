-- Add 'transfer_state' chart type to your existing get_forecast_summary(p_chart_type) function.
-- Run in Supabase SQL Editor. If your function has a different name or signature, adjust accordingly.
--
-- This branch returns rows: transfer_method, state_name, amount (aggregated).
-- Used by the Sankey chart: origin = transfer_method, destination = state_name, value = amount.

-- Option A: If you have the flexible function with CASE p_chart_type, add this WHEN block
-- inside the CASE (before the ELSE):
--
--   when 'transfer_state' then
--     select jsonb_agg(
--       jsonb_build_object(
--         'transfer_method', transfer_method,
--         'state_name', state_name,
--         'amount', amount
--       )
--     )
--     into result
--     from (
--       select
--         coalesce(d.transfer_method, 'Unknown')::text as transfer_method,
--         coalesce(d.state_name, 'Unknown')::text as state_name,
--         sum(d.amount)::numeric as amount
--       from partners.donor_forecasts_summary_view d
--       group by d.transfer_method, d.state_name
--       order by d.transfer_method, d.state_name
--     ) sub;
--
-- And in the ELSE, add 'transfer_state' to the allowed list, e.g.:
--   allowed: array['month_status', 'transfer_state']

-- Option B: Full replacement of the function (if you prefer to replace entirely).
-- Uncomment and run the block below, then drop the old function if needed.
/*
create or replace function public.get_forecast_summary(p_chart_type text default 'month_status')
returns jsonb
language plpgsql
security definer
set search_path = public, partners
as $$
declare
  result jsonb;
begin
  case p_chart_type
    when 'month_status' then
      select jsonb_agg(
        jsonb_build_object('month', month, 'status', status, 'amount', amount)
      )
      into result
      from (
        select d.month::text, coalesce(lower(d.status), 'unknown')::text as status, sum(d.amount)::numeric as amount
        from partners.donor_forecasts_summary_view d
        group by d.month, d.status
        order by d.month, d.status
      ) sub;

    when 'transfer_state' then
      select jsonb_agg(
        jsonb_build_object(
          'transfer_method', transfer_method,
          'state_name', state_name,
          'amount', amount
        )
      )
      into result
      from (
        select
          coalesce(d.transfer_method, 'Unknown')::text as transfer_method,
          coalesce(d.state_name, 'Unknown')::text as state_name,
          sum(d.amount)::numeric as amount
        from partners.donor_forecasts_summary_view d
        group by d.transfer_method, d.state_name
        order by d.transfer_method, d.state_name
      ) sub;

    else
      return jsonb_build_object(
        'error', 'Unknown chart type: ' || coalesce(p_chart_type, 'null'),
        'allowed', array['month_status', 'transfer_state']
      );
  end case;

  return coalesce(result, '[]'::jsonb);
exception when others then
  return jsonb_build_object('error', sqlerrm, 'detail', sqlstate);
end;
$$;
*/
