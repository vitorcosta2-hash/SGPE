-- =============================================================================
-- Migration 03: regras de negócio no banco (atômicas, com bloqueio de linhas)
-- =============================================================================
-- Códigos de erro (SQLSTATE) usados pela aplicação:
--   SG001 saldo insuficiente         SG005 dado inválido
--   SG003 produto inativo            SG006 registro não encontrado
--   SG004 venda já cancelada         SG007 venda sem itens
--   SG008 registro imutável          42501 sem permissão
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Auxiliares internos (schema private: não expostos pela API)
-- ---------------------------------------------------------------------------
create function private.is_integer_unit(p_unit text) returns boolean
language sql immutable set search_path = ''
as $$ select p_unit in ('un', 'cx', 'pct', 'par') $$;

-- Preço promocional. Nunca ultrapassa o preço base nem fica negativo.
create function private.promo_price(p_type public.discount_type, p_value numeric, p_base numeric) returns numeric
language sql immutable set search_path = ''
as $$
  select least(
    p_base,
    greatest(
      0::numeric,
      case p_type
        when 'percentage'  then round(p_base * (1 - p_value / 100), 2)
        when 'amount_off'  then p_base - p_value
        when 'fixed_price' then p_value
      end
    )
  );
$$;
revoke all on function private.is_integer_unit(text) from public;
revoke all on function private.promo_price(public.discount_type, numeric, numeric) from public;
grant execute on function private.is_integer_unit(text) to authenticated;
grant execute on function private.promo_price(public.discount_type, numeric, numeric) to authenticated;

create function private.assert_member(p_company_id uuid) returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.company_members m
    where m.company_id = p_company_id and m.user_id = auth.uid()
  ) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;
end;
$$;

create function private.assert_role(p_company_id uuid, p_roles public.company_role[]) returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.company_members m
    where m.company_id = p_company_id and m.user_id = auth.uid() and m.role = any (p_roles)
  ) then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;
end;
$$;

create function private.user_display_name(p_user_id uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(nullif(btrim(p.full_name), ''), 'Usuário')
  from public.profiles p where p.id = p_user_id;
$$;

-- Serializa chamadas concorrentes com a mesma chave de idempotência.
create function private.lock_idempotency(p_company_id uuid, p_key text) returns void
language sql set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':' || p_key, 0));
$$;

revoke all on function private.assert_member(uuid) from public;
revoke all on function private.assert_role(uuid, public.company_role[]) from public;
revoke all on function private.user_display_name(uuid) from public;
revoke all on function private.lock_idempotency(uuid, text) from public;

-- Único ponto que altera o saldo: trava o produto, valida, atualiza o saldo e
-- grava a movimentação na mesma transação.
create function private.apply_stock_movement(
  p_company_id      uuid,
  p_product_id      uuid,
  p_type            public.stock_movement_type,
  p_quantity        numeric,
  p_reason          text,
  p_sale_id         uuid,
  p_idempotency_key text,
  p_user_id         uuid,
  p_user_name       text
) returns public.stock_movements
language plpgsql set search_path = ''
as $$
declare
  v_prod public.products;
  v_new  numeric(14,3);
  v_row  public.stock_movements;
begin
  if p_quantity is null or p_quantity <= 0 or p_quantity <> round(p_quantity, 3) then
    raise exception 'invalid_quantity' using errcode = 'SG005',
      detail = 'A quantidade deve ser maior que zero, com no máximo 3 casas decimais.';
  end if;

  select * into v_prod from public.products
  where id = p_product_id and company_id = p_company_id
  for update;
  if not found then
    raise exception 'product_not_found' using errcode = 'SG006';
  end if;

  if private.is_integer_unit(v_prod.unit) and p_quantity <> trunc(p_quantity) then
    raise exception 'invalid_quantity' using errcode = 'SG005',
      detail = 'Esta unidade de medida não aceita quantidades fracionadas.';
  end if;

  v_new := v_prod.stock_quantity + case
    when p_type in ('initial', 'entry', 'adjust_in', 'sale_reversal') then p_quantity
    else -p_quantity
  end;

  if v_new < 0 then
    raise exception 'insufficient_stock' using errcode = 'SG001',
      detail = format('%s|%s|%s', v_prod.name, v_prod.stock_quantity, p_quantity);
  end if;

  update public.products set stock_quantity = v_new where id = v_prod.id;

  insert into public.stock_movements (
    company_id, product_id, type, quantity, balance_before, balance_after,
    reason, sale_id, idempotency_key, created_by, created_by_name
  ) values (
    p_company_id, p_product_id, p_type, p_quantity, v_prod.stock_quantity, v_new,
    p_reason, p_sale_id, p_idempotency_key, p_user_id, p_user_name
  ) returning * into v_row;

  return v_row;
end;
$$;
revoke all on function private.apply_stock_movement(uuid, uuid, public.stock_movement_type, numeric, text, uuid, text, uuid, text) from public;

-- ---------------------------------------------------------------------------
-- Empresa
-- ---------------------------------------------------------------------------
create function public.create_company(p_name text) returns public.companies
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_company public.companies;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_name is null or char_length(btrim(p_name)) < 2 or char_length(btrim(p_name)) > 120 then
    raise exception 'invalid_company_name' using errcode = 'SG005';
  end if;
  if (select count(*) from public.company_members m where m.user_id = v_uid) >= 5 then
    raise exception 'company_limit' using errcode = 'SG005';
  end if;

  insert into public.companies (name, created_by) values (btrim(p_name), v_uid)
  returning * into v_company;
  insert into public.company_members (company_id, user_id, role) values (v_company.id, v_uid, 'owner');
  insert into public.categories (company_id, name) values (v_company.id, 'Geral');
  return v_company;
end;
$$;

-- ---------------------------------------------------------------------------
-- Produtos e estoque
-- ---------------------------------------------------------------------------
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
  p_idempotency_key text default null
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

  insert into public.products (
    company_id, category_id, name, sku, barcode, description, unit,
    cost_price, sale_price, min_stock, is_active
  ) values (
    p_company_id, p_category_id, btrim(p_name), nullif(btrim(coalesce(p_sku, '')), ''),
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

create function public.register_stock_movement(
  p_company_id      uuid,
  p_product_id      uuid,
  p_type            public.stock_movement_type,
  p_quantity        numeric,
  p_reason          text default null,
  p_idempotency_key text default null
) returns public.stock_movements
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_row    public.stock_movements;
begin
  perform private.assert_member(p_company_id);

  if p_type not in ('entry', 'manual_exit', 'adjust_in', 'adjust_out') then
    raise exception 'invalid_movement_type' using errcode = 'SG005',
      detail = 'Tipo de movimentação não permitido para registro manual.';
  end if;
  if p_type in ('manual_exit', 'adjust_in', 'adjust_out') and (v_reason is null or char_length(v_reason) < 3) then
    raise exception 'reason_required' using errcode = 'SG005',
      detail = 'Informe o motivo da movimentação.';
  end if;
  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'invalid_reason' using errcode = 'SG005';
  end if;

  if p_idempotency_key is not null then
    perform private.lock_idempotency(p_company_id, p_idempotency_key);
    select * into v_row from public.stock_movements
    where company_id = p_company_id and idempotency_key = p_idempotency_key;
    if found then
      return v_row;
    end if;
  end if;

  return private.apply_stock_movement(
    p_company_id, p_product_id, p_type, p_quantity, v_reason, null,
    p_idempotency_key, v_uid, private.user_display_name(v_uid)
  );
end;
$$;

-- Contagem de inventário: informa-se o saldo contado e o banco calcula a diferença
-- sob bloqueio da linha (evita ajuste calculado sobre saldo desatualizado).
create function public.register_inventory_count(
  p_company_id      uuid,
  p_product_id      uuid,
  p_counted         numeric,
  p_reason          text default null,
  p_idempotency_key text default null
) returns public.stock_movements
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_reason  text := coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Contagem de inventário');
  v_current numeric(14,3);
  v_row     public.stock_movements;
begin
  perform private.assert_member(p_company_id);

  if p_counted is null or p_counted < 0 or p_counted <> round(p_counted, 3) then
    raise exception 'invalid_quantity' using errcode = 'SG005';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'invalid_reason' using errcode = 'SG005';
  end if;

  if p_idempotency_key is not null then
    perform private.lock_idempotency(p_company_id, p_idempotency_key);
    select * into v_row from public.stock_movements
    where company_id = p_company_id and idempotency_key = p_idempotency_key;
    if found then
      return v_row;
    end if;
  end if;

  select stock_quantity into v_current from public.products
  where id = p_product_id and company_id = p_company_id
  for update;
  if not found then
    raise exception 'product_not_found' using errcode = 'SG006';
  end if;

  if p_counted = v_current then
    raise exception 'no_difference' using errcode = 'SG005',
      detail = 'A quantidade contada é igual ao saldo atual.';
  end if;

  return private.apply_stock_movement(
    p_company_id, p_product_id,
    case when p_counted > v_current then 'adjust_in'::public.stock_movement_type else 'adjust_out'::public.stock_movement_type end,
    abs(p_counted - v_current), v_reason, null, p_idempotency_key, v_uid, private.user_display_name(v_uid)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Vendas
-- ---------------------------------------------------------------------------
create function public.register_sale(
  p_company_id      uuid,
  p_customer_id     uuid,
  p_payment_method  public.payment_method,
  p_items           jsonb,
  p_notes           text default null,
  p_idempotency_key text default null
) returns public.sales
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_user_name  text;
  v_sale       public.sales;
  v_number     bigint;
  v_tz         text;
  v_today      date;
  v_item       record;
  v_prod       public.products;
  v_promo_id   uuid;
  v_promo_price numeric(14,2);
  v_unit_price numeric(14,2);
  v_gross      numeric(14,2);
  v_subtotal   numeric(14,2) := 0;
  v_disc_total numeric(14,2) := 0;
  v_prev_id    uuid;
  v_lines      jsonb := '[]'::jsonb;
  v_line       jsonb;
  v_notes      text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  perform private.assert_member(p_company_id);

  if p_payment_method is null then
    raise exception 'payment_method_required' using errcode = 'SG005';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_sale' using errcode = 'SG007';
  end if;
  if jsonb_array_length(p_items) > 200 then
    raise exception 'too_many_items' using errcode = 'SG005';
  end if;
  if v_notes is not null and char_length(v_notes) > 500 then
    raise exception 'invalid_notes' using errcode = 'SG005';
  end if;

  if p_idempotency_key is not null then
    perform private.lock_idempotency(p_company_id, p_idempotency_key);
    select * into v_sale from public.sales
    where company_id = p_company_id and idempotency_key = p_idempotency_key;
    if found then
      return v_sale;
    end if;
  end if;

  if p_customer_id is not null and not exists (
    select 1 from public.customers c where c.id = p_customer_id and c.company_id = p_company_id
  ) then
    raise exception 'customer_not_found' using errcode = 'SG006';
  end if;

  select c.timezone into v_tz from public.companies c where c.id = p_company_id;
  v_today := (now() at time zone v_tz)::date;
  v_user_name := private.user_display_name(v_uid);

  -- Passo 1: trava os produtos em ordem fixa (evita deadlock), valida e precifica NO SERVIDOR.
  -- O cliente informa apenas produto, quantidade e desconto; preço e totais nunca vêm do navegador.
  begin
    for v_item in
      select (e.value ->> 'product_id')::uuid as product_id,
             (e.value ->> 'quantity')::numeric as quantity,
             coalesce((e.value ->> 'discount')::numeric, 0) as discount
      from jsonb_array_elements(p_items) as e(value)
      order by 1
    loop
      if v_item.product_id is null or v_item.product_id is not distinct from v_prev_id then
        raise exception 'invalid_items' using errcode = 'SG005',
          detail = 'Itens inválidos ou repetidos na venda.';
      end if;
      v_prev_id := v_item.product_id;

      if v_item.quantity is null or v_item.quantity <= 0 or v_item.quantity <> round(v_item.quantity, 3) then
        raise exception 'invalid_quantity' using errcode = 'SG005';
      end if;
      if v_item.discount < 0 or v_item.discount <> round(v_item.discount, 2) then
        raise exception 'invalid_discount' using errcode = 'SG005';
      end if;

      select * into v_prod from public.products
      where id = v_item.product_id and company_id = p_company_id
      for update;
      if not found then
        raise exception 'product_not_found' using errcode = 'SG006';
      end if;
      if not v_prod.is_active then
        raise exception 'product_inactive' using errcode = 'SG003', detail = v_prod.name;
      end if;
      if private.is_integer_unit(v_prod.unit) and v_item.quantity <> trunc(v_item.quantity) then
        raise exception 'invalid_quantity' using errcode = 'SG005',
          detail = format('%s não aceita quantidade fracionada.', v_prod.name);
      end if;
      if v_prod.stock_quantity < v_item.quantity then
        raise exception 'insufficient_stock' using errcode = 'SG001',
          detail = format('%s|%s|%s', v_prod.name, v_prod.stock_quantity, v_item.quantity);
      end if;

      -- Melhor promoção ativa hoje (fuso da empresa): a de menor preço final.
      v_promo_id := null;
      v_promo_price := null;
      select pr.id, private.promo_price(pr.discount_type, pr.discount_value, v_prod.sale_price)
        into v_promo_id, v_promo_price
      from public.promotions pr
      join public.promotion_products pp on pp.promotion_id = pr.id
      where pp.product_id = v_prod.id
        and pr.company_id = p_company_id
        and pr.ended_at is null
        and v_today between pr.starts_on and pr.ends_on
      order by 2 asc, pr.created_at asc
      limit 1;

      if v_promo_id is not null and v_promo_price < v_prod.sale_price then
        v_unit_price := v_promo_price;
      else
        v_unit_price := v_prod.sale_price;
        v_promo_id := null;
      end if;

      v_gross := round(v_item.quantity * v_unit_price, 2);
      if v_item.discount > v_gross then
        raise exception 'discount_exceeds_total' using errcode = 'SG005',
          detail = format('O desconto de %s excede o valor do item %s.', v_item.discount, v_prod.name);
      end if;

      v_subtotal := v_subtotal + v_gross;
      v_disc_total := v_disc_total + v_item.discount;
      v_lines := v_lines || jsonb_build_object(
        'product_id', v_prod.id,
        'product_name', v_prod.name,
        'product_sku', v_prod.sku,
        'unit', v_prod.unit,
        'quantity', v_item.quantity,
        'base_price', v_prod.sale_price,
        'unit_price', v_unit_price,
        'unit_cost', v_prod.cost_price,
        'discount', v_item.discount,
        'line_total', v_gross - v_item.discount,
        'promotion_id', v_promo_id
      );
    end loop;
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'invalid_items' using errcode = 'SG005',
        detail = 'Itens inválidos na venda.';
  end;

  -- Passo 2: número sequencial, venda, itens e baixa de estoque.
  update public.company_counters
     set last_sale_number = last_sale_number + 1
   where company_id = p_company_id
  returning last_sale_number into v_number;

  insert into public.sales (
    company_id, sale_number, customer_id, payment_method, status,
    subtotal, discount_total, total, notes,
    created_by, created_by_name, idempotency_key
  ) values (
    p_company_id, v_number, p_customer_id, p_payment_method, 'completed',
    v_subtotal, v_disc_total, v_subtotal - v_disc_total, v_notes,
    v_uid, v_user_name, p_idempotency_key
  ) returning * into v_sale;

  for v_line in select value from jsonb_array_elements(v_lines)
  loop
    insert into public.sale_items (
      company_id, sale_id, product_id, product_name, product_sku, unit,
      quantity, base_price, unit_price, unit_cost, discount, line_total, promotion_id
    ) values (
      p_company_id, v_sale.id, (v_line ->> 'product_id')::uuid, v_line ->> 'product_name',
      v_line ->> 'product_sku', v_line ->> 'unit',
      (v_line ->> 'quantity')::numeric, (v_line ->> 'base_price')::numeric,
      (v_line ->> 'unit_price')::numeric, (v_line ->> 'unit_cost')::numeric,
      (v_line ->> 'discount')::numeric, (v_line ->> 'line_total')::numeric,
      nullif(v_line ->> 'promotion_id', '')::uuid
    );

    perform private.apply_stock_movement(
      p_company_id, (v_line ->> 'product_id')::uuid, 'sale_exit',
      (v_line ->> 'quantity')::numeric, format('Venda #%s', v_number), v_sale.id,
      null, v_uid, v_user_name
    );
  end loop;

  return v_sale;
end;
$$;

create function public.cancel_sale(
  p_company_id uuid,
  p_sale_id    uuid,
  p_reason     text default null
) returns public.sales
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_user_name text;
  v_sale      public.sales;
  v_item      record;
  v_reason    text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform private.assert_role(p_company_id, array['owner', 'manager']::public.company_role[]);

  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'invalid_reason' using errcode = 'SG005';
  end if;

  select * into v_sale from public.sales
  where id = p_sale_id and company_id = p_company_id
  for update;
  if not found then
    raise exception 'sale_not_found' using errcode = 'SG006';
  end if;
  if v_sale.status = 'cancelled' then
    raise exception 'sale_already_cancelled' using errcode = 'SG004';
  end if;

  v_user_name := private.user_display_name(v_uid);

  for v_item in
    select si.product_id, si.quantity
    from public.sale_items si
    where si.sale_id = v_sale.id
    order by si.product_id
  loop
    perform private.apply_stock_movement(
      p_company_id, v_item.product_id, 'sale_reversal', v_item.quantity,
      format('Estorno da venda #%s', v_sale.sale_number), v_sale.id, null, v_uid, v_user_name
    );
  end loop;

  update public.sales
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = v_uid,
         cancelled_by_name = v_user_name,
         cancel_reason = v_reason
   where id = v_sale.id
  returning * into v_sale;

  return v_sale;
end;
$$;

-- ---------------------------------------------------------------------------
-- Promoções
-- ---------------------------------------------------------------------------
create function public.save_promotion(
  p_company_id     uuid,
  p_promotion_id   uuid,
  p_name           text,
  p_discount_type  public.discount_type,
  p_discount_value numeric,
  p_starts_on      date,
  p_ends_on        date,
  p_product_ids    uuid[]
) returns public.promotions
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_promo public.promotions;
  v_ids   uuid[];
  v_today date;
begin
  perform private.assert_member(p_company_id);

  if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on then
    raise exception 'invalid_period' using errcode = 'SG005',
      detail = 'A data de término deve ser igual ou posterior à data de início.';
  end if;

  select coalesce(array_agg(distinct x), array[]::uuid[]) into v_ids from unnest(p_product_ids) as t(x);
  if cardinality(v_ids) = 0 then
    raise exception 'no_products' using errcode = 'SG005',
      detail = 'Selecione ao menos um produto para a promoção.';
  end if;
  if cardinality(v_ids) > 200 then
    raise exception 'too_many_items' using errcode = 'SG005';
  end if;
  if (select count(*) from public.products p where p.company_id = p_company_id and p.id = any (v_ids)) <> cardinality(v_ids) then
    raise exception 'product_not_found' using errcode = 'SG006';
  end if;

  if p_promotion_id is null then
    insert into public.promotions (
      company_id, name, discount_type, discount_value, starts_on, ends_on, created_by
    ) values (
      p_company_id, btrim(p_name), p_discount_type, p_discount_value, p_starts_on, p_ends_on, v_uid
    ) returning * into v_promo;
  else
    select * into v_promo from public.promotions
    where id = p_promotion_id and company_id = p_company_id
    for update;
    if not found then
      raise exception 'promotion_not_found' using errcode = 'SG006';
    end if;
    select (now() at time zone c.timezone)::date into v_today from public.companies c where c.id = p_company_id;
    if v_promo.ended_at is not null or v_promo.ends_on < v_today then
      raise exception 'promotion_ended' using errcode = 'SG005',
        detail = 'Promoções encerradas não podem ser editadas.';
    end if;

    update public.promotions
       set name = btrim(p_name), discount_type = p_discount_type, discount_value = p_discount_value,
           starts_on = p_starts_on, ends_on = p_ends_on
     where id = v_promo.id
    returning * into v_promo;
    delete from public.promotion_products where promotion_id = v_promo.id;
  end if;

  insert into public.promotion_products (company_id, promotion_id, product_id)
  select p_company_id, v_promo.id, x from unnest(v_ids) as t(x);

  return v_promo;
end;
$$;

create function public.end_promotion(p_company_id uuid, p_promotion_id uuid) returns public.promotions
language plpgsql security definer set search_path = ''
as $$
declare
  v_promo public.promotions;
begin
  perform private.assert_member(p_company_id);

  select * into v_promo from public.promotions
  where id = p_promotion_id and company_id = p_company_id
  for update;
  if not found then
    raise exception 'promotion_not_found' using errcode = 'SG006';
  end if;
  if v_promo.ended_at is not null then
    return v_promo;  -- idempotente
  end if;

  update public.promotions set ended_at = now(), ended_by = auth.uid()
   where id = v_promo.id
  returning * into v_promo;
  return v_promo;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões de execução: somente usuários autenticados
-- ---------------------------------------------------------------------------
revoke all on function public.create_company(text) from public, anon;
revoke all on function public.create_product(uuid, text, uuid, text, text, text, text, numeric, numeric, numeric, numeric, boolean, text) from public, anon;
revoke all on function public.register_stock_movement(uuid, uuid, public.stock_movement_type, numeric, text, text) from public, anon;
revoke all on function public.register_inventory_count(uuid, uuid, numeric, text, text) from public, anon;
revoke all on function public.register_sale(uuid, uuid, public.payment_method, jsonb, text, text) from public, anon;
revoke all on function public.cancel_sale(uuid, uuid, text) from public, anon;
revoke all on function public.save_promotion(uuid, uuid, text, public.discount_type, numeric, date, date, uuid[]) from public, anon;
revoke all on function public.end_promotion(uuid, uuid) from public, anon;

grant execute on function public.create_company(text) to authenticated;
grant execute on function public.create_product(uuid, text, uuid, text, text, text, text, numeric, numeric, numeric, numeric, boolean, text) to authenticated;
grant execute on function public.register_stock_movement(uuid, uuid, public.stock_movement_type, numeric, text, text) to authenticated;
grant execute on function public.register_inventory_count(uuid, uuid, numeric, text, text) to authenticated;
grant execute on function public.register_sale(uuid, uuid, public.payment_method, jsonb, text, text) to authenticated;
grant execute on function public.cancel_sale(uuid, uuid, text) to authenticated;
grant execute on function public.save_promotion(uuid, uuid, text, public.discount_type, numeric, date, date, uuid[]) to authenticated;
grant execute on function public.end_promotion(uuid, uuid) to authenticated;
