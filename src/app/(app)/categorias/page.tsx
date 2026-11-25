import type { Metadata } from "next";
import Link from "next/link";
import { Search, Tags } from "lucide-react";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { buttonClasses } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Input } from "@/components/ui/fields";
import { FlashNotice } from "@/components/ui/flash-notice";
import { InlineConfirm } from "@/components/ui/inline-confirm";
import { PageHeader, Section } from "@/components/ui/page";
import { CategoryForm } from "@/features/categorias/components/category-form";
import { createCategory, deleteCategory } from "@/features/categorias/actions";
import { listCategories } from "@/features/categorias/queries";
import { requireAppContext } from "@/lib/auth/session";
import { firstParam, type SearchParams } from "@/lib/search";
import type { CategoryRow } from "@/types/db";

export const metadata: Metadata = { title: "Categorias" };

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const ctx = await requireAppContext();
  const q = firstParam(params.q) ?? "";
  const categories = await listCategories(ctx, q);

  const columns: Column<CategoryRow>[] = [
    { key: "name", header: "Categoria", primary: true, cell: (c) => <span className="font-medium">{c.name}</span> },
    { key: "description", header: "Descrição", cell: (c) => c.description ?? <span className="text-muted">—</span>, className: "max-w-xs truncate" },
    {
      key: "products",
      header: "Produtos",
      align: "right",
      cell: (c) => (
        <Link href={`/produtos?categoria=${c.id}`} className="text-brand underline-offset-2 hover:underline">
          {c.product_count}
        </Link>
      ),
    },
    {
      key: "actions",
      header: "Ações",
      mobileNoLabel: true,
      align: "right",
      cell: (c) => (
        <div className="flex flex-wrap items-center justify-end gap-2 text-left">
          <Link href={`/categorias/${c.id}/editar`} className={buttonClasses("secondary", "sm")}>
            Editar
          </Link>
          {c.product_count > 0 ? (
            <Badge variant="neutral">Em uso</Badge>
          ) : (
            <InlineConfirm
              triggerLabel="Excluir"
              title={`Excluir a categoria "${c.name}"?`}
              description="Esta ação não pode ser desfeita."
              confirmLabel="Confirmar exclusão"
              pendingLabel="Excluindo…"
              action={deleteCategory}
              hidden={{ id: c.id }}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Categorias" description="Organize os produtos em grupos. Uma categoria só pode ser excluída quando não tem produtos." />
      <FlashNotice code={params.aviso} />

      <Section title="Nova categoria">
        <CategoryForm action={createCategory} submitLabel="Adicionar" inline />
      </Section>

      <Section title="Suas categorias">
        <form method="get" className="mb-4 flex max-w-md gap-2" role="search">
          <Input name="q" defaultValue={q} placeholder="Buscar por nome" aria-label="Buscar categoria" />
          <button type="submit" className={buttonClasses("secondary", "md")}>
            <Search aria-hidden className="h-4 w-4" /> Buscar
          </button>
        </form>

        {categories.length === 0 ? (
          <EmptyState
            icon={<Tags aria-hidden className="h-8 w-8" />}
            title={q ? "Nenhuma categoria encontrada" : "Nenhuma categoria cadastrada"}
            description={q ? "Tente outro termo de busca." : "Crie sua primeira categoria no formulário acima."}
          />
        ) : (
          <DataTable columns={columns} rows={categories} rowKey={(c) => c.id} caption="Lista de categorias" />
        )}
      </Section>
    </>
  );
}
