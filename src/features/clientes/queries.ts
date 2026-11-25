import type { AppContext } from "@/lib/auth/session";
import { isUuid } from "@/features/produtos/queries";
import { PAGE_SIZE, pageRange, sanitizeSearch } from "@/lib/search";
import type { CustomerRow } from "@/types/db";

export async function listCustomers(ctx: AppContext, q: string | undefined, page: number): Promise<{ rows: CustomerRow[]; total: number }> {
  let query = ctx.supabase.from("customers").select("*", { count: "exact" }).eq("company_id", ctx.company.id);
  const term = sanitizeSearch(q);
  if (term) query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`);
  const { from, to } = pageRange(page, PAGE_SIZE);
  const { data, count } = await query.order("name", { ascending: true }).range(from, to);
  return { rows: (data ?? []) as CustomerRow[], total: count ?? 0 };
}

export async function getCustomer(ctx: AppContext, id: string): Promise<CustomerRow | null> {
  if (!isUuid(id)) return null;
  const { data } = await ctx.supabase.from("customers").select("*").eq("company_id", ctx.company.id).eq("id", id).maybeSingle();
  return (data as CustomerRow | null) ?? null;
}

export async function listCustomerOptions(ctx: AppContext): Promise<{ id: string; name: string }[]> {
  const { data } = await ctx.supabase.from("customers").select("id, name").eq("company_id", ctx.company.id).order("name").limit(1000);
  return (data ?? []) as { id: string; name: string }[];
}
