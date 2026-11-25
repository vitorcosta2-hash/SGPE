import type { Metadata } from "next";
import Link from "next/link";
import { Download, FileSpreadsheet, Printer } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { BarList } from "@/components/charts/bar-list";
import { TrendChart } from "@/components/charts/trend-chart";
import { Kpi } from "@/components/ui/kpi";
import { PageHeader, Panel, Section } from "@/components/ui/page";
import { PeriodFilter } from "@/components/ui/period-filter";
import { PrintButton } from "@/features/vendas/components/print-button";
import { Pagination } from "@/components/ui/pagination";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StockBadge } from "@/features/produtos/components/stock-badge";
import { MovementsTable } from "@/features/produtos/components/movements-table";
import { listMovements } from "@/features/produtos/movements-query";
import { listProducts } from "@/features/produtos/queries";
import { EMPTY_METRICS } from "@/features/dashboard/queries";
import { isProfitOrder, isReportKind, PROFIT_ORDER_SQL, type ProfitOrder, type ReportKind } from "@/features/relatorios/export";
import { listSales } from "@/features/vendas/queries";
import { requireAppContext } from "@/lib/auth/session";
import { formatDateTime, formatIsoDate, todayInTimezone } from "@/lib/domain/dates";
import { percentChange, resolvePeriod } from "@/lib/domain/periods";
import { MOVEMENT_TYPE_LABELS, PAYMENT_METHOD_LABELS, SALE_STATUS_LABELS } from "@/lib/domain/stock";
import { formatCurrency, formatPercent, formatQuantity } from "@/lib/format";
import { firstParam, PAGE_SIZE, parsePage, type SearchParams } from "@/lib/search";
import type { DailyPoint, MovementSummaryItem, PeriodMetrics, ProductProfitRow, ProductRow, SaleRow, SalesSummary, StockSummary } from "@/types/db";

export const metadata: Metadata = { title: "Relatórios" };

const TABS: { kind: ReportKind; label: string }[] = [
  { kind: "faturamento", label: "Faturamento" },
  { kind: "lucratividade", label: "Lucratividade" },
  { kind: "mais-vendidos", label: "Mais vendidos" },
  { kind: "vendas", label: "Vendas" },
  { kind: "estoque", label: "Estoque" },
  { kind: "movimentacoes", label: "Movimentações" },
];

const ORDER_LABELS: Record<ProfitOrder, string> = { lucro: "Lucro", margem: "Margem", quantidade: "Quantidade", faturamento: "Faturamento" };

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-line bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular text-navy">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const ctx = await requireAppContext();
  const tz = ctx.company.timezone;
  const currency = ctx.company.currency;
  const money = (n: number) => formatCurrency(n, currency);

  const rawKind = firstParam(params.tipo);
  const kind: ReportKind = isReportKind(rawKind) ? rawKind : "faturamento";
  const rawOrder = firstParam(params.ordem);
  const order: ProfitOrder = isProfitOrder(rawOrder) ? rawOrder : "lucro";
  const period = resolvePeriod({ periodo: firstParam(params.periodo), de: firstParam(params.de), ate: firstParam(params.ate) }, todayInTimezone(tz));
  const range = { from: period.from, to: period.to };
  const page = parsePage(params.pagina);
  const exportParams: Record<string, string> = { tipo: kind, de: range.from, ate: range.to };
  if (kind === "lucratividade") exportParams.ordem = order;
  const exportQuery = new URLSearchParams(exportParams).toString();
  const rpc = ctx.supabase.rpc.bind(ctx.supabase);

  let body: React.ReactNode;

  if (kind === "estoque") {
    const [summaryRes, { rows, total }] = await Promise.all([
      ctx.supabase.rpc("report_stock_summary", { p_company_id: ctx.company.id }),
      listProducts(ctx, { page, ordem: "nome" }),
    ]);
    const s = summaryRes.data as StockSummary | null;
    const columns: Column<ProductRow>[] = [
      { key: "name", header: "Produto", primary: true, cell: (p) => <span className="font-medium">{p.name}</span> },
      { key: "category", header: "Categoria", cell: (p) => p.category_name },
      { key: "stock", header: "Saldo", align: "right", cell: (p) => `${formatQuantity(p.stock_quantity, p.unit)} ${p.unit}` },
      { key: "min", header: "Mínimo", align: "right", cell: (p) => formatQuantity(p.min_stock, p.unit), hideOnMobile: true },
      { key: "status", header: "Situação", cell: (p) => (p.is_active ? <StockBadge status={p.stock_status} /> : "Inativo") },
      { key: "value", header: "Valor (custo)", align: "right", cell: (p) => money(p.stock_value) },
    ];
    body = (
      <>
        <section aria-label="Resumo do estoque" className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Produtos cadastrados" value={String(s?.total_products ?? 0)} hint={`${s?.active_products ?? 0} ativos`} />
          <Stat label="Valor em estoque" value={money(s?.stock_value ?? 0)} hint="Quantidade × custo" />
          <Stat label="Estoque baixo" value={String(s?.low_stock ?? 0)} />
          <Stat label="Sem estoque" value={String(s?.out_of_stock ?? 0)} />
        </section>
        {rows.length === 0 ? (
          <EmptyState title="Nenhum produto cadastrado" description="O relatório de estoque aparece quando houver produtos." />
        ) : (
          <>
            <DataTable columns={columns} rows={rows} rowKey={(p) => p.id} caption="Posição de estoque" />
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/relatorios" params={{ tipo: kind }} />
          </>
        )}
      </>
    );
  } else if (kind === "movimentacoes") {
    const [summaryRes, { rows, total }] = await Promise.all([
      ctx.supabase.rpc("report_movements_summary", { p_company_id: ctx.company.id, p_from: range.from, p_to: range.to, p_product_id: null }),
      listMovements(ctx, { from: range.from, to: range.to, page }),
    ]);
    const summary = (summaryRes.data ?? []) as MovementSummaryItem[];
    body = (
      <>
        {summary.length > 0 ? (
          <section aria-label="Resumo por tipo" className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {summary.map((m) => (
              <Stat key={m.type} label={MOVEMENT_TYPE_LABELS[m.type]} value={`${m.count} mov.`} hint={`Quantidade total: ${formatQuantity(m.quantity)}`} />
            ))}
          </section>
        ) : null}
        {rows.length === 0 ? (
          <EmptyState title="Nenhuma movimentação no período" description="Altere as datas para ver outro período." />
        ) : (
          <>
            <MovementsTable rows={rows} timezone={tz} />
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/relatorios" params={{ tipo: kind, de: range.from, ate: range.to }} />
          </>
        )}
      </>
    );
  } else if (kind === "vendas") {
    const [summaryRes, { rows, total }] = await Promise.all([
      ctx.supabase.rpc("report_sales_summary", { p_company_id: ctx.company.id, p_from: range.from, p_to: range.to }),
      listSales(ctx, { from: range.from, to: range.to, page }),
    ]);
    const s = summaryRes.data as SalesSummary | null;
    const columns: Column<SaleRow>[] = [
      { key: "n", header: "Venda", primary: true, cell: (v) => <Link href={`/vendas/${v.id}`} className="font-medium text-brand hover:underline">Nº {v.sale_number}</Link> },
      { key: "date", header: "Data", cell: (v) => formatDateTime(v.created_at, tz) },
      { key: "pay", header: "Pagamento", cell: (v) => PAYMENT_METHOD_LABELS[v.payment_method] },
      { key: "status", header: "Situação", cell: (v) => SALE_STATUS_LABELS[v.status] },
      { key: "total", header: "Total", align: "right", cell: (v) => money(v.total) },
    ];
    body = (
      <>
        <section aria-label="Resumo de vendas" className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Vendas concluídas" value={String(s?.completed_count ?? 0)} />
          <Stat label="Faturamento bruto" value={money(s?.completed_total ?? 0)} hint="Soma das vendas concluídas. Não é lucro: custos, impostos e despesas não foram descontados." />
          <Stat label="Descontos concedidos" value={money(s?.discount_total ?? 0)} />
          <Stat label="Canceladas" value={String(s?.cancelled_count ?? 0)} hint={money(s?.cancelled_total ?? 0)} />
        </section>

        {s && (s.by_payment.length > 0 || s.top_products.length > 0) ? (
          <div className="mb-8 grid gap-8 lg:grid-cols-2">
            <Section title="Por forma de pagamento" className="mb-0">
              <ul className="divide-y divide-line rounded-md border border-line">
                {s.by_payment.map((p) => (
                  <li key={p.method} className="flex justify-between px-4 py-2.5 text-sm">
                    <span>{PAYMENT_METHOD_LABELS[p.method]} <span className="text-muted">({p.count})</span></span>
                    <span className="tabular">{money(p.total)}</span>
                  </li>
                ))}
              </ul>
            </Section>
            <Section title="Produtos mais vendidos" className="mb-0">
              <ul className="divide-y divide-line rounded-md border border-line">
                {s.top_products.map((p) => (
                  <li key={p.product_id} className="flex justify-between gap-3 px-4 py-2.5 text-sm">
                    <span className="min-w-0 truncate">{p.name}</span>
                    <span className="shrink-0 tabular text-muted">{formatQuantity(p.quantity, p.unit)} {p.unit} · {money(p.total)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          </div>
        ) : null}

        {rows.length === 0 ? (
          <EmptyState title="Nenhuma venda no período" description="Altere as datas para ver outro período." />
        ) : (
          <>
            <DataTable columns={columns} rows={rows} rowKey={(v) => v.id} caption="Vendas do período" />
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/relatorios" params={{ tipo: kind, de: range.from, ate: range.to }} />
          </>
        )}
      </>
    );
  } else if (kind === "faturamento") {
    const [curRes, prevRes, dailyRes] = await Promise.all([
      rpc("report_period_metrics", { p_company_id: ctx.company.id, p_from: period.from, p_to: period.to }),
      rpc("report_period_metrics", { p_company_id: ctx.company.id, p_from: period.previous.from, p_to: period.previous.to }),
      rpc("report_sales_daily", { p_company_id: ctx.company.id, p_from: period.from, p_to: period.to }),
    ]);
    const cur = (curRes.data as PeriodMetrics | null) ?? EMPTY_METRICS;
    const prev = (prevRes.data as PeriodMetrics | null) ?? EMPTY_METRICS;
    const daily = (dailyRes.data as DailyPoint[] | null) ?? [];
    const comparison: { label: string; cur: number; prev: number; format: (n: number) => string }[] = [
      { label: "Faturamento", cur: cur.revenue, prev: prev.revenue, format: money },
      { label: "Lucro estimado", cur: cur.profit, prev: prev.profit, format: money },
      { label: "Vendas realizadas", cur: cur.sales_count, prev: prev.sales_count, format: String },
      { label: "Ticket médio", cur: cur.avg_ticket, prev: prev.avg_ticket, format: money },
      { label: "Unidades vendidas", cur: cur.units_sold, prev: prev.units_sold, format: (n) => formatQuantity(n) },
      { label: "Descontos concedidos", cur: cur.discounts, prev: prev.discounts, format: money },
    ];
    const withSales = daily.filter((d) => d.count > 0).reverse();
    body = (
      <>
        <section aria-label="Resumo do período" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Faturamento" value={money(cur.revenue)} delta={percentChange(cur.revenue, prev.revenue)} hint="Vendas concluídas" />
          <Kpi label="Lucro estimado" value={money(cur.profit)} delta={percentChange(cur.profit, prev.profit)} hint={cur.margin_percent === null ? undefined : `Margem ${formatPercent(cur.margin_percent)}`} />
          <Kpi label="Vendas" value={String(cur.sales_count)} delta={percentChange(cur.sales_count, prev.sales_count)} />
          <Kpi label="Ticket médio" value={money(cur.avg_ticket)} delta={percentChange(cur.avg_ticket, prev.avg_ticket)} />
        </section>
        <Panel className="mb-8 print:break-inside-avoid">
          <TrendChart data={daily} currency={currency} />
        </Panel>
        <Section title="Comparação de períodos" description={`${formatIsoDate(period.from)} a ${formatIsoDate(period.to)} contra ${formatIsoDate(period.previous.from)} a ${formatIsoDate(period.previous.to)}.`}>
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Comparação entre o período atual e o anterior</caption>
              <thead>
                <tr className="border-b border-line bg-surface text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  <th scope="col" className="px-3 py-2">Indicador</th>
                  <th scope="col" className="px-3 py-2 text-right">Período atual</th>
                  <th scope="col" className="px-3 py-2 text-right">Período anterior</th>
                  <th scope="col" className="px-3 py-2 text-right">Variação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {comparison.map((c) => {
                  const d = percentChange(c.cur, c.prev);
                  return (
                    <tr key={c.label}>
                      <th scope="row" className="px-3 py-2 text-left font-normal">{c.label}</th>
                      <td className="px-3 py-2 text-right font-medium tabular">{c.format(c.cur)}</td>
                      <td className="px-3 py-2 text-right tabular text-muted">{c.format(c.prev)}</td>
                      <td className={`px-3 py-2 text-right tabular ${d === null || d === 0 ? "text-muted" : d > 0 ? "text-emerald-700" : "text-red-700"}`}>
                        {d === null ? "—" : `${d > 0 ? "+" : d < 0 ? "−" : ""}${formatPercent(Math.abs(d))}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
        <Section title="Faturamento por dia" description="Dias com vendas, do mais recente para o mais antigo.">
          {withSales.length === 0 ? (
            <EmptyState title="Nenhuma venda no período" description="Escolha outro período para ver o faturamento." />
          ) : (
            <DataTable
              columns={[
                { key: "day", header: "Dia", primary: true, cell: (d: DailyPoint) => formatIsoDate(d.day) },
                { key: "count", header: "Vendas", align: "right", cell: (d: DailyPoint) => d.count },
                { key: "rev", header: "Faturamento", align: "right", cell: (d: DailyPoint) => money(d.revenue) },
                { key: "profit", header: "Lucro estimado", align: "right", cell: (d: DailyPoint) => money(d.profit) },
              ] satisfies Column<DailyPoint>[]}
              rows={withSales}
              rowKey={(d) => d.day}
              caption="Faturamento por dia"
            />
          )}
        </Section>
      </>
    );
  } else if (kind === "lucratividade" || kind === "mais-vendidos") {
    const effective: ProfitOrder = kind === "mais-vendidos" ? "quantidade" : order;
    const [curRes, listRes] = await Promise.all([
      rpc("report_period_metrics", { p_company_id: ctx.company.id, p_from: period.from, p_to: period.to }),
      rpc("report_product_profitability", { p_company_id: ctx.company.id, p_from: period.from, p_to: period.to, p_limit: 200, p_order: PROFIT_ORDER_SQL[effective] }),
    ]);
    const cur = (curRes.data as PeriodMetrics | null) ?? EMPTY_METRICS;
    const list = (listRes.data as ProductProfitRow[] | null) ?? [];
    const columns: Column<ProductProfitRow>[] = [
      { key: "name", header: "Produto", primary: true, cell: (r) => <Link href={`/produtos/${r.product_id}`} className="font-medium text-brand hover:underline">{r.name}</Link> },
      { key: "qty", header: "Vendido", align: "right", cell: (r) => `${formatQuantity(r.quantity, r.unit)} ${r.unit}` },
      { key: "rev", header: "Faturamento", align: "right", cell: (r) => money(r.revenue) },
      { key: "cost", header: "Custo", align: "right", cell: (r) => money(r.cost), hideOnMobile: true },
      { key: "profit", header: "Lucro estimado", align: "right", cell: (r) => <span className={r.profit < 0 ? "text-red-700" : undefined}>{money(r.profit)}</span> },
      { key: "margin", header: "Margem", align: "right", cell: (r) => (r.margin_percent === null ? "—" : formatPercent(r.margin_percent)) },
    ];
    body = (
      <>
        <section aria-label="Resumo do período" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Faturamento" value={money(cur.revenue)} />
          <Kpi label="Custo das mercadorias" value={money(cur.cost)} hint="Custo gravado em cada venda" />
          <Kpi label="Lucro estimado" value={money(cur.profit)} tone={cur.profit < 0 ? "danger" : undefined} />
          <Kpi label="Margem" value={cur.margin_percent === null ? "—" : formatPercent(cur.margin_percent)} hint="Lucro ÷ faturamento" />
        </section>
        {kind === "lucratividade" ? (
          <nav aria-label="Ordenar por" className="no-print mb-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Ordenar por:</span>
            {(Object.keys(ORDER_LABELS) as ProfitOrder[]).map((o) => (
              <Link
                key={o}
                href={`/relatorios?${new URLSearchParams({ tipo: kind, de: range.from, ate: range.to, ordem: o }).toString()}`}
                aria-current={order === o ? "true" : undefined}
                className={buttonClasses(order === o ? "primary" : "secondary", "sm")}
              >
                {ORDER_LABELS[o]}
              </Link>
            ))}
          </nav>
        ) : null}
        {list.length === 0 ? (
          <EmptyState title="Nenhuma venda no período" description="Escolha outro período para ver a lucratividade dos produtos." />
        ) : (
          <>
            {kind === "mais-vendidos" ? (
              <Panel className="mb-6 print:break-inside-avoid">
                <BarList
                  items={list.slice(0, 10).map((r) => ({
                    key: r.product_id,
                    label: r.name,
                    amount: r.quantity,
                    value: `${formatQuantity(r.quantity, r.unit)} ${r.unit}`,
                    hint: `${money(r.revenue)} em vendas`,
                  }))}
                />
              </Panel>
            ) : null}
            <DataTable columns={columns} rows={list} rowKey={(r) => r.product_id} caption={kind === "mais-vendidos" ? "Produtos mais vendidos" : "Lucratividade por produto"} />
            <p className="mt-3 text-xs text-muted">
              Lucro estimado = faturamento − custo cadastrado no momento da venda. Não considera impostos, taxas nem despesas fixas. Vendas canceladas não entram.
            </p>
          </>
        )}
      </>
    );
  } else {
    body = null;
  }

  return (
    <>
      <PageHeader
        title="Relatórios"
        description="Consulte os dados por período e exporte para Excel, CSV ou PDF."
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <a href={`/relatorios/exportar?${exportQuery}&formato=xlsx`} className={buttonClasses("secondary", "md")} download>
              <FileSpreadsheet aria-hidden className="h-4 w-4" /> Excel
            </a>
            <a href={`/relatorios/exportar?${exportQuery}&formato=csv`} className={buttonClasses("secondary", "md")} download>
              <Download aria-hidden className="h-4 w-4" /> CSV
            </a>
            <PrintButton label="PDF / Imprimir" icon={<Printer aria-hidden className="h-4 w-4" />} />
          </div>
        }
      />

      <nav aria-label="Tipo de relatório" className="no-print mb-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.kind}
            href={`/relatorios?tipo=${t.kind}&de=${range.from}&ate=${range.to}`}
            aria-current={kind === t.kind ? "page" : undefined}
            className={buttonClasses(kind === t.kind ? "primary" : "secondary", "sm")}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {kind !== "estoque" ? (
        <div className="no-print">
          <PeriodFilter period={period} basePath="/relatorios" extra={{ tipo: kind, ...(kind === "lucratividade" ? { ordem: order } : {}) }} />
        </div>
      ) : (
        <p className="no-print mb-6 text-sm text-muted">Posição atual do estoque, sem filtro de período.</p>
      )}

      <div className="print-area">
        <div className="mb-4 hidden print:block">
          <h1 className="text-xl font-semibold">{ctx.company.name} — {TABS.find((t) => t.kind === kind)?.label}</h1>
          <p className="text-sm">{kind === "estoque" ? "Posição atual do estoque" : `Período: ${formatIsoDate(range.from)} a ${formatIsoDate(range.to)}`}</p>
        </div>
        {body}
      </div>
    </>
  );
}
