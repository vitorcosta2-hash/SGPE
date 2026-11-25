import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/feedback";
import { FlashNotice } from "@/components/ui/flash-notice";
import { InlineConfirm } from "@/components/ui/inline-confirm";
import { DefinitionList, PageHeader, Panel, Section } from "@/components/ui/page";
import { registerMovement, setProductActive } from "@/features/produtos/actions";
import { MovementForm } from "@/features/produtos/components/movement-form";
import { MovementsTable } from "@/features/produtos/components/movements-table";
import { StockBadge } from "@/features/produtos/components/stock-badge";
import { getProduct, listProductMovements } from "@/features/produtos/queries";
import { requireAppContext } from "@/lib/auth/session";
import { newIdempotencyKey } from "@/lib/idempotency";
import { formatCurrency, formatPercent, formatQuantity } from "@/lib/format";
import type { SearchParams } from "@/lib/search";

export const metadata: Metadata = { title: "Produto" };

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const ctx = await requireAppContext();
  const product = await getProduct(ctx, id);
  if (!product) notFound();
  const movements = await listProductMovements(ctx, product.id);
  const currency = ctx.company.currency;
  const margin = product.sale_price > 0 ? ((product.sale_price - product.cost_price) / product.sale_price) * 100 : null;

  return (
    <>
      <PageHeader
        title={product.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {product.category_name}
            {product.supplier_name ? <span>Fornecedor: {product.supplier_name}</span> : null}
            {product.is_active ? <StockBadge status={product.stock_status} /> : <Badge>Inativo</Badge>}
          </span>
        }
        actions={
          <>
            <ButtonLink href={`/produtos/${product.id}/editar`} variant="secondary">
              <Pencil aria-hidden className="h-4 w-4" /> Editar
            </ButtonLink>
            <ButtonLink href={`/precificacao?produto=${product.id}`} variant="secondary">
              Precificar
            </ButtonLink>
          </>
        }
      />
      <FlashNotice code={query.aviso} />

      <Section title="Dados do produto">
        <Panel>
          <DefinitionList
            items={[
              { label: "Saldo em estoque", value: <strong className="text-lg tabular">{formatQuantity(product.stock_quantity, product.unit)} {product.unit}</strong> },
              { label: "Estoque mínimo", value: `${formatQuantity(product.min_stock, product.unit)} ${product.unit}` },
              { label: "Valor em estoque (custo)", value: formatCurrency(product.stock_value, currency) },
              { label: "Preço de custo", value: formatCurrency(product.cost_price, currency) },
              {
                label: "Preço de venda",
                value: product.promotion_id ? (
                  <span>
                    {formatCurrency(product.effective_price, currency)}{" "}
                    <span className="text-xs text-muted line-through">{formatCurrency(product.sale_price, currency)}</span>
                    <span className="block text-xs text-muted">Promoção ativa: {product.promotion_name}</span>
                  </span>
                ) : (
                  formatCurrency(product.sale_price, currency)
                ),
              },
              { label: "Margem sobre o preço de venda", value: margin === null ? "—" : formatPercent(Math.round(margin * 100) / 100) },
              { label: "SKU", value: product.sku ?? "—" },
              { label: "Código de barras", value: product.barcode ?? "—" },
              { label: "Unidade", value: product.unit },
              { label: "Descrição", value: product.description ?? "—" },
            ]}
          />
          <div className="mt-5 border-t border-line pt-4">
            {product.is_active ? (
              <InlineConfirm
                triggerLabel="Desativar produto"
                title="Desativar este produto?"
                description="Ele deixa de aparecer nas vendas e movimentações, mas o histórico é mantido. Você pode reativá-lo depois."
                confirmLabel="Confirmar desativação"
                pendingLabel="Desativando…"
                action={setProductActive}
                hidden={{ id: product.id, active: "false" }}
              />
            ) : (
              <InlineConfirm
                triggerLabel="Reativar produto"
                triggerVariant="secondary"
                title="Reativar este produto?"
                confirmLabel="Reativar"
                action={setProductActive}
                hidden={{ id: product.id, active: "true" }}
              />
            )}
          </div>
        </Panel>
      </Section>

      {product.is_active ? (
        <Section title="Registrar movimentação" description="Entradas, saídas, ajustes e contagem de inventário.">
          <Panel className="max-w-2xl">
            <MovementForm
              action={registerMovement}
              idempotencyKey={newIdempotencyKey()}
              product={{ id: product.id, name: product.name, unit: product.unit, stock_quantity: product.stock_quantity }}
            />
          </Panel>
        </Section>
      ) : null}

      <Section
        title="Últimas movimentações"
        actions={
          <Link href={`/movimentacoes?produto=${product.id}`} className="text-sm text-brand hover:underline">
            Ver histórico completo
          </Link>
        }
      >
        {movements.length === 0 ? (
          <p className="rounded-md border border-line px-4 py-6 text-center text-sm text-muted">Este produto ainda não possui movimentações.</p>
        ) : (
          <MovementsTable rows={movements} timezone={ctx.company.timezone} showProduct={false} />
        )}
      </Section>
    </>
  );
}
