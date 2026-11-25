import type { Metadata } from "next";
import Link from "next/link";
import { Boxes, PackagePlus, Search } from "lucide-react";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Input, Select } from "@/components/ui/fields";
import { FlashNotice } from "@/components/ui/flash-notice";
import { PageHeader } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { StockBadge } from "@/features/produtos/components/stock-badge";
import { listCategoryOptions } from "@/features/categorias/queries";
import { listSupplierOptions } from "@/features/fornecedores/queries";
import { listProducts, PRODUCT_SORTS } from "@/features/produtos/queries";
import { requireAppContext } from "@/lib/auth/session";
import { formatCurrency, formatQuantity } from "@/lib/format";
import { firstParam, PAGE_SIZE, parsePage, type SearchParams } from "@/lib/search";
import type { ProductRow } from "@/types/db";

export const metadata: Metadata = { title: "Produtos e estoque" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const ctx = await requireAppContext();
  const filters = {
    q: firstParam(params.q),
    categoria: firstParam(params.categoria),
    fornecedor: firstParam(params.fornecedor),
    estoque: firstParam(params.estoque),
    status: firstParam(params.status),
    ordem: firstParam(params.ordem),
    page: parsePage(params.pagina),
  };
  const [{ rows, total }, categories, suppliers] = await Promise.all([listProducts(ctx, filters), listCategoryOptions(ctx), listSupplierOptions(ctx)]);
  const currency = ctx.company.currency;
  const filtered = Boolean(filters.q || filters.categoria || filters.fornecedor || filters.estoque || filters.status);

  const columns: Column<ProductRow>[] = [
    {
      key: "name",
      header: "Produto",
      primary: true,
      cell: (p) => (
        <div className="min-w-0">
          <Link href={`/produtos/${p.id}`} className="font-medium text-brand hover:underline">
            {p.name}
          </Link>
          {p.sku ? <p className="text-xs text-muted">SKU {p.sku}</p> : null}
        </div>
      ),
    },
    { key: "category", header: "Categoria", cell: (p) => p.category_name },
    { key: "supplier", header: "Fornecedor", cell: (p) => p.supplier_name ?? <span className="text-muted">—</span> },
    {
      key: "stock",
      header: "Estoque",
      align: "right",
      cell: (p) => (
        <span>
          {formatQuantity(p.stock_quantity, p.unit)} {p.unit}
        </span>
      ),
    },
    { key: "status", header: "Situação", cell: (p) => (p.is_active ? <StockBadge status={p.stock_status} /> : <Badge>Inativo</Badge>) },
    {
      key: "price",
      header: "Preço",
      align: "right",
      cell: (p) =>
        p.promotion_id ? (
          <span title={`Promoção: ${p.promotion_name}`}>
            <span className="mr-1 text-xs text-muted line-through">{formatCurrency(p.sale_price, currency)}</span>
            {formatCurrency(p.effective_price, currency)}
          </span>
        ) : (
          formatCurrency(p.sale_price, currency)
        ),
    },
  ];

  const pageParams = { q: filters.q, categoria: filters.categoria, fornecedor: filters.fornecedor, estoque: filters.estoque, status: filters.status, ordem: filters.ordem };

  return (
    <>
      <PageHeader
        title="Produtos e estoque"
        description="Cadastro de produtos e saldo atual. Alterações de saldo são feitas por movimentações."
        actions={
          <>
            <ButtonLink href="/produtos/novo">
              <PackagePlus aria-hidden className="h-4 w-4" /> Novo produto
            </ButtonLink>
            <ButtonLink href="/movimentacoes/nova" variant="secondary">
              Registrar movimentação
            </ButtonLink>
          </>
        }
      />
      <FlashNotice code={params.aviso} />

      <form method="get" role="search" className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto]">
        <Input name="q" defaultValue={filters.q ?? ""} placeholder="Nome, SKU ou código de barras" aria-label="Buscar produto" />
        <Select name="categoria" defaultValue={filters.categoria ?? ""} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select name="fornecedor" defaultValue={filters.fornecedor ?? ""} aria-label="Fornecedor">
          <option value="">Todos os fornecedores</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select name="estoque" defaultValue={filters.estoque ?? ""} aria-label="Situação do estoque">
          <option value="">Todo o estoque</option>
          <option value="ok">Estoque normal</option>
          <option value="low">Estoque baixo</option>
          <option value="out">Sem estoque</option>
        </Select>
        <Select name="status" defaultValue={filters.status ?? ""} aria-label="Status do produto">
          <option value="">Ativos e inativos</option>
          <option value="ativos">Somente ativos</option>
          <option value="inativos">Somente inativos</option>
        </Select>
        <Select name="ordem" defaultValue={filters.ordem ?? "nome"} aria-label="Ordenar por">
          {Object.entries(PRODUCT_SORTS).map(([key, s]) => (
            <option key={key} value={key}>
              {s.label}
            </option>
          ))}
        </Select>
        <button type="submit" className={buttonClasses("secondary", "md")}>
          <Search aria-hidden className="h-4 w-4" /> Filtrar
        </button>
      </form>

      {rows.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={<Search aria-hidden className="h-8 w-8" />}
            title="Nenhum produto encontrado"
            description="Nenhum produto corresponde aos filtros aplicados."
            action={
              <ButtonLink href="/produtos" variant="secondary">
                Limpar filtros
              </ButtonLink>
            }
          />
        ) : (
          <EmptyState
            icon={<Boxes aria-hidden className="h-8 w-8" />}
            title="Nenhum produto cadastrado"
            description="Cadastre o primeiro produto para começar a controlar o estoque."
            action={<ButtonLink href="/produtos/novo">Cadastrar produto</ButtonLink>}
          />
        )
      ) : (
        <>
          <DataTable columns={columns} rows={rows} rowKey={(p) => p.id} caption="Lista de produtos" />
          <Pagination page={filters.page} pageSize={PAGE_SIZE} total={total} basePath="/produtos" params={pageParams} />
        </>
      )}
    </>
  );
}
