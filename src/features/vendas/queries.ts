import { isUuid } from "@/features/produtos/queries";
import type { AppContext } from "@/lib/auth/session";
import { localRangeIso } from "@/lib/domain/dates";
import { PAGE_SIZE, pageRange } from "@/lib/search";
import type { SaleItemRow, SaleRow } from "@/types/db";

export interface SaleFilters {
  from: string;
  to: string;
  status?: string;
  pagamento?: string;
  cliente?: string;
  numero?: string;
  page: number;
}

export async function listSales(ctx: AppContext, f: SaleFilters): Promise<{ rows: SaleRow[]; total: number }> {
  const { start, endExclusive } = localRangeIso(f.from, f.to, ctx.company.timezone);
  let query = ctx.supabase
    .from("sales_overview")
    .select("*", { count: "exact" })
    .eq("company_id", ctx.company.id)
    .gte("created_at", start)
    .lt("created_at", endExclusive);

  if (f.status === "completed" || f.status === "cancelled") query = query.eq("status", f.status);
  if (["cash", "pix", "credit_card", "debit_card", "other"].includes(f.pagamento ?? "")) query = query.eq("payment_method", f.pagamento!);
  if (isUuid(f.cliente)) query = query.eq("customer_id", f.cliente);
  const number = Number.parseInt(f.numero ?? "", 10);
  if (Number.isFinite(number) && number > 0) query = query.eq("sale_number", number);

  const { from, to } = pageRange(f.page, PAGE_SIZE);
  const { data, count } = await query.order("sale_number", { ascending: false }).range(from, to);
  return { rows: (data ?? []) as SaleRow[], total: count ?? 0 };
}

export async function getSale(ctx: AppContext, id: string): Promise<{ sale: SaleRow; items: SaleItemRow[] } | null> {
  if (!isUuid(id)) return null;
  const { data: sale } = await ctx.supabase.from("sales_overview").select("*").eq("company_id", ctx.company.id).eq("id", id).maybeSingle();
  if (!sale) return null;
  const { data: items } = await ctx.supabase
    .from("sale_items")
    .select("id, sale_id, product_id, product_name, product_sku, unit, quantity, base_price, unit_price, discount, line_total, promotion_id")
    .eq("company_id", ctx.company.id)
    .eq("sale_id", id)
    .order("product_name", { ascending: true });
  return { sale: sale as SaleRow, items: (items ?? []) as SaleItemRow[] };
}
