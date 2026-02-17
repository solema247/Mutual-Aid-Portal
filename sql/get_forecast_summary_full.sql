-- Run in Supabase SQL Editor.
-- Full flexible RPC for charts from partners.donor_forecasts_summary_view.
-- Call: supabase.rpc('get_forecast_summary') or .rpc('get_forecast_summary', { p_chart_type: 'month_status' })
--       or .rpc('get_forecast_summary', { p_chart_type: 'transfer_state' })
--       or .rpc('get_forecast_summary', { p_chart_type: 'org_transfer_state' })
--       or .rpc('get_forecast_summary', { p_chart_type: 'month_state' }).
--
-- For org_transfer_state the view must expose source. Returns rows: source, transfer_method, state_name, amount.
-- For month_state: returns month, state_name, amount for stacked bar (State-level Support).

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
    -- Chart: rows = month, columns = status, value = sum(amount)
    when 'month_status' then
      select jsonb_agg(
        jsonb_build_object(
          'month',   month,
          'status',  status,
          'amount',  amount
        )
      )
      into result
      from (
        select
          d.month::text as month,
          coalesce(lower(d.status), 'unknown')::text as status,
          sum(d.amount)::numeric as amount
        from partners.donor_forecasts_summary_view d
        group by d.month, d.status
        order by d.month, d.status
      ) sub;

    -- Sankey: origin = transfer_method, destination = state_name, value = amount
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

    -- Sankey 3-level: source -> transfer_method -> state_name
    -- View must expose source. Returns rows: source, transfer_method, state_name, amount.
    when 'org_transfer_state' then
      select jsonb_agg(
        jsonb_build_object(
          'source',          source,
          'transfer_method', transfer_method,
          'state_name',      state_name,
          'amount',          amount
        )
      )
      into result
      from (
        select
          coalesce(d.source, 'Unknown')::text as source,
          coalesce(d.transfer_method, 'Unknown')::text as transfer_method,
          coalesce(d.state_name, 'Unknown')::text as state_name,
          sum(d.amount)::numeric as amount
        from partners.donor_forecasts_summary_view d
        group by d.source, d.transfer_method, d.state_name
        order by d.source, d.transfer_method, d.state_name
      ) sub;

    -- Stacked bar: month, state_name, amount (State-level Support)
    when 'month_state' then
      select jsonb_agg(
        jsonb_build_object(
          'month',      month,
          'state_name', state_name,
          'amount',     amount
        )
      )
      into result
      from (
        select
          d.month::text as month,
          coalesce(d.state_name, 'Unknown')::text as state_name,
          sum(d.amount)::numeric as amount
        from partners.donor_forecasts_summary_view d
        group by d.month, d.state_name
        order by d.month, d.state_name
      ) sub;

    else
      return jsonb_build_object(
        'error', 'Unknown chart type: ' || coalesce(p_chart_type, 'null'),
        'allowed', array['month_status', 'transfer_state', 'org_transfer_state', 'month_state']
      );
  end case;

  return coalesce(result, '[]'::jsonb);
exception when others then
  return jsonb_build_object(
    'error', sqlerrm,
    'detail', sqlstate
  );
end;
$$;

comment on function public.get_forecast_summary(text) is
  'Charts from partners.donor_forecasts_summary_view. p_chart_type: month_status (default), transfer_state (2-level Sankey), org_transfer_state (3-level Sankey), month_state (State-level Support stacked bar).';
