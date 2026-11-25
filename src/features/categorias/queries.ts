import { sanitizeSearch } from "@/lib/search";
import type { AppContext } from "@/lib/auth/session";
import type { CategoryRow } from "@/types/db";

export async function listCategories(ctx: AppContext, search?: string): Promise<CategoryRow[]> {
  let query = ctx.supabase
    .from("categories_overview")
    .select("id, company_id, name, description, product_count, created_at, updated_at")
    .eq("company_id", ctx.company.id)
    .order("name", { ascending: true })
    .limit(500);

  const term = sanitizeSearch(search);
  if (term) query = query.ilike("name", `%${term}%`);

  const { data } = await query;
  return (data ?? []) as CategoryRow[];
}

export async function getCategory(ctx: AppContext, id: string): Promise<CategoryRow | null> {
  const { data } = await ctx.supabase
    .from("categories_overview")
    .select("id, company_id, name, description, product_count, created_at, updated_at")
    .eq("company_id", ctx.company.id)
    .eq("id", id)
    .maybeSingle();
  return (data as CategoryRow | null) ?? null;
}

/** Categorias para campos de seleção. */
export async function listCategoryOptions(ctx: AppContext): Promise<{ id: string; name: string }[]> {
  const { data } = await ctx.supabase
    .from("categories")
    .select("id, name")
    .eq("company_id", ctx.company.id)
    .order("name", { ascending: true })
    .limit(500);
  return (data ?? []) as { id: string; name: string }[];
}
