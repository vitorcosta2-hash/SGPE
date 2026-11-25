-- =============================================================================
-- SGPE — Fornecedores (RF13–RF16, RF18, RF24 do levantamento de requisitos)
-- Cadastro de fornecedores por empresa e vínculo opcional produto -> fornecedor.
-- =============================================================================

create table public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  phone       text check (phone is null or char_length(phone) <= 30),
  email       text check (email is null or char_length(email) <= 254),
  notes       text check (notes is null or char_length(notes) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, id)
);
create unique index suppliers_company_name_uq on public.suppliers (company_id, lower(btrim(name)));
create trigger suppliers_set_updated_at
  before update on public.suppliers
  for each row execute function private.set_updated_at();

-- Vínculo opcional; o fornecedor só pode ser excluído sem produtos associados (RESTRICT).
alter table public.products add column supplier_id uuid;
alter table public.products
  add constraint products_supplier_fk
  foreign key (company_id, supplier_id) references public.suppliers (company_id, id) on delete restrict;
create index products_company_supplier_idx on public.products (company_id, supplier_id);

-- Privilégios e RLS (mesmo padrão das categorias). Parte do zero: tabelas novas podem
-- herdar privilégios padrão do Supabase para anon/authenticated.
revoke all on public.suppliers from anon, authenticated;
grant select on public.suppliers to authenticated;
grant insert (company_id, name, phone, email, notes), update (name, phone, email, notes), delete
  on public.suppliers to authenticated;
grant update (supplier_id) on public.products to authenticated;

alter table public.suppliers enable row level security;
create policy suppliers_select on public.suppliers for select to authenticated
  using (private.is_company_member(company_id));
create policy suppliers_insert on public.suppliers for insert to authenticated
  with check (private.is_company_member(company_id));
create policy suppliers_update on public.suppliers for update to authenticated
  using (private.is_company_member(company_id))
  with check (private.is_company_member(company_id));
create policy suppliers_delete on public.suppliers for delete to authenticated
  using (private.is_company_member(company_id));

-- Visão de fornecedores com contagem de produtos
create view public.suppliers_overview with (security_invoker = true) as
select s.id, s.company_id, s.name, s.phone, s.email, s.notes, s.created_at, s.updated_at,
       (select count(*) from public.products p
         where p.company_id = s.company_id and p.supplier_id = s.id) as product_count
from public.suppliers s;

-- Visão de produtos: acrescenta fornecedor ao final (mantém as colunas existentes)
create or replace view public.products_overview with (security_invoker = true) as
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
       coalesce(promo.price, p.sale_price) as effective_price,
       p.supplier_id,
       sup.name as supplier_name
from public.products p
join public.categories c on c.company_id = p.company_id and c.id = p.category_id
join public.companies co on co.id = p.company_id
left join public.suppliers sup on sup.company_id = p.company_id and sup.id = p.supplier_id
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

revoke all on public.suppliers_overview from anon, authenticated;
grant select on public.suppliers_overview to authenticated;

-- create_product: novo parâmetro opcional p_supplier_id (final, com padrão null;
-- chamadas antigas com 13 argumentos continuam válidas).
drop function public.create_product(uuid, text, uuid, text, text, text, text, numeric, numeric, numeric, numeric, boolean, text);
create function public.create_product(
  p_company_id      uuid,
  p_name            text,
  p_category_id     uuid,
  p_sku             text default null,
  p_barcode         text default null,
  p_description     text default null,
  p_unit            text default 'un',
  p_cost_price      numeric default 0,
  p_sale_price      numeric default 0,
  p_min_stock       numeric default 0,
  p_initial_stock   numeric default 0,
  p_is_active       boolean default true,
  p_idempotency_key text default null,
  p_supplier_id     uuid default null
) returns public.products
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_product public.products;
  v_existing public.stock_movements;
begin
  perform private.assert_member(p_company_id);

  if p_initial_stock is null or p_initial_stock < 0 then
    raise exception 'invalid_quantity' using errcode = 'SG005';
  end if;

  if p_idempotency_key is not null then
    perform private.lock_idempotency(p_company_id, p_idempotency_key);
    select * into v_existing from public.stock_movements
    where company_id = p_company_id and idempotency_key = p_idempotency_key;
    if found then
      select * into v_product from public.products where id = v_existing.product_id;
      return v_product;
    end if;
  end if;

  if not exists (select 1 from public.categories c where c.id = p_category_id and c.company_id = p_company_id) then
    raise exception 'category_not_found' using errcode = 'SG006';
  end if;

  if p_supplier_id is not null and not exists (
    select 1 from public.suppliers s where s.id = p_supplier_id and s.company_id = p_company_id
  ) then
    raise exception 'supplier_not_found' using errcode = 'SG006';
  end if;

  insert into public.products (
    company_id, category_id, supplier_id, name, sku, barcode, description, unit,
    cost_price, sale_price, min_stock, is_active
  ) values (
    p_company_id, p_category_id, p_supplier_id, btrim(p_name), nullif(btrim(coalesce(p_sku, '')), ''),
    nullif(btrim(coalesce(p_barcode, '')), ''), nullif(btrim(coalesce(p_description, '')), ''),
    coalesce(p_unit, 'un'), coalesce(p_cost_price, 0), coalesce(p_sale_price, 0),
    coalesce(p_min_stock, 0), coalesce(p_is_active, true)
  ) returning * into v_product;

  if p_initial_stock > 0 then
    perform private.apply_stock_movement(
      p_company_id, v_product.id, 'initial', p_initial_stock, 'Estoque inicial', null,
      p_idempotency_key, v_uid, private.user_display_name(v_uid)
    );
    select * into v_product from public.products where id = v_product.id;
  end if;

  return v_product;
end;
$$;

revoke all on function public.create_product(uuid, text, uuid, text, text, text, text, numeric, numeric, numeric, numeric, boolean, text, uuid) from public, anon;
grant execute on function public.create_product(uuid, text, uuid, text, text, text, text, numeric, numeric, numeric, numeric, boolean, text, uuid) to authenticated;
