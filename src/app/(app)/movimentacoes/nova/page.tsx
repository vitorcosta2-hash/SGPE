import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { PageHeader, Panel } from "@/components/ui/page";
import { registerMovement } from "@/features/produtos/actions";
import { MovementForm } from "@/features/produtos/components/movement-form";
import { listActiveProductOptions } from "@/features/produtos/queries";
import { requireAppContext } from "@/lib/auth/session";
import { newIdempotencyKey } from "@/lib/idempotency";
import { firstParam, type SearchParams } from "@/lib/search";

export const metadata: Metadata = { title: "Nova movimentação" };

export default async function NewMovementPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const ctx = await requireAppContext();
  const products = await listActiveProductOptions(ctx);

  return (
    <>
      <PageHeader
        title="Registrar movimentação"
        actions={
          <ButtonLink href="/movimentacoes" variant="secondary">
            Ver histórico
          </ButtonLink>
        }
      />
      {products.length === 0 ? (
        <Alert variant="warning" title="Nenhum produto ativo">
          Cadastre um produto antes de registrar movimentações.
        </Alert>
      ) : (
        <Panel className="max-w-2xl">
          <MovementForm
            action={registerMovement}
            idempotencyKey={newIdempotencyKey()}
            products={products}
            defaultProductId={firstParam(params.produto)}
          />
        </Panel>
      )}
    </>
  );
}
