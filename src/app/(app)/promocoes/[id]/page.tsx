import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge } from "@/components/ui/feedback";
import { Kpi } from "@/components/ui/kpi";
import { ButtonLink } from "@/components/ui/button";
import { FlashNotice } from "@/components/ui/flash-notice";
import { InlineConfirm } from "@/components/ui/inline-confirm";
import { DefinitionList, PageHeader, Panel, Section } from "@/components/ui/page";
import { endPromotion, savePromotion } from "@/features/promocoes/actions";
import { PromoShare } from "@/features/promocoes/components/promo-share";
import { PromotionForm } from "@/features/promocoes/components/promotion-form";
import { getProductCosts, getPromotion, getPromotionResults } from "@/features/promocoes/queries";
import { requireAppContext } from "@/lib/auth/session";
import { formatIsoDate, todayInTimezone } from "@/lib/domain/dates";
import { discountPercent } from "@/lib/domain/promo-copy";
import { promoPrice, describeDiscount } from "@/lib/domain/promotions";
import { PROMOTION_STATUS_LABELS, type PromotionStatus } from "@/lib/domain/stock";
import { formatCurrency, formatPercent, formatQuantity, toInputMoney, toInputNumber } from "@/lib/format";
import type { SearchParams } from "@/lib/search";

export const metadata: Metadata = { title: "Promoção" };

const VARIANT = { active: "success", scheduled: "info", ended: "neutral" } as const;

export default async function PromotionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const ctx = await requireAppContext();
  const found = await getPromotion(ctx, id);
  if (!found) notFound();
  const { promotion, products } = found;
  const currency = ctx.company.currency;
  const status = promotion.status as PromotionStatus;
  const money = (n: number) => formatCurrency(n, currency);
  const today = todayInTimezone(ctx.company.timezone);

  const [costs, results] = await Promise.all([getProductCosts(ctx, products.map((p) => p.product_id)), getPromotionResults(ctx, promotion.id)]);

  let allProducts: { id: string; name: string; sku: string | null; sale_price: number; cost_price: number }[] = [];
  if (status !== "ended") {
    const { data } = await ctx.supabase
      .from("products")
      .select("id, name, sku, sale_price, cost_price")
      .eq("company_id", ctx.company.id)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(1000);
    allProducts = (data ?? []) as typeof allProducts;
    // Mantém na lista produtos já vinculados que foram desativados.
    for (const p of products) {
      if (!allProducts.some((a) => a.id === p.product_id)) {
        allProducts.push({ id: p.product_id, name: p.product_name, sku: p.product_sku, sale_price: p.sale_price, cost_price: costs.get(p.product_id) ?? 0 });
      }
    }
  }

  const minMargin = ctx.company.min_margin_percent;
  const priced = products.map((p) => {
    const promo = promoPrice(promotion.discount_type, promotion.discount_value, p.sale_price);
    const cost = costs.get(p.product_id) ?? 0;
    const profit = Math.round((promo - cost) * 100) / 100;
    const margin = promo > 0 ? Math.round((profit / promo) * 10000) / 100 : null;
    return { ...p, promo, cost, profit, margin, percent: discountPercent(p.sale_price, promo) };
  });
  const belowCost = priced.filter((p) => p.profit < 0).length;
  const lowMargin = priced.filter((p) => p.profit >= 0 && p.margin !== null && p.margin < minMargin).length;

  return (
    <>
      <PageHeader
        title={promotion.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {describeDiscount(promotion.discount_type, promotion.discount_value, money)}
            <Badge variant={VARIANT[status]}>{PROMOTION_STATUS_LABELS[status]}</Badge>
          </span>
        }
        actions={
          <ButtonLink href="/promocoes" variant="secondary">
            Voltar
          </ButtonLink>
        }
      />
      <FlashNotice code={query.aviso} />

      <Section title="Detalhes">
        <Panel>
          <DefinitionList
            items={[
              { label: "Início", value: formatIsoDate(promotion.starts_on) },
              { label: "Término", value: formatIsoDate(promotion.ends_on) },
              { label: "Situação", value: PROMOTION_STATUS_LABELS[status] },
            ]}
          />
          {status !== "ended" ? (
            <div className="mt-5 border-t border-line pt-4">
              <InlineConfirm
                triggerLabel="Encerrar promoção agora"
                title="Encerrar esta promoção?"
                description="Os produtos voltam imediatamente ao preço cadastrado. Vendas já feitas não são alteradas e a promoção não pode ser reativada."
                confirmLabel="Confirmar encerramento"
                pendingLabel="Encerrando…"
                action={endPromotion}
                hidden={{ id: promotion.id }}
              />
            </div>
          ) : null}
        </Panel>
      </Section>

      <Section
        title="Produtos e preços promocionais"
        description="Lucro estimado por unidade vendida durante a promoção: preço promocional menos o custo cadastrado."
      >
        {belowCost > 0 ? (
          <Alert variant="error" title="Produto vendido abaixo do custo" className="mb-3">
            {belowCost === 1 ? "1 produto fica" : `${belowCost} produtos ficam`} com preço promocional menor que o custo. Cada venda gera prejuízo.
          </Alert>
        ) : lowMargin > 0 ? (
          <Alert variant="warning" title="Margem baixa" className="mb-3">
            {lowMargin === 1 ? "1 produto fica" : `${lowMargin} produtos ficam`} com margem abaixo do mínimo configurado ({formatPercent(minMargin)}).
          </Alert>
        ) : null}
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Produtos da promoção</caption>
            <thead>
              <tr className="border-b border-line bg-surface text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th scope="col" className="px-3 py-2">Produto</th>
                <th scope="col" className="px-3 py-2 text-right">Cadastrado</th>
                <th scope="col" className="px-3 py-2 text-right">Promocional</th>
                <th scope="col" className="px-3 py-2 text-right">Desconto</th>
                <th scope="col" className="px-3 py-2 text-right">Custo</th>
                <th scope="col" className="px-3 py-2 text-right">Lucro/un.</th>
                <th scope="col" className="px-3 py-2 text-right">Margem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {priced.map((p) => (
                <tr key={p.product_id}>
                  <td className="px-3 py-2">
                    <Link href={`/produtos/${p.product_id}`} className="text-brand hover:underline">
                      {p.product_name}
                    </Link>
                    {!p.is_active ? <span className="ml-2 text-xs text-muted">(inativo)</span> : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular text-muted">{money(p.sale_price)}</td>
                  <td className="px-3 py-2 text-right font-medium tabular">{money(p.promo)}</td>
                  <td className="px-3 py-2 text-right tabular">{p.percent === null ? "—" : `−${p.percent}%`}</td>
                  <td className="px-3 py-2 text-right tabular text-muted">{money(p.cost)}</td>
                  <td className={`px-3 py-2 text-right font-medium tabular ${p.profit < 0 ? "text-red-700" : "text-emerald-700"}`}>{money(p.profit)}</td>
                  <td className={`px-3 py-2 text-right tabular ${p.profit < 0 ? "text-red-700" : p.margin !== null && p.margin < minMargin ? "text-amber-700" : ""}`}>
                    {p.margin === null ? "—" : formatPercent(p.margin)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="Resultado até agora"
        description="Vendas concluídas feitas com esta promoção. Vendas canceladas não entram."
      >
        {status === "scheduled" ? (
          <p className="rounded-md border border-line px-4 py-6 text-center text-sm text-muted">A promoção começa em {formatIsoDate(promotion.starts_on)}. Os resultados aparecem depois das primeiras vendas.</p>
        ) : results.sales_count === 0 ? (
          <p className="rounded-md border border-line px-4 py-6 text-center text-sm text-muted">Nenhuma venda registrada com esta promoção ainda.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Kpi label="Vendas" value={String(results.sales_count)} />
              <Kpi label="Unidades" value={formatQuantity(results.units)} />
              <Kpi label="Faturamento" value={money(results.revenue)} />
              <Kpi label="Lucro estimado" value={money(results.profit)} tone={results.profit < 0 ? "danger" : undefined} hint="Faturamento − custo" />
              <Kpi label="Desconto concedido" value={money(results.discount_given)} hint="Em relação ao preço cadastrado" />
            </div>
          </>
        )}
      </Section>

      <Section
        title="Divulgação"
        description="Arte e texto prontos a partir desta promoção. Baixe a imagem, copie o texto ou abra direto no WhatsApp."
      >
        <PromoShare
          companyName={ctx.company.name}
          promotionName={promotion.name}
          startsOn={promotion.starts_on}
          endsOn={promotion.ends_on}
          phone={ctx.company.contact_phone}
          currency={currency}
          items={priced.map((p) => ({ name: p.product_name, from: p.sale_price, to: p.promo }))}
        />
      </Section>

      {status !== "ended" ? (
        <Section title="Editar promoção">
          <Panel className="max-w-3xl">
            <PromotionForm
              action={savePromotion}
              products={allProducts}
              currency={currency}
              today={today}
              promotion={{
                id: promotion.id,
                name: promotion.name,
                discount_type: promotion.discount_type,
                discount_value: promotion.discount_type === "percentage" ? toInputNumber(promotion.discount_value, 2) : toInputMoney(promotion.discount_value),
                starts_on: promotion.starts_on,
                ends_on: promotion.ends_on,
                product_ids: products.map((p) => p.product_id),
              }}
            />
          </Panel>
        </Section>
      ) : null}
    </>
  );
}
