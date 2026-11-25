import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page";
import { applyProductPrice } from "@/features/precificacao/actions";
import { PricingCalculator } from "@/features/precificacao/components/pricing-calculator";
import { isUuid } from "@/features/produtos/queries";
import { requireAppContext } from "@/lib/auth/session";
import { firstParam, type SearchParams } from "@/lib/search";

export const metadata: Metadata = { title: "Precificação" };

export default async function PricingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const ctx = await requireAppContext();
  const { data } = await ctx.supabase
    .from("products")
    .select("id, name, cost_price, sale_price")
    .eq("company_id", ctx.company.id)
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(1000);
  const initial = firstParam(params.produto);

  return (
    <>
      <PageHeader
        title="Precificação"
        description="Calcule o preço de venda a partir do custo e da margem desejada e simule descontos antes de aplicá-los."
      />
      <PricingCalculator
        products={(data ?? []) as { id: string; name: string; cost_price: number; sale_price: number }[]}
        currency={ctx.company.currency}
        minMarginPercent={ctx.company.min_margin_percent}
        initialProductId={isUuid(initial) ? initial : undefined}
        applyAction={applyProductPrice}
      />
    </>
  );
}
