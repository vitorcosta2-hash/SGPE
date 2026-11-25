-- =============================================================================
-- Migration 02: funções auxiliares de autorização, privilégios e RLS
-- =============================================================================
-- Modelo de segurança:
--   * "anon" não acessa nenhuma tabela.
--   * "authenticated" só lê/escreve linhas de empresas das quais é membro (RLS).
--   * Saldo de estoque, movimentações, vendas e itens NÃO podem ser escritos
--     diretamente: apenas pelas funções da migration 03 (SECURITY DEFINER),
--     que validam tudo no servidor.
--   * Nenhuma chave service_role é usada pela aplicação.
-- =============================================================================

grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Funções de autorização (SECURITY DEFINER evita recursão de RLS)
-- ---------------------------------------------------------------------------
create function private.is_company_member(p_company_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.company_members m
    where m.company_id = p_company_id and m.user_id = (select auth.uid())
  );
$$;

create function private.has_company_role(p_company_id uuid, p_roles public.company_role[]) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.company_members m
    where m.company_id = p_company_id
      and m.user_id = (select auth.uid())
      and m.role = any (p_roles)
  );
$$;

create function private.shares_company_with(p_user_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.company_members a
    join public.company_members b on b.company_id = a.company_id
    where a.user_id = p_user_id and b.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_company_member(uuid) from public;
revoke all on function private.has_company_role(uuid, public.company_role[]) from public;
revoke all on function private.shares_company_with(uuid) from public;
grant execute on function private.is_company_member(uuid) to authenticated;
grant execute on function private.has_company_role(uuid, public.company_role[]) to authenticated;
grant execute on function private.shares_company_with(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Privilégios: parte do zero e concede apenas o necessário
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

grant select on public.companies, public.company_members, public.profiles, public.categories,
  public.products, public.stock_movements, public.customers, public.sales, public.sale_items,
  public.promotions, public.promotion_products
  to authenticated;

-- Empresa: apenas configurações editáveis (o dono é validado na política).
grant update (name, contact_email, contact_phone, currency, timezone, default_min_stock, min_margin_percent)
  on public.companies to authenticated;

grant update (full_name) on public.profiles to authenticated;

grant insert (company_id, name, description), update (name, description), delete
  on public.categories to authenticated;

-- Produtos: criação via função create_product; o saldo (stock_quantity) nunca é gravável.
grant update (category_id, name, sku, barcode, description, unit, cost_price, sale_price, min_stock, is_active)
  on public.products to authenticated;

grant insert (company_id, name, phone, email, notes), update (name, phone, email, notes)
  on public.customers to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.companies          enable row level security;
alter table public.company_counters   enable row level security;  -- sem políticas: ninguém acessa
alter table public.company_members    enable row level security;
alter table public.profiles           enable row level security;
alter table public.categories         enable row level security;
alter table public.products           enable row level security;
alter table public.stock_movements    enable row level security;
alter table public.customers          enable row level security;
alter table public.sales              enable row level security;
alter table public.sale_items         enable row level security;
alter table public.promotions         enable row level security;
alter table public.promotion_products enable row level security;

-- Empresas
create policy companies_select on public.companies for select to authenticated
  using (private.is_company_member(id));
create policy companies_update on public.companies for update to authenticated
  using (private.has_company_role(id, array['owner']::public.company_role[]))
  with check (private.has_company_role(id, array['owner']::public.company_role[]));

-- Vínculos (somente leitura; criados por funções)
create policy company_members_select on public.company_members for select to authenticated
  using (private.is_company_member(company_id));

-- Perfis
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_company_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Categorias
create policy categories_select on public.categories for select to authenticated
  using (private.is_company_member(company_id));
create policy categories_insert on public.categories for insert to authenticated
  with check (private.is_company_member(company_id));
create policy categories_update on public.categories for update to authenticated
  using (private.is_company_member(company_id))
  with check (private.is_company_member(company_id));
create policy categories_delete on public.categories for delete to authenticated
  using (private.is_company_member(company_id));

-- Produtos
create policy products_select on public.products for select to authenticated
  using (private.is_company_member(company_id));
create policy products_update on public.products for update to authenticated
  using (private.is_company_member(company_id))
  with check (private.is_company_member(company_id));

-- Movimentações, vendas e itens: somente leitura
create policy stock_movements_select on public.stock_movements for select to authenticated
  using (private.is_company_member(company_id));
create policy sales_select on public.sales for select to authenticated
  using (private.is_company_member(company_id));
create policy sale_items_select on public.sale_items for select to authenticated
  using (private.is_company_member(company_id));

-- Clientes
create policy customers_select on public.customers for select to authenticated
  using (private.is_company_member(company_id));
create policy customers_insert on public.customers for insert to authenticated
  with check (private.is_company_member(company_id));
create policy customers_update on public.customers for update to authenticated
  using (private.is_company_member(company_id))
  with check (private.is_company_member(company_id));

-- Promoções (escrita via funções save_promotion / end_promotion)
create policy promotions_select on public.promotions for select to authenticated
  using (private.is_company_member(company_id));
create policy promotion_products_select on public.promotion_products for select to authenticated
  using (private.is_company_member(company_id));
