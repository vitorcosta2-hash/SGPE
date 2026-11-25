import { cache } from "react";
import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Company, CompanyRole, Profile } from "@/types/db";

export interface AppContext {
  supabase: SupabaseClient;
  user: Pick<User, "id" | "email">;
  profile: Profile;
  company: Company;
  role: CompanyRole;
}

/**
 * Usuário autenticado, validado no servidor de autenticação do Supabase
 * (getUser), e não apenas decodificado do cookie.
 */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
});

const COMPANY_COLUMNS =
  "id, name, contact_email, contact_phone, currency, timezone, default_min_stock, min_margin_percent, created_at";

/** Usuário + perfil + empresa ativa (a primeira à qual pertence). Retorna null se não houver empresa. */
export const getAppContext = cache(async (): Promise<AppContext | null | "no-company"> => {
  const user = await getUser();
  if (!user) return null;

  const supabase = await createClient();

  const { data: memberships } = await supabase
    .from("company_members")
    .select("company_id, role, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);

  const membership = memberships?.[0] as { company_id: string; role: CompanyRole } | undefined;
  if (!membership) return "no-company";

  const [{ data: company }, { data: profile }] = await Promise.all([
    supabase.from("companies").select(COMPANY_COLUMNS).eq("id", membership.company_id).maybeSingle(),
    supabase.from("profiles").select("id, full_name").eq("id", user.id).maybeSingle(),
  ]);
  if (!company) return "no-company";

  return {
    supabase,
    user: { id: user.id, email: user.email },
    profile: (profile as Profile | null) ?? { id: user.id, full_name: "" },
    company: company as Company,
    role: membership.role,
  };
});

/** Garante usuário logado com empresa; caso contrário redireciona. */
export async function requireAppContext(): Promise<AppContext> {
  const ctx = await getAppContext();
  if (ctx === null) redirect("/entrar");
  if (ctx === "no-company") redirect("/empresa/nova");
  return ctx;
}

/** Apenas proprietário/gerente (ex.: cancelar venda). */
export function canManage(role: CompanyRole): boolean {
  return role === "owner" || role === "manager";
}
