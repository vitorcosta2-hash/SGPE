-- =============================================================================
-- Migration 04: views de consulta e funções de relatório
-- =============================================================================
-- Todas as views usam security_invoker = true: o RLS das tabelas de origem é
-- aplicado com as permissões de quem consulta. As funções de relatório também
-- são SECURITY INVOKER (padrão), então não vazam dados entre empresas.
-- =============================================================================

create view public.categories_overview with (security_invoker = true) as
select c.id, c.company_id, c.name, c.description, c.created_at, c.updated_at,
       (select count(*) from public.products p
         where p.company_id = c.company_id and p.category_id = c.id) as product_count
from public.categories c;

-- Produtos com categoria, situação do estoque e preço efetivo (considerando promoção ativa hoje).
create view public.products_overview with (security_invoker = true) as
select p.id, p.company_id, p.category_id, c.name as category_name,
       p.name, p.sku, p.barcode, p.description, p.unit,
       p.cost_price, p.sale_price, p.stock_quantity, p.min_stock, p.is_active,
       p.created_at, p.updated_at,
       case
         when p.stock_quantity <= 0 then 'out'
         when p.stock_quantity <= p.min_stock then 'low'
         else 'ok'
       end as stock_status,
       round(p.stock_quantity * p.cost_price, 2) as stock_value,
       promo.promotion_id,
       promo.promotion_name,
       coalesce(promo.price, p.sale_price) as effective_price
from public.products p
join public.categories c on c.company_id = p.company_id and c.id = p.category_id
join public.companies co on co.id = p.company_id
left join lateral (
  select pr.id as promotion_id,
         pr.name as promotion_name,
         private.promo_price(pr.discount_type, pr.discount_value, p.sale_price) as price
  from public.promotions pr
  join public.promotion_products pp on pp.promotion_id = pr.id
  where pp.product_id = p.id
    and pr.ended_at is null
    and (now() at time zone co.timezone)::date between pr.starts_on and pr.ends_on
  order by 3 asc, pr.created_at asc
  limit 1
) promo on true;

create view public.stock_movements_detailed with (security_invoker = true) as
select m.id, m.seq, m.company_id, m.product_id,
       p.name as product_name, p.sku as product_sku, p.unit as product_unit,
       m.type, m.quantity, m.balance_before, m.balance_after, m.reason,
       m.sale_id, s.sale_number,
       m.created_by, m.created_by_name, m.created_at
from public.stock_movements m
join public.products p on p.company_id = m.company_id and p.id = m.product_id
left join public.sales s on s.company_id = m.company_id and s.id = m.sale_id;

create view public.sales_overview with (security_invoker = true) as
select s.id, s.company_id, s.sale_number, s.customer_id, c.name as customer_name,
       s.payment_method, s.status, s.subtotal, s.discount_total, s.total, s.notes,
       s.created_by_name, s.created_at,
       s.cancelled_at, s.cancelled_by_name, s.cancel_reason,
       (select count(*) from public.sale_items i where i.sale_id = s.id) as items_count
from public.sales s
left join public.customers c on c.company_id = s.company_id and c.id = s.customer_id;

create view public.promotions_overview with (security_invoker = true) as
select pr.id, pr.company_id, pr.name, pr.discount_type, pr.discount_value,
       pr.starts_on, pr.ends_on, pr.ended_at, pr.created_at,
       case
         when pr.ended_at is not null or t.today > pr.ends_on then 'ended'
         when t.today < pr.starts_on then 'scheduled'
         else 'active'
       end as status,
       (select count(*) from public.promotion_products pp where pp.promotion_id = pr.id) as product_count
from public.promotions pr
join public.companies co on co.id = pr.company_id
cross join lateral (select (now() at time zone co.timezone)::date as today) t;

create view public.promotion_products_detailed with (security_invoker = true) as
select pp.company_id, pp.promotion_id, pp.product_id,
       p.name as product_name, p.sku as product_sku, p.unit as product_unit,
       p.sale_price, p.is_active
from public.promotion_products pp
join public.products p on p.company_id = pp.company_id and p.id = pp.product_id;

revoke all on public.categories_overview, public.products_overview, public.stock_movements_detailed,
  public.sales_overview, public.promotions_overview, public.promotion_products_detailed
  from anon, authenticated;
grant select on public.categories_overview, public.products_overview, public.stock_movements_detailed,
  public.sales_overview, public.promotions_overview, public.promotion_products_detailed
  to authenticated;

-- ---------------------------------------------------------------------------
-- Relatórios (agregações no banco; respeitam RLS)
-- ---------------------------------------------------------------------------
create function public.report_stock_summary(p_company_id uuid) returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'total_products',  count(*),
    'active_products', count(*) filter (where p.is_active),
    'low_stock',       count(*) filter (where p.is_active and p.stock_quantity > 0 and p.stock_quantity <= p.min_stock),
    'out_of_stock',    count(*) filter (where p.is_active and p.stock_quantity <= 0),
    'stock_value',     coalesce(sum(round(p.stock_quantity * p.cost_price, 2)), 0)
  )
  from public.products p
  where p.company_id = p_company_id;
$$;

create function public.report_movements_summary(
  p_company_id uuid,
  p_from       date,
  p_to         date,
  p_product_id uuid default null
) returns jsonb
language sql stable set search_path = ''
as $$
  with tz as (select co.timezone from public.companies co where co.id = p_company_id)
  select coalesce(jsonb_agg(jsonb_build_object('type', g.type, 'count', g.cnt, 'quantity', g.qty) order by g.type), '[]'::jsonb)
  from (
    select m.type, count(*) as cnt, sum(m.quantity) as qty
    from public.stock_movements m, tz
    where m.company_id = p_company_id
      and m.created_at >= (p_from::timestamp at time zone tz.timezone)
      and m.created_at <  ((p_to + 1)::timestamp at time zone tz.timezone)
      and (p_product_id is null or m.product_id = p_product_id)
    group by m.type
  ) g;
$$;

-- Faturamento bruto das vendas concluídas (NÃO é lucro líquido: não considera
-- despesas, impostos nem taxas). Vendas canceladas são totalizadas à parte.
create function public.report_sales_summary(p_company_id uuid, p_from date, p_to date) returns jsonb
language sql stable set search_path = ''
as $$
  with tz as (select co.timezone from public.companies co where co.id = p_company_id),
  s as (
    select sl.* from public.sales sl, tz
    where sl.company_id = p_company_id
      and sl.created_at >= (p_from::timestamp at time zone tz.timezone)
      and sl.created_at <  ((p_to + 1)::timestamp at time zone tz.timezone)
  )
  select jsonb_build_object(
    'completed_count', (select count(*) from s where s.status = 'completed'),
    'completed_total', (select coalesce(sum(s.total), 0) from s where s.status = 'completed'),
    'discount_total',  (select coalesce(sum(s.discount_total), 0) from s where s.status = 'completed'),
    'cancelled_count', (select count(*) from s where s.status = 'cancelled'),
    'cancelled_total', (select coalesce(sum(s.total), 0) from s where s.status = 'cancelled'),
    'by_payment', (
      select coalesce(jsonb_agg(jsonb_build_object('method', x.payment_method, 'count', x.cnt, 'total', x.total) order by x.total desc), '[]'::jsonb)
      from (
        select s.payment_method, count(*) as cnt, sum(s.total) as total
        from s where s.status = 'completed' group by s.payment_method
      ) x
    ),
    'top_products', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'product_id', y.product_id, 'name', y.name, 'sku', y.sku,
               'unit', y.unit, 'quantity', y.qty, 'total', y.total) order by y.qty desc, y.total desc), '[]'::jsonb)
      from (
        select i.product_id, max(i.product_name) as name, max(i.product_sku) as sku, max(i.unit) as unit,
               sum(i.quantity) as qty, sum(i.line_total) as total
        from public.sale_items i
        join s on s.id = i.sale_id and s.status = 'completed'
        group by i.product_id
        order by sum(i.quantity) desc, sum(i.line_total) desc
        limit 10
      ) y
    )
  );
$$;

revoke all on function public.report_stock_summary(uuid) from public, anon;
revoke all on function public.report_movements_summary(uuid, date, date, uuid) from public, anon;
revoke all on function public.report_sales_summary(uuid, date, date) from public, anon;
grant execute on function public.report_stock_summary(uuid) to authenticated;
grant execute on function public.report_movements_summary(uuid, date, date, uuid) to authenticated;
grant execute on function public.report_sales_summary(uuid, date, date) to authenticated;
