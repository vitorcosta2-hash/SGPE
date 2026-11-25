import { NextResponse, type NextRequest } from "next/server";
import { getAppContext } from "@/lib/auth/session";
import { sanitizeSearch } from "@/lib/search";

export const dynamic = "force-dynamic";

export interface SearchHit {
  group: "Produtos" | "Clientes" | "Fornecedores" | "Vendas" | "Promoções";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

const LIMIT = 5;

/** Busca global: produtos, clientes, fornecedores, vendas (pelo número) e promoções da empresa do usuário. */
export async function GET(request: NextRequest) {
  const ctx = await getAppContext();
  if (!ctx || ctx === "no-company") return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const term = sanitizeSearch(request.nextUrl.searchParams.get("q"), 40);
  if (term.length < 2) return NextResponse.json({ hits: [] });
  const like = `%${term}%`;
  const company = ctx.company.id;
  const db = ctx.supabase;
  const saleNumber = /^#?\d{1,9}$/.test(term) ? Number(term.replace("#", "")) : null;

  const [products, customers, suppliers, sales, promotions] = await Promise.all([
    db.from("products").select("id, name, sku").eq("company_id", company).or(`name.ilike.${like},sku.ilike.${like},barcode.ilike.${like}`).order("name").limit(LIMIT),
    db.from("customers").select("id, name, phone").eq("company_id", company).or(`name.ilike.${like},phone.ilike.${like}`).order("name").limit(LIMIT),
    db.from("suppliers").select("id, name, phone").eq("company_id", company).ilike("name", like).order("name").limit(LIMIT),
    saleNumber === null
      ? Promise.resolve({ data: [] as { id: string; sale_number: number; total: number; status: string }[] })
      : db.from("sales_overview").select("id, sale_number, total, status").eq("company_id", company).eq("sale_number", saleNumber).limit(1),
    db.from("promotions_overview").select("id, name, status").eq("company_id", company).ilike("name", like).order("starts_on", { ascending: false }).limit(LIMIT),
  ]);

  const hits: SearchHit[] = [
    ...(products.data ?? []).map((p: { id: string; name: string; sku: string | null }) => ({ group: "Produtos" as const, id: p.id, title: p.name, subtitle: p.sku ?? undefined, href: `/produtos/${p.id}` })),
    ...(customers.data ?? []).map((c: { id: string; name: string; phone: string | null }) => ({ group: "Clientes" as const, id: c.id, title: c.name, subtitle: c.phone ?? undefined, href: `/clientes/${c.id}/editar` })),
    ...(suppliers.data ?? []).map((s: { id: string; name: string; phone: string | null }) => ({ group: "Fornecedores" as const, id: s.id, title: s.name, subtitle: s.phone ?? undefined, href: `/fornecedores/${s.id}/editar` })),
    ...((sales.data ?? []) as { id: string; sale_number: number; status: string }[]).map((s) => ({
      group: "Vendas" as const, id: s.id, title: `Venda nº ${s.sale_number}`, subtitle: s.status === "cancelled" ? "Cancelada" : undefined, href: `/vendas/${s.id}`,
    })),
    ...(promotions.data ?? []).map((p: { id: string; name: string }) => ({ group: "Promoções" as const, id: p.id, title: p.name, href: `/promocoes/${p.id}` })),
  ];
  return NextResponse.json({ hits }, { headers: { "Cache-Control": "no-store" } });
}
