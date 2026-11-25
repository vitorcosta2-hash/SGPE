import type { Metadata } from "next";
import Link from "next/link";
import { Receipt, Search } from "lucide-react";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/fields";
import { FlashNotice } from "@/components/ui/flash-notice";
import { PageHeader } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { listSales } from "@/features/vendas/queries";
import { requireAppContext } from "@/lib/auth/session";
import { formatDateTime, resolveDateRange, todayInTimezone } from "@/lib/domain/dates";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, SALE_STATUS_LABELS } from "@/lib/domain/stock";
import { formatCurrency } from "@/lib/format";
import { firstParam, PAGE_SIZE, parsePage, type SearchParams } from "@/lib/search";
import type { SaleRow } from "@/types/db";

export const metadata: Metadata = { title: "Vendas" };

export default async function SalesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const ctx = await requireAppContext();
  const today = todayInTimezone(ctx.company.timezone);
  const range = resolveDateRange(firstParam(params.de), firstParam(params.ate), today);
  const status = firstParam(params.status);
  const pagamento = firstParam(params.pagamento);
  const numero = firstParam(params.numero);
  const page = parsePage(params.pagina);
  const { rows, total } = await listSales(ctx, { ...range, status, pagamento, numero, page });
  const currency = ctx.company.currency;

  const columns: Column<SaleRow>[] = [
    {
      key: "number",
      header: "Venda",
      primary: true,
      cell: (s) => (
        <Link href={`/vendas/${s.id}`} className="font-medium text-brand hover:underline">
          Nº {s.sale_number}
        </Link>
      ),
    },
    { key: "date", header: "Data", cell: (s) => <span className="whitespace-nowrap">{formatDateTime(s.created_at, ctx.company.timezone)}</span> },
    { key: "customer", header: "Cliente", cell: (s) => s.customer_name ?? <span className="text-muted">Sem cliente</span> },
    { key: "payment", header: "Pagamento", cell: (s) => PAYMENT_METHOD_LABELS[s.payment_method] },
    { key: "items", header: "Itens", align: "right", cell: (s) => s.items_count, hideOnMobile: true },
    { key: "total", header: "Total", align: "right", cell: (s) => formatCurrency(s.total, currency) },
    {
      key: "status",
      header: "Situação",
      cell: (s) => <Badge variant={s.status === "completed" ? "success" : "danger"}>{SALE_STATUS_LABELS[s.status]}</Badge>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Vendas"
        description="Vendas registradas no período. Cancelamentos devolvem os itens ao estoque."
        actions={<ButtonLink href="/vendas/nova">Nova venda</ButtonLink>}
      />
      <FlashNotice code={params.aviso} />

      <form method="get" role="search" className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]">
        <Input type="date" name="de" defaultValue={range.from} aria-label="Data inicial" />
        <Input type="date" name="ate" defaultValue={range.to} aria-label="Data final" />
        <Select name="status" defaultValue={status ?? ""} aria-label="Situação">
          <option value="">Todas as situações</option>
          <option value="completed">Concluídas</option>
          <option value="cancelled">Canceladas</option>
        </Select>
        <Select name="pagamento" defaultValue={pagamento ?? ""} aria-label="Forma de pagamento">
          <option value="">Todos os pagamentos</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABELS[m]}
            </option>
          ))}
        </Select>
        <Input name="numero" inputMode="numeric" defaultValue={numero ?? ""} placeholder="Nº da venda" aria-label="Número da venda" />
        <button type="submit" className={buttonClasses("secondary", "md")}>
          <Search aria-hidden className="h-4 w-4" /> Filtrar
        </button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Receipt aria-hidden className="h-8 w-8" />}
          title="Nenhuma venda no período"
          description="Altere o período ou registre uma nova venda."
          action={<ButtonLink href="/vendas/nova">Nova venda</ButtonLink>}
        />
      ) : (
        <>
          <DataTable columns={columns} rows={rows} rowKey={(s) => s.id} caption="Lista de vendas" />
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/vendas" params={{ de: range.from, ate: range.to, status, pagamento, numero }} />
        </>
      )}
    </>
  );
}
