import type { Metadata } from "next";
import Link from "next/link";
import { Search, Truck } from "lucide-react";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { buttonClasses } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Input } from "@/components/ui/fields";
import { FlashNotice } from "@/components/ui/flash-notice";
import { InlineConfirm } from "@/components/ui/inline-confirm";
import { PageHeader, Section } from "@/components/ui/page";
import { SupplierForm } from "@/features/fornecedores/components/supplier-form";
import { createSupplier, deleteSupplier } from "@/features/fornecedores/actions";
import { listSuppliers } from "@/features/fornecedores/queries";
import { requireAppContext } from "@/lib/auth/session";
import { firstParam, type SearchParams } from "@/lib/search";
import type { SupplierRow } from "@/types/db";

export const metadata: Metadata = { title: "Fornecedores" };

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const ctx = await requireAppContext();
  const q = firstParam(params.q) ?? "";
  const suppliers = await listSuppliers(ctx, q);

  const columns: Column<SupplierRow>[] = [
    { key: "name", header: "Fornecedor", primary: true, cell: (s) => <span className="font-medium">{s.name}</span> },
    { key: "phone", header: "Telefone", cell: (s) => s.phone ?? <span className="text-muted">—</span> },
    { key: "email", header: "E-mail", cell: (s) => s.email ?? <span className="text-muted">—</span> },
    {
      key: "products",
      header: "Produtos",
      align: "right",
      cell: (s) => (
        <Link href={`/produtos?fornecedor=${s.id}`} className="text-brand underline-offset-2 hover:underline">
          {s.product_count}
        </Link>
      ),
    },
    {
      key: "actions",
      header: "Ações",
      mobileNoLabel: true,
      align: "right",
      cell: (s) => (
        <div className="flex flex-wrap items-center justify-end gap-2 text-left">
          <Link href={`/fornecedores/${s.id}/editar`} className={buttonClasses("secondary", "sm")}>
            Editar
          </Link>
          {s.product_count > 0 ? (
            <Badge variant="neutral">Em uso</Badge>
          ) : (
            <InlineConfirm
              triggerLabel="Excluir"
              title={`Excluir o fornecedor "${s.name}"?`}
              description="Esta ação não pode ser desfeita."
              confirmLabel="Confirmar exclusão"
              pendingLabel="Excluindo…"
              action={deleteSupplier}
              hidden={{ id: s.id }}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Fornecedores" description="Cadastre quem fornece seus produtos. Um fornecedor só pode ser excluído quando não tem produtos associados." />
      <FlashNotice code={params.aviso} />

      <Section title="Novo fornecedor">
        <SupplierForm action={createSupplier} submitLabel="Cadastrar" />
      </Section>

      <Section title="Seus fornecedores">
        <form method="get" className="mb-4 flex max-w-md gap-2" role="search">
          <Input name="q" defaultValue={q} placeholder="Buscar por nome" aria-label="Buscar fornecedor" />
          <button type="submit" className={buttonClasses("secondary", "md")}>
            <Search aria-hidden className="h-4 w-4" /> Buscar
          </button>
        </form>
        {suppliers.length === 0 ? (
          <EmptyState
            icon={<Truck aria-hidden className="h-8 w-8" />}
            title={q ? "Nenhum fornecedor encontrado" : "Nenhum fornecedor cadastrado"}
            description={q ? "Tente outro termo de busca." : "Cadastre o primeiro fornecedor no formulário acima."}
          />
        ) : (
          <DataTable columns={columns} rows={suppliers} rowKey={(s) => s.id} caption="Lista de fornecedores" />
        )}
      </Section>
    </>
  );
}
