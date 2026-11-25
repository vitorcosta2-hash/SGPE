import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { listCustomerOptions } from "@/features/clientes/queries";
import { registerSale } from "@/features/vendas/actions";
import { SaleForm } from "@/features/vendas/components/sale-form";
import { requireAppContext } from "@/lib/auth/session";
import { newIdempotencyKey } from "@/lib/idempotency";

export const metadata: Metadata = { title: "Nova venda" };

export default async function NewSalePage() {
  const ctx = await requireAppContext();
  const customers = await listCustomerOptions(ctx);

  return (
    <>
      <PageHeader
        title="Nova venda"
        description="Adicione os produtos e conclua. O estoque é baixado automaticamente."
        actions={
          <ButtonLink href="/vendas" variant="secondary">
            Ver vendas
          </ButtonLink>
        }
      />
      <SaleForm action={registerSale} idempotencyKey={newIdempotencyKey()} customers={customers} currency={ctx.company.currency} />
    </>
  );
}
