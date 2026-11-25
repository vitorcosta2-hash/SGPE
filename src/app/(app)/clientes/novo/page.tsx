import type { Metadata } from "next";
import { PageHeader, Panel } from "@/components/ui/page";
import { createCustomer } from "@/features/clientes/actions";
import { CustomerForm } from "@/features/clientes/components/customer-form";

export const metadata: Metadata = { title: "Novo cliente" };

export default function NewCustomerPage() {
  return (
    <>
      <PageHeader title="Novo cliente" />
      <Panel className="max-w-2xl">
        <CustomerForm action={createCustomer} submitLabel="Cadastrar cliente" />
      </Panel>
    </>
  );
}
