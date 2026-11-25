import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader, Panel } from "@/components/ui/page";
import { updateCustomer } from "@/features/clientes/actions";
import { CustomerForm } from "@/features/clientes/components/customer-form";
import { getCustomer } from "@/features/clientes/queries";
import { requireAppContext } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Editar cliente" };

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAppContext();
  const customer = await getCustomer(ctx, id);
  if (!customer) notFound();
  return (
    <>
      <PageHeader title="Editar cliente" />
      <Panel className="max-w-2xl">
        <CustomerForm action={updateCustomer} customer={customer} submitLabel="Salvar alterações" />
      </Panel>
    </>
  );
}
