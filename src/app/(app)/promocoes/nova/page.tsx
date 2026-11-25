import type { Metadata } from "next";
import { Alert } from "@/components/ui/feedback";
import { PageHeader, Panel } from "@/components/ui/page";
import { savePromotion } from "@/features/promocoes/actions";
import { PromotionForm } from "@/features/promocoes/components/promotion-form";
import { requireAppContext } from "@/lib/auth/session";
import { todayInTimezone } from "@/lib/domain/dates";

export const metadata: Metadata = { title: "Nova promoção" };

export default async function NewPromotionPage() {
  const ctx = await requireAppContext();
  const { data } = await ctx.supabase
    .from("products")
    .select("id, name, sku, sale_price, cost_price")
    .eq("company_id", ctx.company.id)
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(1000);
  const products = (data ?? []) as { id: string; name: string; sku: string | null; sale_price: number; cost_price: number }[];

  return (
    <>
      <PageHeader title="Nova promoção" />
      {products.length === 0 ? (
        <Alert variant="warning" title="Nenhum produto ativo">
          Cadastre produtos antes de criar uma promoção.
        </Alert>
      ) : (
        <Panel className="max-w-3xl">
          <PromotionForm action={savePromotion} products={products} currency={ctx.company.currency} today={todayInTimezone(ctx.company.timezone)} />
        </Panel>
      )}
    </>
  );
}
