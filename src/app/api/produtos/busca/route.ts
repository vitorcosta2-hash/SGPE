import { NextResponse, type NextRequest } from "next/server";
import { getAppContext } from "@/lib/auth/session";
import { sanitizeSearch } from "@/lib/search";

export const dynamic = "force-dynamic";

/** Busca de produtos ativos para o PDV (nome, SKU ou código de barras). */
export async function GET(request: NextRequest) {
  const ctx = await getAppContext();
  if (!ctx || ctx === "no-company") return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const term = sanitizeSearch(request.nextUrl.searchParams.get("q"));
  if (term.length < 1) return NextResponse.json({ products: [] });

  const { data, error } = await ctx.supabase
    .from("products_overview")
    .select("id, name, sku, barcode, unit, stock_quantity, sale_price, effective_price, promotion_name")
    .eq("company_id", ctx.company.id)
    .eq("is_active", true)
    .or(`name.ilike.%${term}%,sku.ilike.%${term}%,barcode.ilike.%${term}%`)
    .order("name", { ascending: true })
    .limit(10);

  if (error) return NextResponse.json({ error: "Não foi possível buscar os produtos." }, { status: 500 });
  return NextResponse.json({ products: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
