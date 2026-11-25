import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader, Panel } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { updateSupplier } from "@/features/fornecedores/actions";
import { SupplierForm } from "@/features/fornecedores/components/supplier-form";
import { getSupplier } from "@/features/fornecedores/queries";
import { requireAppContext } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Editar fornecedor" };

export default async function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAppContext();
  const supplier = /^[0-9a-f-]{36}$/i.test(id) ? await getSupplier(ctx, id) : null;
  if (!supplier) notFound();

  return (
    <>
      <PageHeader
        title="Editar fornecedor"
        actions={
          <ButtonLink href="/fornecedores" variant="secondary">
            Voltar
          </ButtonLink>
        }
      />
      <Panel className="max-w-xl">
        <SupplierForm action={updateSupplier} supplier={supplier} submitLabel="Salvar alterações" cancelHref="/fornecedores" />
      </Panel>
    </>
  );
}
