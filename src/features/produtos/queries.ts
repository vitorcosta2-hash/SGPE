import type { AppContext } from "@/lib/auth/session";
import { PAGE_SIZE, pageRange, sanitizeSearch } from "@/lib/search";
import type { MovementRow, ProductRow } from "@/types/db";

export const PRODUCT_SORTS = {
  nome: { column: "name", ascending: true, label: "Nome (A–Z)" },
  codigo: { column: "sku", ascending: true, label: "Código (SKU)" },
  estoque_asc: { column: "stock_quantity", ascending: true, label: "Menor estoque" },
  estoque_desc: { column: "stock_quantity", ascending: false, label: "Maior estoque" },
  preco_asc: { column: "sale_price", ascending: true, label: "Menor preço" },
  preco_desc: { column: "sale_price", ascending: false, label: "Maior preço" },
  recentes: { column: "created_at", ascending: false, label: "Mais recentes" },
} as const;
export type ProductSort = keyof typeof PRODUCT_SORTS;

export interface ProductFilters {
  q?: string;
  categoria?: string;
  fornecedor?: string;
  estoque?: string;
  status?: string;
  ordem?: string;
  page: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string | undefined | null): v is string => !!v && UUID.test(v);

export async function listProducts(ctx: AppContext, filters: ProductFilters): Promise<{ rows: ProductRow[]; total: number }> {
  let query = ctx.supabase.from("products_overview").select("*", { count: "exact" }).eq("company_id", ctx.company.id);

  const term = sanitizeSearch(filters.q);
  if (term) query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%,barcode.ilike.%${term}%`);
  if (isUuid(filters.categoria)) query = query.eq("category_id", filters.categoria);
  if (isUuid(filters.fornecedor)) query = query.eq("supplier_id", filters.fornecedor);
  if (filters.estoque === "ok" || filters.estoque === "low" || filters.estoque === "out") query = query.eq("stock_status", filters.estoque);
  if (filters.status === "ativos") query = query.eq("is_active", true);
  if (filters.status === "inativos") query = query.eq("is_active", false);

  const sort = PRODUCT_SORTS[(filters.ordem as ProductSort) in PRODUCT_SORTS ? (filters.ordem as ProductSort) : "nome"];
  query = query.order(sort.column, { ascending: sort.ascending }).order("id", { ascending: true });

  const { from, to } = pageRange(filters.page, PAGE_SIZE);
  const { data, count } = await query.range(from, to);
  return { rows: (data ?? []) as ProductRow[], total: count ?? 0 };
}

export async function getProduct(ctx: AppContext, id: string): Promise<ProductRow | null> {
  if (!isUuid(id)) return null;
  const { data } = await ctx.supabase.from("products_overview").select("*").eq("company_id", ctx.company.id).eq("id", id).maybeSingle();
  return (data as ProductRow | null) ?? null;
}

export async function listProductMovements(ctx: AppContext, productId: string, limit = 15): Promise<MovementRow[]> {
  const { data } = await ctx.supabase
    .from("stock_movements_detailed")
    .select("*")
    .eq("company_id", ctx.company.id)
    .eq("product_id", productId)
    .order("seq", { ascending: false })
    .limit(limit);
  return (data ?? []) as MovementRow[];
}

/** Produtos ativos para campos de seleção (negócios pequenos: até 1000 itens). */
export async function listActiveProductOptions(ctx: AppContext): Promise<Pick<ProductRow, "id" | "name" | "sku" | "unit" | "stock_quantity">[]> {
  const { data } = await ctx.supabase
    .from("products")
    .select("id, name, sku, unit, stock_quantity")
    .eq("company_id", ctx.company.id)
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(1000);
  return (data ?? []) as Pick<ProductRow, "id" | "name" | "sku" | "unit" | "stock_quantity">[];
}
