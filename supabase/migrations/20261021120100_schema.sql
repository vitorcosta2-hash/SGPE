-- =============================================================================
-- SGPE - Sistema de Gerenciamento Web para Pequenas Empresas
-- Migration 01: tipos, tabelas, restrições, índices e gatilhos de integridade
-- =============================================================================
-- Convenções:
--   * Toda tabela de negócio possui company_id (isolamento multiempresa).
--   * Chaves estrangeiras entre tabelas de negócio são COMPOSTAS
--     (company_id, id): um registro nunca referencia dados de outra empresa.
--   * Valores monetários: numeric(14,2). Quantidades: numeric(14,3).
--   * O saldo de estoque (products.stock_quantity) só muda por funções do banco
--     (ver migration 03); movimentações e itens de venda são imutáveis.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.company_role as enum ('owner', 'manager', 'staff');

create type public.stock_movement_type as enum (
  'initial',      -- estoque inicial (cadastro do produto)
  'entry',        -- entrada de mercadoria
  'manual_exit',  -- saída manual
  'adjust_in',    -- ajuste positivo de inventário
  'adjust_out',   -- ajuste negativo de inventário
  'sale_exit',    -- saída por venda
  'sale_reversal' -- estorno por cancelamento de venda
);

create type public.payment_method as enum ('cash', 'pix', 'credit_card', 'debit_card', 'other');
create type public.sale_status as enum ('completed', 'cancelled');
create type public.discount_type as enum ('percentage', 'amount_off', 'fixed_price');

-- ---------------------------------------------------------------------------
-- Gatilho genérico de updated_at
-- ---------------------------------------------------------------------------
create function private.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Empresas, perfis e vínculos
-- ---------------------------------------------------------------------------
create table public.companies (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (char_length(btrim(name)) between 2 and 120),
  contact_email      text check (contact_email is null or (char_length(contact_email) <= 254 and position('@' in contact_email) > 1)),
  contact_phone      text check (contact_phone is null or char_length(contact_phone) <= 30),
  currency           char(3) not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  timezone           text not null default 'America/Sao_Paulo',
  default_min_stock  numeric(14,3) not null default 0 check (default_min_stock >= 0),
  -- Margem mínima (sobre o preço de venda) usada como alerta na precificação.
  min_margin_percent numeric(5,2) not null default 10 check (min_margin_percent >= 0 and min_margin_percent < 100),
  created_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create function private.validate_company_timezone() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.timezone) then
    raise exception 'invalid_timezone' using errcode = 'SG005';
  end if;
  return new;
end;
$$;

create trigger companies_validate_timezone
  before insert or update of timezone on public.companies
  for each row execute function private.validate_company_timezone();
create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function private.set_updated_at();

-- Contador sequencial de vendas por empresa (sem lacunas, protegido por lock de linha).
create table public.company_counters (
  company_id       uuid primary key references public.companies (id) on delete cascade,
  last_sale_number bigint not null default 0 check (last_sale_number >= 0)
);

create function private.create_company_counter() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.company_counters (company_id) values (new.id);
  return new;
end;
$$;

create trigger companies_create_counter
  after insert on public.companies
  for each row execute function private.create_company_counter();

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default '' check (char_length(full_name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create table public.company_members (
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       public.company_role not null default 'staff',
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);
create index company_members_user_idx on public.company_members (user_id);

-- ---------------------------------------------------------------------------
-- Categorias
-- ---------------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  description text check (description is null or char_length(description) <= 300),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, id)
);
create unique index categories_company_name_uq on public.categories (company_id, lower(btrim(name)));
create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Produtos
-- ---------------------------------------------------------------------------
create table public.products (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies (id) on delete cascade,
  category_id    uuid not null,
  name           text not null check (char_length(btrim(name)) between 1 and 150),
  sku            text check (sku is null or char_length(btrim(sku)) between 1 and 60),
  barcode        text check (barcode is null or char_length(btrim(barcode)) between 1 and 60),
  description    text check (description is null or char_length(description) <= 1000),
  unit           text not null default 'un' check (unit in ('un', 'kg', 'g', 'l', 'ml', 'm', 'cx', 'pct', 'par')),
  cost_price     numeric(14,2) not null default 0 check (cost_price >= 0),
  sale_price     numeric(14,2) not null default 0 check (sale_price >= 0),
  stock_quantity numeric(14,3) not null default 0 check (stock_quantity >= 0),
  min_stock      numeric(14,3) not null default 0 check (min_stock >= 0),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, category_id) references public.categories (company_id, id) on delete restrict
);
create unique index products_company_sku_uq on public.products (company_id, lower(btrim(sku))) where sku is not null;
create unique index products_company_barcode_uq on public.products (company_id, lower(btrim(barcode))) where barcode is not null;
create index products_company_name_idx on public.products (company_id, lower(name));
create index products_company_category_idx on public.products (company_id, category_id);
create trigger products_set_updated_at
  before update on public.products
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------------
create table public.customers (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 120),
  phone      text check (phone is null or char_length(phone) <= 30),
  email      text check (email is null or (char_length(email) <= 254 and position('@' in email) > 1)),
  notes      text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);
create index customers_company_name_idx on public.customers (company_id, lower(name));
create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Promoções
-- ---------------------------------------------------------------------------
create table public.promotions (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies (id) on delete cascade,
  name           text not null check (char_length(btrim(name)) between 1 and 120),
  discount_type  public.discount_type not null,
  discount_value numeric(14,2) not null check (discount_value > 0),
  starts_on      date not null,
  ends_on        date not null,
  ended_at       timestamptz,
  ended_by       uuid references auth.users (id) on delete set null,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (ends_on >= starts_on),
  check (discount_type <> 'percentage' or discount_value < 100),
  unique (company_id, id)
);
create index promotions_company_period_idx on public.promotions (company_id, starts_on, ends_on);
create trigger promotions_set_updated_at
  before update on public.promotions
  for each row execute function private.set_updated_at();

create table public.promotion_products (
  company_id   uuid not null,
  promotion_id uuid not null,
  product_id   uuid not null,
  primary key (promotion_id, product_id),
  foreign key (company_id, promotion_id) references public.promotions (company_id, id) on delete cascade,
  foreign key (company_id, product_id) references public.products (company_id, id) on delete cascade
);
create index promotion_products_product_idx on public.promotion_products (product_id);

-- ---------------------------------------------------------------------------
-- Vendas
-- ---------------------------------------------------------------------------
create table public.sales (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies (id) on delete cascade,
  sale_number       bigint not null check (sale_number > 0),
  customer_id       uuid,
  payment_method    public.payment_method not null,
  status            public.sale_status not null default 'completed',
  subtotal          numeric(14,2) not null check (subtotal >= 0),
  discount_total    numeric(14,2) not null default 0 check (discount_total >= 0),
  total             numeric(14,2) not null check (total >= 0),
  notes             text check (notes is null or char_length(notes) <= 500),
  created_by        uuid references auth.users (id) on delete set null,
  created_by_name   text,
  created_at        timestamptz not null default now(),
  cancelled_at      timestamptz,
  cancelled_by      uuid references auth.users (id) on delete set null,
  cancelled_by_name text,
  cancel_reason     text check (cancel_reason is null or char_length(cancel_reason) <= 500),
  idempotency_key   text check (idempotency_key is null or char_length(idempotency_key) between 8 and 100),
  constraint sales_total_consistent check (total = subtotal - discount_total),
  constraint sales_cancel_consistent check ((status = 'cancelled') = (cancelled_at is not null)),
  unique (company_id, id),
  unique (company_id, sale_number),
  foreign key (company_id, customer_id) references public.customers (company_id, id) on delete restrict
);
create unique index sales_company_idempotency_uq on public.sales (company_id, idempotency_key) where idempotency_key is not null;
create index sales_company_created_idx on public.sales (company_id, created_at desc);
create index sales_company_customer_idx on public.sales (company_id, customer_id);

create table public.sale_items (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null,
  sale_id      uuid not null,
  product_id   uuid not null,
  product_name text not null,
  product_sku  text,
  unit         text not null,
  quantity     numeric(14,3) not null check (quantity > 0),
  base_price   numeric(14,2) not null check (base_price >= 0),  -- preço cadastrado
  unit_price   numeric(14,2) not null check (unit_price >= 0),  -- preço aplicado (após promoção)
  unit_cost    numeric(14,2) not null check (unit_cost >= 0),   -- custo cadastrado no momento
  discount     numeric(14,2) not null default 0 check (discount >= 0),
  line_total   numeric(14,2) not null check (line_total >= 0),
  promotion_id uuid,
  constraint sale_items_total_consistent check (line_total = round(quantity * unit_price, 2) - discount),
  foreign key (company_id, sale_id) references public.sales (company_id, id) on delete cascade,
  foreign key (company_id, product_id) references public.products (company_id, id) on delete restrict,
  foreign key (company_id, promotion_id) references public.promotions (company_id, id) on delete set null (promotion_id)
);
create index sale_items_sale_idx on public.sale_items (sale_id);
create index sale_items_company_product_idx on public.sale_items (company_id, product_id);

-- ---------------------------------------------------------------------------
-- Movimentações de estoque (histórico imutável)
-- ---------------------------------------------------------------------------
create table public.stock_movements (
  id              uuid primary key default gen_random_uuid(),
  -- Ordem total de gravação. Como cada movimentação é gravada depois de travar a
  -- linha do produto, a ordem de "seq" reproduz exatamente a cadeia de saldos.
  seq             bigint generated always as identity,
  company_id      uuid not null,
  product_id      uuid not null,
  type            public.stock_movement_type not null,
  quantity        numeric(14,3) not null check (quantity > 0),
  balance_before  numeric(14,3) not null check (balance_before >= 0),
  balance_after   numeric(14,3) not null check (balance_after >= 0),
  reason          text check (reason is null or char_length(reason) <= 500),
  sale_id         uuid,
  idempotency_key text check (idempotency_key is null or char_length(idempotency_key) between 8 and 100),
  created_by      uuid references auth.users (id) on delete set null,
  created_by_name text,
  created_at      timestamptz not null default clock_timestamp(),
  constraint stock_movements_balance_consistent check (
    balance_after = balance_before + case
      when type in ('initial', 'entry', 'adjust_in', 'sale_reversal') then quantity
      else -quantity
    end
  ),
  constraint stock_movements_sale_ref check ((type in ('sale_exit', 'sale_reversal')) = (sale_id is not null)),
  foreign key (company_id, product_id) references public.products (company_id, id) on delete restrict,
  foreign key (company_id, sale_id) references public.sales (company_id, id) on delete restrict
    deferrable initially deferred
);
create unique index stock_movements_company_idempotency_uq on public.stock_movements (company_id, idempotency_key) where idempotency_key is not null;
create index stock_movements_company_created_idx on public.stock_movements (company_id, created_at desc, seq desc);
create index stock_movements_company_product_idx on public.stock_movements (company_id, product_id, seq desc);
create index stock_movements_sale_idx on public.stock_movements (sale_id) where sale_id is not null;

-- ---------------------------------------------------------------------------
-- Imutabilidade do histórico
-- ---------------------------------------------------------------------------
create function private.forbid_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'immutable_record' using
    errcode = 'SG008',
    detail = format('Registros de %s não podem ser alterados ou apagados. Registre um ajuste ou estorno.', tg_table_name);
end;
$$;

create trigger stock_movements_immutable
  before update or delete on public.stock_movements
  for each row execute function private.forbid_change();
create trigger sale_items_immutable
  before update or delete on public.sale_items
  for each row execute function private.forbid_change();

-- Venda: só pode transitar de "completed" para "cancelled", uma única vez.
create function private.guard_sale_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'immutable_record' using errcode = 'SG008',
      detail = 'Vendas não podem ser apagadas. Cancele a venda para estornar o estoque.';
  end if;

  if old.status = 'cancelled' then
    raise exception 'sale_already_cancelled' using errcode = 'SG004';
  end if;

  if (new.company_id, new.sale_number, new.customer_id, new.payment_method, new.subtotal,
      new.discount_total, new.total, new.notes, new.created_by, new.created_by_name,
      new.created_at, new.idempotency_key)
     is distinct from
     (old.company_id, old.sale_number, old.customer_id, old.payment_method, old.subtotal,
      old.discount_total, old.total, old.notes, old.created_by, old.created_by_name,
      old.created_at, old.idempotency_key)
  then
    raise exception 'immutable_record' using errcode = 'SG008',
      detail = 'Uma venda concluída não pode ser editada.';
  end if;

  if new.status <> 'cancelled' then
    raise exception 'immutable_record' using errcode = 'SG008',
      detail = 'A única alteração permitida em uma venda é o cancelamento.';
  end if;

  return new;
end;
$$;

create trigger sales_guard_change
  before update or delete on public.sales
  for each row execute function private.guard_sale_change();

-- Produto: a unidade de medida não muda depois que existe histórico.
create function private.guard_product_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.unit is distinct from old.unit and exists (
    select 1 from public.stock_movements m where m.product_id = old.id
  ) then
    raise exception 'unit_locked' using errcode = 'SG005',
      detail = 'A unidade de medida não pode ser alterada depois que o produto tem movimentações.';
  end if;
  return new;
end;
$$;

create trigger products_guard_change
  before update on public.products
  for each row execute function private.guard_product_change();
