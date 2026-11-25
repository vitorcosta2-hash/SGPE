-- =============================================================================
-- Migration 05: criação automática de perfil (e da primeira empresa) no cadastro
-- =============================================================================
-- No cadastro, a aplicação envia full_name e company_name em
-- raw_user_meta_data. O gatilho cria perfil, empresa, vínculo de proprietário
-- e a categoria padrão "Geral" na mesma transação do Supabase Auth. Funciona
-- mesmo quando a confirmação de e-mail está ativa (o usuário ainda não tem sessão).
-- Os metadados só dão nome à PRÓPRIA empresa nova; não concedem acesso a nada existente.
-- =============================================================================

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_company_id   uuid;
  v_company_name text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'company_name', '')), '');
  v_full_name    text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
begin
  insert into public.profiles (id, full_name)
  values (new.id, left(coalesce(v_full_name, split_part(coalesce(new.email, ''), '@', 1)), 120));

  if v_company_name is not null then
    insert into public.companies (name, created_by)
    values (left(v_company_name, 120), new.id)
    returning id into v_company_id;

    insert into public.company_members (company_id, user_id, role)
    values (v_company_id, new.id, 'owner');

    insert into public.categories (company_id, name) values (v_company_id, 'Geral');
  end if;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
