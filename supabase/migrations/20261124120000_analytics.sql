-- =============================================================================
-- SGPE — Indicadores gerenciais (dashboard e relatórios de lucratividade)
-- =============================================================================
-- Todas as funções são SECURITY INVOKER: o RLS das tabelas de origem é aplicado
-- com as permissões de quem consulta, então nenhuma delas vaza dados entre empresas.
--
-- Lucro estimado = receita das vendas concluídas − custo das mercadorias vendidas.
--   * receita  = soma de sale_items.line_total (já com descontos e promoções);
--   * custo    = soma de round(quantidade × unit_cost, 2), usando o custo gravado
--                NO MOMENTO da venda (alterar o custo depois não reescreve o passado);
--   * margem   = lucro ÷ receita.
-- É uma estimativa de lucro bruto: não considera impostos, taxas nem despesas fixas.
-- Vendas canceladas ficam de fora de todos os valores.
-- =============================================================================

-- Limite de janela: evita varreduras gigantes e séries diárias enormes.
create function private.assert_report_range(p_from date, p_to date) returns void
language plpgsql immutable set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_to < p_from or (p_to - p_from) > 731 then
    raise exception 'invalid_report_range' using errcode = 'SG005',
      detail = 'Informe um período válido de, no máximo, dois anos.';
  end if;
end;
$$;
revoke all on function private.assert_report_range(date, date) from public;
grant execute on function private.assert_report_range(date, date) to authenticated;

-- Totais do período (um único objeto).
create function public.report_period_metrics(p_company_id uuid, p_from date, p_to date) returns jsonb
language plpgsql stable set search_path = ''
as $$
declare
  v_tz text;
  v_result jsonb;
begin
  perform private.assert_report_range(p_from, p_to);
  select co.timezone into v_tz from public.companies co where co.id = p_company_id;
  if v_tz is null then
    return jsonb_build_object('sales_count', 0, 'revenue', 0, 'discounts', 0, 'cost', 0, 'profit', 0,
      'margin_percent', null, 'avg_ticket', 0, 'units_sold', 0, 'cancelled_count', 0);
  end if;

  with s as (
    select sl.id, sl.status, sl.total, sl.discount_total
    from public.sales sl
    where sl.company_id = p_company_id
      and sl.created_at >= (p_from::timestamp at time zone v_tz)
      and sl.created_at <  ((p_to + 1)::timestamp at time zone v_tz)
  ),
  items as (
    select coalesce(sum(i.line_total), 0) as revenue,
           coalesce(sum(round(i.quantity * i.unit_cost, 2)), 0) as cost,
           coalesce(sum(i.quantity), 0) as units
    from public.sale_items i
    join s on s.id = i.sale_id and s.status = 'completed'
    where i.company_id = p_company_id
  ),
  agg as (
    select count(*) filter (where s.status = 'completed') as sales_count,
           count(*) filter (where s.status = 'cancelled') as cancelled_count,
           coalesce(sum(s.discount_total) filter (where s.status = 'completed'), 0) as discounts
    from s
  )
  select jsonb_build_object(
    'sales_count',     agg.sales_count,
    'revenue',         items.revenue,
    'discounts',       agg.discounts,
    'cost',            items.cost,
    'profit',          items.revenue - items.cost,
    'margin_percent',  case when items.revenue > 0
                         then round((items.revenue - items.cost) / items.revenue * 100, 2) end,
    'avg_ticket',      case when agg.sales_count > 0 then round(items.revenue / agg.sales_count, 2) else 0 end,
    'units_sold',      items.units,
    'cancelled_count', agg.cancelled_count
  )
  into v_result
  from agg, items;

  return v_result;
end;
$$;

-- Série diária (um ponto por dia local, inclusive dias sem venda).
create function public.report_sales_daily(p_company_id uuid, p_from date, p_to date) returns jsonb
language plpgsql stable set search_path = ''
as $$
declare
  v_tz text;
  v_result jsonb;
begin
  perform private.assert_report_range(p_from, p_to);
  select co.timezone into v_tz from public.companies co where co.id = p_company_id;
  if v_tz is null then
    return '[]'::jsonb;
  end if;

  with days as (
    select d::date as day from generate_series(p_from, p_to, interval '1 day') d
  ),
  per_sale as (
    select (sl.created_at at time zone v_tz)::date as day,
           sl.id as sale_id,
           coalesce(sum(i.line_total), 0) as revenue,
           coalesce(sum(round(i.quantity * i.unit_cost, 2)), 0) as cost
    from public.sales sl
    left join public.sale_items i on i.sale_id = sl.id and i.company_id = sl.company_id
    where sl.company_id = p_company_id
      and sl.status = 'completed'
      and sl.created_at >= (p_from::timestamp at time zone v_tz)
      and sl.created_at <  ((p_to + 1)::timestamp at time zone v_tz)
    group by 1, 2
  ),
  per_day as (
    select ps.day, count(*) as sales_count, sum(ps.revenue) as revenue, sum(ps.cost) as cost
    from per_sale ps group by ps.day
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'day',     to_char(days.day, 'YYYY-MM-DD'),
           'count',   coalesce(pd.sales_count, 0),
           'revenue', coalesce(pd.revenue, 0),
           'profit',  coalesce(pd.revenue, 0) - coalesce(pd.cost, 0)
         ) order by days.day), '[]'::jsonb)
  into v_result
  from days
  left join per_day pd on pd.day = days.day;

  return v_result;
end;
$$;

-- Lucratividade por produto. p_order: 'quantity' | 'revenue' | 'profit' | 'margin'.
create function public.report_product_profitability(
  p_company_id uuid,
  p_from       date,
  p_to         date,
  p_limit      integer default 10,
  p_order      text default 'quantity'
) returns jsonb
language plpgsql stable set search_path = ''
as $$
declare
  v_tz text;
  v_result jsonb;
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 200);
begin
  perform private.assert_report_range(p_from, p_to);
  if p_order not in ('quantity', 'revenue', 'profit', 'margin') then
    raise exception 'invalid_order' using errcode = 'SG005';
  end if;
  select co.timezone into v_tz from public.companies co where co.id = p_company_id;
  if v_tz is null then
    return '[]'::jsonb;
  end if;

  with agg as (
    select i.product_id,
           max(i.product_name) as name,
           max(i.product_sku) as sku,
           max(i.unit) as unit,
           sum(i.quantity) as quantity,
           sum(i.line_total) as revenue,
           sum(round(i.quantity * i.unit_cost, 2)) as cost
    from public.sale_items i
    join public.sales sl on sl.id = i.sale_id and sl.company_id = i.company_id
    where i.company_id = p_company_id
      and sl.status = 'completed'
      and sl.created_at >= (p_from::timestamp at time zone v_tz)
      and sl.created_at <  ((p_to + 1)::timestamp at time zone v_tz)
    group by i.product_id
  ),
  ranked as (
    select a.*,
           a.revenue - a.cost as profit,
           case when a.revenue > 0 then round((a.revenue - a.cost) / a.revenue * 100, 2) end as margin_percent
    from agg a
    order by case p_order
               when 'quantity' then a.quantity
               when 'revenue'  then a.revenue
               when 'profit'   then a.revenue - a.cost
               when 'margin'   then coalesce((a.revenue - a.cost) / nullif(a.revenue, 0), -1)
             end desc,
             a.revenue desc, a.name asc
    limit v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'product_id', r.product_id, 'name', r.name, 'sku', r.sku, 'unit', r.unit,
           'quantity', r.quantity, 'revenue', r.revenue, 'cost', r.cost,
           'profit', r.profit, 'margin_percent', r.margin_percent
         ) order by case p_order
               when 'quantity' then r.quantity
               when 'revenue'  then r.revenue
               when 'profit'   then r.profit
               when 'margin'   then coalesce(r.margin_percent, -1)
             end desc, r.revenue desc, r.name asc), '[]'::jsonb)
  into v_result
  from ranked r;

  return v_result;
end;
$$;

revoke all on function public.report_period_metrics(uuid, date, date) from public, anon;
revoke all on function public.report_sales_daily(uuid, date, date) from public, anon;
revoke all on function public.report_product_profitability(uuid, date, date, integer, text) from public, anon;
grant execute on function public.report_period_metrics(uuid, date, date) to authenticated;
grant execute on function public.report_sales_daily(uuid, date, date) to authenticated;
grant execute on function public.report_product_profitability(uuid, date, date, integer, text) to authenticated;
