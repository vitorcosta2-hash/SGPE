import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Boxes, PackagePlus, Receipt, ShoppingCart } from "lucide-react";
import { BarList } from "@/components/charts/bar-list";
import { TrendChart } from "@/components/charts/trend-chart";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { FlashNotice } from "@/components/ui/flash-notice";
import { Kpi } from "@/components/ui/kpi";
import { PageHeader, Panel, Section } from "@/components/ui/page";
import { PeriodFilter } from "@/components/ui/period-filter";
import { StockBadge } from "@/features/produtos/components/stock-badge";
import { getDashboardData } from "@/features/dashboard/queries";
import { requireAppContext } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/domain/dates";
import { percentChange } from "@/lib/domain/periods";
import { MOVEMENT_TYPE_LABELS, movementDirection, PAYMENT_METHOD_LABELS } from "@/lib/domain/stock";
import { formatCurrency, formatPercent, formatQuantity } from "@/lib/format";
import { firstParam, type SearchParams } from "@/lib/search";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Início" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const ctx = await requireAppContext();
  const data = await getDashboardData(ctx, {
    periodo: firstParam(params.periodo),
    de: firstParam(params.de),
    ate: firstParam(params.ate),
  });
  const currency = ctx.company.currency;
  const money = (n: number) => formatCurrency(n, currency);
  const firstName = ctx.profile.full_name.split(" ")[0];

  if (!data.hasProducts) {
    return (
      <>
        <PageHeader title={firstName ? `Bem-vindo, ${firstName}` : "Bem-vindo"} description={`${ctx.company.name} está pronta para começar.`} />
        <FlashNotice code={params.aviso} />
        <EmptyState
          icon={<Boxes aria-hidden className="h-9 w-9" />}
          title="Cadastre seu primeiro produto"
          description="O painel mostra faturamento, lucro estimado, estoque e produtos mais vendidos assim que houver dados. Comece cadastrando os produtos com a quantidade em estoque."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <ButtonLink href="/produtos/novo">
                <PackagePlus aria-hidden className="h-4 w-4" /> Cadastrar produto
              </ButtonLink>
              <ButtonLink href="/categorias" variant="secondary">
                Ver categorias
              </ButtonLink>
            </div>
          }
        />
      </>
    );
  }

  const { stock, current, previous, period, daily, topProducts, byPayment, replenish, activity } = data;
  const periodHint = period.preset === "hoje" ? "hoje" : period.label.toLowerCase();

  return (
    <>
      <PageHeader
        title="Início"
        description={`Resumo de ${ctx.company.name}.`}
        actions={
          <>
            <ButtonLink href="/vendas/nova">
              <ShoppingCart aria-hidden className="h-4 w-4" /> Nova venda
            </ButtonLink>
            <ButtonLink href="/movimentacoes/nova" variant="secondary">
              Registrar movimentação
            </ButtonLink>
          </>
        }
      />
      <FlashNotice code={params.aviso} />
      <PeriodFilter period={period} basePath="/" />

      <section aria-label={`Desempenho — ${periodHint}`} className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Faturamento" value={money(current.revenue)} delta={percentChange(current.revenue, previous.revenue)} hint="Vendas concluídas" />
        <Kpi
          label="Lucro estimado"
          value={money(current.profit)}
          delta={percentChange(current.profit, previous.profit)}
          hint={current.margin_percent === null ? undefined : `Margem ${formatPercent(current.margin_percent)}`}
        />
        <Kpi
          label="Vendas realizadas"
          value={String(current.sales_count)}
          delta={percentChange(current.sales_count, previous.sales_count)}
          hint={current.sales_count > 0 ? `Ticket médio ${money(current.avg_ticket)}` : undefined}
        />
        <Kpi
          label="Cancelamentos"
          value={String(current.cancelled_count)}
          delta={percentChange(current.cancelled_count, previous.cancelled_count)}
          invertDelta
          hint={current.discounts > 0 ? `${money(current.discounts)} em descontos` : undefined}
        />
      </section>

      <section aria-label="Situação do estoque" className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Produtos cadastrados" value={String(stock.total_products)} hint={`${stock.active_products} ativos`} />
        <Kpi label="Valor em estoque" value={money(stock.stock_value)} hint="A preço de custo" />
        <Kpi label="Estoque baixo" value={String(stock.low_stock)} tone={stock.low_stock > 0 ? "warn" : undefined} hint="No mínimo ou abaixo" />
        <Kpi label="Sem estoque" value={String(stock.out_of_stock)} tone={stock.out_of_stock > 0 ? "danger" : undefined} hint="Saldo zerado" />
      </section>

      <div className="mb-8 grid gap-6 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <div className="mb-3">
            <h2 className="text-base font-semibold text-navy">Desempenho das vendas</h2>
            <p className="text-sm text-muted">Faturamento e lucro estimado por dia. Passe o mouse ou toque no gráfico para ver o detalhe.</p>
          </div>
          <TrendChart data={daily} currency={currency} />
          <p className="mt-3 text-xs text-muted">
            Lucro estimado = faturamento − custo dos produtos vendidos (custo registrado no momento de cada venda). Não considera impostos, taxas nem despesas fixas.
          </p>
        </Panel>

        <Panel>
          <div className="mb-4 flex items-end justify-between gap-2">
            <h2 className="text-base font-semibold text-navy">Mais vendidos</h2>
            <Link href="/relatorios?tipo=lucratividade" className="inline-flex items-center gap-1 text-sm text-brand hover:underline">
              Ver todos <ArrowRight aria-hidden className="h-3.5 w-3.5" />
            </Link>
          </div>
          {topProducts.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Nenhuma venda no período.</p>
          ) : (
            <BarList
              items={topProducts.map((p) => ({
                key: p.product_id,
                label: p.name,
                amount: p.quantity,
                value: `${formatQuantity(p.quantity, p.unit)} ${p.unit}`,
                hint: `${money(p.revenue)} · lucro ${money(p.profit)}`,
              }))}
            />
          )}
        </Panel>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <Section title="Forma de pagamento" description={`Faturamento por forma de pagamento — ${periodHint}.`}>
          {byPayment.length === 0 ? (
            <p className="rounded-md border border-line px-4 py-6 text-center text-sm text-muted">Nenhuma venda no período.</p>
          ) : (
            <BarList
              items={byPayment.map((p) => ({
                key: p.method,
                label: PAYMENT_METHOD_LABELS[p.method],
                amount: p.total,
                value: money(p.total),
                hint: `${p.count} ${p.count === 1 ? "venda" : "vendas"}`,
              }))}
            />
          )}
        </Section>

        <Section
          title="Produtos para repor"
          actions={
            <Link href="/produtos?estoque=low" className="inline-flex items-center gap-1 text-sm text-brand hover:underline">
              Ver todos <ArrowRight aria-hidden className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {replenish.length === 0 ? (
            <p className="rounded-md border border-line px-4 py-6 text-center text-sm text-muted">Nenhum produto abaixo do estoque mínimo.</p>
          ) : (
            <ul className="divide-y divide-line rounded-md border border-line">
              {replenish.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <Link href={`/produtos/${p.id}`} className="block truncate text-sm font-medium text-brand hover:underline">
                      {p.name}
                    </Link>
                    <p className="text-xs text-muted tabular">
                      Saldo {formatQuantity(p.stock_quantity, p.unit)} {p.unit} · mínimo {formatQuantity(p.min_stock, p.unit)}
                    </p>
                  </div>
                  <StockBadge status={p.stock_status} />
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Atividades recentes"
          actions={
            <Link href="/movimentacoes" className="inline-flex items-center gap-1 text-sm text-brand hover:underline">
              Histórico <ArrowRight aria-hidden className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {activity.length === 0 ? (
            <p className="rounded-md border border-line px-4 py-6 text-center text-sm text-muted">Nenhuma atividade registrada.</p>
          ) : (
            <ul className="divide-y divide-line rounded-md border border-line">
              {activity.map((item) => {
                if (item.kind === "sale") {
                  const s = item.sale;
                  return (
                    <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <Link href={`/vendas/${s.id}`} className="inline-flex items-center gap-1.5 truncate text-sm font-medium text-brand hover:underline">
                          <Receipt aria-hidden className="h-3.5 w-3.5 shrink-0" /> Venda nº {s.sale_number}
                          {s.status === "cancelled" ? <span className="text-xs font-normal text-red-700">(cancelada)</span> : null}
                        </Link>
                        <p className="text-xs text-muted">{formatDateTime(s.created_at, ctx.company.timezone)}</p>
                      </div>
                      <p className={cn("text-sm font-semibold tabular", s.status === "cancelled" ? "text-muted line-through" : "text-navy")}>{money(s.total)}</p>
                    </li>
                  );
                }
                const m = item.movement;
                const sign = movementDirection(m.type) > 0 ? "+" : "−";
                return (
                  <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{m.product_name}</p>
                      <p className="text-xs text-muted">
                        {MOVEMENT_TYPE_LABELS[m.type]} · {formatDateTime(m.created_at, ctx.company.timezone)}
                      </p>
                    </div>
                    <p className={cn("text-sm font-semibold tabular", sign === "+" ? "text-emerald-700" : "text-red-700")}>
                      {sign}
                      {formatQuantity(m.quantity, m.product_unit)} {m.product_unit}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
