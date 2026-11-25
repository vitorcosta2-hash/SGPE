import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { PageHeader, Panel } from "@/components/ui/page";
import { listCategoryOptions } from "@/features/categorias/queries";
import { listSupplierOptions } from "@/features/fornecedores/queries";
import { createProduct } from "@/features/produtos/actions";
import { ProductForm } from "@/features/produtos/components/product-form";
import { requireAppContext } from "@/lib/auth/session";
import { newIdempotencyKey } from "@/lib/idempotency";

export const metadata: Metadata = { title: "Novo produto" };

export default async function NewProductPage() {
  const ctx = await requireAppContext();
  const [categories, suppliers] = await Promise.all([listCategoryOptions(ctx), listSupplierOptions(ctx)]);

  return (
    <>
      <PageHeader
        title="Novo produto"
        actions={
          <ButtonLink href="/produtos" variant="secondary">
            Voltar
          </ButtonLink>
        }
      />
      {categories.length === 0 ? (
        <Alert variant="warning" title="Cadastre uma categoria primeiro">
          Todo produto precisa de uma categoria. Crie uma em Categorias e volte aqui.
        </Alert>
      ) : (
        <Panel className="max-w-3xl">
          <ProductForm
            action={createProduct}
            categories={categories}
            suppliers={suppliers}
            defaultMinStock={ctx.company.default_min_stock}
            idempotencyKey={newIdempotencyKey()}
            cancelHref="/produtos"
            submitLabel="Cadastrar produto"
          />
        </Panel>
      )}
    </>
  );
}
