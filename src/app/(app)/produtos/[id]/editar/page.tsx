import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader, Panel } from "@/components/ui/page";
import { listCategoryOptions } from "@/features/categorias/queries";
import { listSupplierOptions } from "@/features/fornecedores/queries";
import { updateProduct } from "@/features/produtos/actions";
import { ProductForm } from "@/features/produtos/components/product-form";
import { getProduct, listProductMovements } from "@/features/produtos/queries";
import { requireAppContext } from "@/lib/auth/session";
import { toInputMoney, toInputNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Editar produto" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAppContext();
  const product = await getProduct(ctx, id);
  if (!product) notFound();
  const [categories, suppliers, history] = await Promise.all([
    listCategoryOptions(ctx),
    listSupplierOptions(ctx),
    listProductMovements(ctx, product.id, 1),
  ]);

  return (
    <>
      <PageHeader
        title={`Editar ${product.name}`}
        description="O saldo de estoque não é editado aqui: use uma movimentação para entradas, saídas e ajustes."
        actions={
          <ButtonLink href={`/produtos/${product.id}`} variant="secondary">
            Voltar
          </ButtonLink>
        }
      />
      <Panel className="max-w-3xl">
        <ProductForm
          action={updateProduct}
          categories={categories}
          suppliers={suppliers}
          defaultMinStock={ctx.company.default_min_stock}
          cancelHref={`/produtos/${product.id}`}
          submitLabel="Salvar alterações"
          product={{
            id: product.id,
            name: product.name,
            category_id: product.category_id,
            supplier_id: product.supplier_id,
            sku: product.sku,
            barcode: product.barcode,
            description: product.description,
            unit: product.unit,
            cost_price: toInputMoney(product.cost_price),
            sale_price: toInputMoney(product.sale_price),
            min_stock: toInputNumber(product.min_stock),
            is_active: product.is_active,
            lockUnit: history.length > 0,
          }}
        />
      </Panel>
    </>
  );
}
