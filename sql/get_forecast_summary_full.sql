-- Run in Supabase SQL Editor.
-- Full flexible RPC for charts from partners.donor_forecasts_summary_view.
-- Call: supabase.rpc('get_forecast_summary') or .rpc('get_forecast_summary', { p_chart_type: 'month_status' }) or .rpc('get_forecast_summary', { p_chart_type: 'transfer_state' }).

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

    else
      return jsonb_build_object(
        'error', 'Unknown chart type: ' || coalesce(p_chart_type, 'null'),
        'allowed', array['month_status', 'transfer_state']
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
  'Charts from partners.donor_forecasts_summary_view. p_chart_type: month_status (default), transfer_state (Sankey).';
