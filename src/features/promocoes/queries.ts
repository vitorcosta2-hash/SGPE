import { isUuid } from "@/features/produtos/queries";
import type { AppContext } from "@/lib/auth/session";
import type { PromotionProductRow, PromotionResults, PromotionRow } from "@/types/db";

export async function listPromotions(ctx: AppContext, status?: string): Promise<PromotionRow[]> {
  let query = ctx.supabase.from("promotions_overview").select("*").eq("company_id", ctx.company.id);
  if (status === "scheduled" || status === "active" || status === "ended") query = query.eq("status", status);
  const { data } = await query.order("starts_on", { ascending: false }).limit(200);
  return (data ?? []) as PromotionRow[];
}

export async function getPromotion(ctx: AppContext, id: string): Promise<{ promotion: PromotionRow; products: PromotionProductRow[] } | null> {
  if (!isUuid(id)) return null;
  const { data: promotion } = await ctx.supabase.from("promotions_overview").select("*").eq("company_id", ctx.company.id).eq("id", id).maybeSingle();
  if (!promotion) return null;
  const { data: products } = await ctx.supabase
    .from("promotion_products_detailed")
    .select("*")
    .eq("company_id", ctx.company.id)
    .eq("promotion_id", id)
    .order("product_name", { ascending: true });
  return { promotion: promotion as PromotionRow, products: (products ?? []) as PromotionProductRow[] };
}

const EMPTY_RESULTS: PromotionResults = { sales_count: 0, units: 0, revenue: 0, cost: 0, profit: 0, discount_given: 0, by_product: [] };

export async function getPromotionResults(ctx: AppContext, promotionId: string): Promise<PromotionResults> {
  const { data } = await ctx.supabase.rpc("report_promotion_results", { p_company_id: ctx.company.id, p_promotion_id: promotionId });
  return (data as PromotionResults | null) ?? EMPTY_RESULTS;
}

/** Custo cadastrado dos produtos (para estimar lucro e margem durante a promoção). */
export async function getProductCosts(ctx: AppContext, productIds: string[]): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const { data } = await ctx.supabase
    .from("products")
    .select("id, cost_price")
    .eq("company_id", ctx.company.id)
    .in("id", productIds);
  return new Map(((data ?? []) as { id: string; cost_price: number }[]).map((p) => [p.id, p.cost_price]));
}
