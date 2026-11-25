import type { Metadata } from "next";
import Link from "next/link";
import { Search, Users } from "lucide-react";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/fields";
import { FlashNotice } from "@/components/ui/flash-notice";
import { PageHeader } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { listCustomers } from "@/features/clientes/queries";
import { requireAppContext } from "@/lib/auth/session";
import { firstParam, PAGE_SIZE, parsePage, type SearchParams } from "@/lib/search";
import type { CustomerRow } from "@/types/db";

export const metadata: Metadata = { title: "Clientes" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const ctx = await requireAppContext();
  const q = firstParam(params.q);
  const page = parsePage(params.pagina);
  const { rows, total } = await listCustomers(ctx, q, page);
  const dash = <span className="text-muted">—</span>;

  const columns: Column<CustomerRow>[] = [
    { key: "name", header: "Nome", primary: true, cell: (c) => <span className="font-medium">{c.name}</span> },
    { key: "phone", header: "Telefone", cell: (c) => c.phone ?? dash },
    { key: "email", header: "E-mail", cell: (c) => c.email ?? dash },
    {
      key: "actions",
      header: "Ações",
      align: "right",
      mobileNoLabel: true,
      cell: (c) => (
        <Link href={`/clientes/${c.id}/editar`} className={buttonClasses("secondary", "sm")}>
          Editar
        </Link>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Cadastro simples para identificar quem comprou. O cliente é opcional na venda."
        actions={<ButtonLink href="/clientes/novo">Novo cliente</ButtonLink>}
      />
      <FlashNotice code={params.aviso} />
      <form method="get" role="search" className="mb-5 flex max-w-lg gap-2">
        <Input name="q" defaultValue={q ?? ""} placeholder="Nome, telefone ou e-mail" aria-label="Buscar cliente" />
        <button type="submit" className={buttonClasses("secondary", "md")}>
          <Search aria-hidden className="h-4 w-4" /> Buscar
        </button>
      </form>
      {rows.length === 0 ? (
        <EmptyState
          icon={<Users aria-hidden className="h-8 w-8" />}
          title={q ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
          description={q ? "Tente outro termo de busca." : "Cadastre clientes para vinculá-los às vendas."}
          action={q ? undefined : <ButtonLink href="/clientes/novo">Cadastrar cliente</ButtonLink>}
        />
      ) : (
        <>
          <DataTable columns={columns} rows={rows} rowKey={(c) => c.id} caption="Lista de clientes" />
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/clientes" params={{ q }} />
        </>
      )}
    </>
  );
}
