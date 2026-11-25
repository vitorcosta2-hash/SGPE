-- =============================================================================
-- SGPE — Resultado real de uma promoção
-- =============================================================================
-- Soma apenas vendas CONCLUÍDAS cujos itens foram vendidos com a promoção
-- (sale_items.promotion_id). Lucro = receita − custo gravado na venda.
-- "Desconto concedido" = (preço cadastrado − preço aplicado) × quantidade.
-- SECURITY INVOKER: o RLS de vendas e itens limita tudo à empresa de quem consulta.
-- =============================================================================
create function public.report_promotion_results(p_company_id uuid, p_promotion_id uuid) returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'sales_count',      count(distinct s.id),
    'units',            coalesce(sum(i.quantity), 0),
    'revenue',          coalesce(sum(i.line_total), 0),
    'cost',             coalesce(sum(round(i.quantity * i.unit_cost, 2)), 0),
    'profit',           coalesce(sum(i.line_total), 0) - coalesce(sum(round(i.quantity * i.unit_cost, 2)), 0),
    'discount_given',   coalesce(sum(round(i.quantity * (i.base_price - i.unit_price), 2)), 0),
    'by_product', coalesce((
      select jsonb_agg(jsonb_build_object(
               'product_id', x.product_id, 'name', x.name, 'unit', x.unit,
               'quantity', x.qty, 'revenue', x.revenue, 'profit', x.profit) order by x.qty desc, x.name)
      from (
        select i2.product_id, max(i2.product_name) as name, max(i2.unit) as unit,
               sum(i2.quantity) as qty, sum(i2.line_total) as revenue,
               sum(i2.line_total) - sum(round(i2.quantity * i2.unit_cost, 2)) as profit
        from public.sale_items i2
        join public.sales s2 on s2.id = i2.sale_id and s2.company_id = i2.company_id and s2.status = 'completed'
        where i2.company_id = p_company_id and i2.promotion_id = p_promotion_id
        group by i2.product_id
      ) x
    ), '[]'::jsonb)
  )
  from public.sale_items i
  join public.sales s on s.id = i.sale_id and s.company_id = i.company_id and s.status = 'completed'
  where i.company_id = p_company_id and i.promotion_id = p_promotion_id;
$$;

revoke all on function public.report_promotion_results(uuid, uuid) from public, anon;
grant execute on function public.report_promotion_results(uuid, uuid) to authenticated;
