import { sanitizeSearch } from "@/lib/search";
import type { AppContext } from "@/lib/auth/session";
import type { SupplierRow } from "@/types/db";

const COLUMNS = "id, company_id, name, phone, email, notes, product_count, created_at, updated_at";

export async function listSuppliers(ctx: AppContext, search?: string): Promise<SupplierRow[]> {
  let query = ctx.supabase
    .from("suppliers_overview")
    .select(COLUMNS)
    .eq("company_id", ctx.company.id)
    .order("name", { ascending: true })
    .limit(500);
  const term = sanitizeSearch(search);
  if (term) query = query.ilike("name", `%${term}%`);
  const { data } = await query;
  return (data ?? []) as SupplierRow[];
}

export async function getSupplier(ctx: AppContext, id: string): Promise<SupplierRow | null> {
  const { data } = await ctx.supabase
    .from("suppliers_overview")
    .select(COLUMNS)
    .eq("company_id", ctx.company.id)
    .eq("id", id)
    .maybeSingle();
  return (data as SupplierRow | null) ?? null;
}

/** Fornecedores para campos de seleção. */
export async function listSupplierOptions(ctx: AppContext): Promise<{ id: string; name: string }[]> {
  const { data } = await ctx.supabase
    .from("suppliers")
    .select("id, name")
    .eq("company_id", ctx.company.id)
    .order("name", { ascending: true })
    .limit(500);
  return (data ?? []) as { id: string; name: string }[];
}
