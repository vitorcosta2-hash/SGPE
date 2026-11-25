import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, Badge } from "@/components/ui/feedback";
import { ButtonLink } from "@/components/ui/button";
import { FlashNotice } from "@/components/ui/flash-notice";
import { InlineConfirm } from "@/components/ui/inline-confirm";
import { Field, Textarea } from "@/components/ui/fields";
import { DefinitionList, PageHeader, Section } from "@/components/ui/page";
import { cancelSale } from "@/features/vendas/actions";
import { PrintButton } from "@/features/vendas/components/print-button";
import { getSale } from "@/features/vendas/queries";
import { canManage, requireAppContext } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/domain/dates";
import { PAYMENT_METHOD_LABELS, SALE_STATUS_LABELS } from "@/lib/domain/stock";
import { formatCurrency, formatQuantity } from "@/lib/format";
import type { SearchParams } from "@/lib/search";

export const metadata: Metadata = { title: "Venda" };

export default async function SaleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const ctx = await requireAppContext();
  const found = await getSale(ctx, id);
  if (!found) notFound();
  const { sale, items } = found;
  const tz = ctx.company.timezone;
  const currency = ctx.company.currency;
  const cancelled = sale.status === "cancelled";

  return (
    <>
      <div className="no-print">
        <PageHeader
          title={`Venda nº ${sale.sale_number}`}
          description={
            <span className="inline-flex flex-wrap items-center gap-2">
              {formatDateTime(sale.created_at, tz)}
              <Badge variant={cancelled ? "danger" : "success"}>{SALE_STATUS_LABELS[sale.status]}</Badge>
            </span>
          }
          actions={
            <>
              <PrintButton />
              <ButtonLink href="/vendas" variant="secondary">
                Voltar
              </ButtonLink>
            </>
          }
        />
        <FlashNotice code={query.aviso} />
        {cancelled ? (
          <Alert variant="warning" title="Venda cancelada" className="mb-5">
            Cancelada em {formatDateTime(sale.cancelled_at, tz)}
            {sale.cancelled_by_name ? ` por ${sale.cancelled_by_name}` : ""}. Motivo: {sale.cancel_reason}. Os itens foram devolvidos ao estoque.
          </Alert>
        ) : null}
      </div>

      <article className="print-area space-y-6">
        <header className="hidden print:block">
          <h1 className="text-lg font-semibold">{ctx.company.name}</h1>
          {ctx.company.contact_phone ? <p className="text-sm">{ctx.company.contact_phone}</p> : null}
          <p className="text-sm">Comprovante da venda nº {sale.sale_number} — {formatDateTime(sale.created_at, tz)}</p>
          {cancelled ? <p className="text-sm font-semibold">VENDA CANCELADA</p> : null}
        </header>

        <Section title="Resumo" className="mb-0">
          <DefinitionList
            items={[
              { label: "Cliente", value: sale.customer_name ?? "Sem cliente" },
              { label: "Pagamento", value: PAYMENT_METHOD_LABELS[sale.payment_method] },
              { label: "Atendente", value: sale.created_by_name ?? "—" },
              ...(sale.notes ? [{ label: "Observações", value: sale.notes }] : []),
            ]}
          />
        </Section>

        <Section title="Itens" className="mb-0">
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Itens da venda</caption>
              <thead>
                <tr className="border-b border-line bg-surface text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  <th scope="col" className="px-3 py-2">Produto</th>
                  <th scope="col" className="px-3 py-2 text-right">Qtd.</th>
                  <th scope="col" className="px-3 py-2 text-right">Preço</th>
                  <th scope="col" className="px-3 py-2 text-right">Desconto</th>
                  <th scope="col" className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2">
                      {item.product_name}
                      {item.product_sku ? <span className="block text-xs text-muted">SKU {item.product_sku}</span> : null}
                      {item.unit_price < item.base_price ? (
                        <span className="block text-xs text-muted">Promoção aplicada (de {formatCurrency(item.base_price, currency)})</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular">
                      {formatQuantity(item.quantity, item.unit)} {item.unit}
                    </td>
                    <td className="px-3 py-2 text-right tabular">{formatCurrency(item.unit_price, currency)}</td>
                    <td className="px-3 py-2 text-right tabular">{item.discount > 0 ? `− ${formatCurrency(item.discount, currency)}` : "—"}</td>
                    <td className="px-3 py-2 text-right tabular">{formatCurrency(item.line_total, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="ml-auto mt-4 max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd className="tabular">{formatCurrency(sale.subtotal, currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Descontos</dt>
              <dd className="tabular">− {formatCurrency(sale.discount_total, currency)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-2 text-base font-semibold text-navy">
              <dt>Total</dt>
              <dd className="tabular">{formatCurrency(sale.total, currency)}</dd>
            </div>
          </dl>
        </Section>
      </article>

      {!cancelled && canManage(ctx.role) ? (
        <div className="no-print mt-8 border-t border-line pt-6">
          <InlineConfirm
            triggerLabel="Cancelar venda"
            title="Cancelar esta venda?"
            description="Os itens voltam ao estoque e a venda deixa de contar no faturamento. Esta ação não pode ser desfeita."
            confirmLabel="Confirmar cancelamento"
            pendingLabel="Cancelando…"
            action={cancelSale}
            hidden={{ id: sale.id }}
          >
            <Field label="Motivo do cancelamento" htmlFor="reason" required>
              <Textarea id="reason" name="reason" rows={2} maxLength={300} />
            </Field>
          </InlineConfirm>
        </div>
      ) : null}
    </>
  );
}
