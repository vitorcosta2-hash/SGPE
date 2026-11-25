import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader, Panel } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { updateCategory } from "@/features/categorias/actions";
import { CategoryForm } from "@/features/categorias/components/category-form";
import { getCategory } from "@/features/categorias/queries";
import { requireAppContext } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Editar categoria" };

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAppContext();
  const category = /^[0-9a-f-]{36}$/i.test(id) ? await getCategory(ctx, id) : null;
  if (!category) notFound();

  return (
    <>
      <PageHeader
        title="Editar categoria"
        actions={
          <ButtonLink href="/categorias" variant="secondary">
            Voltar
          </ButtonLink>
        }
      />
      <Panel className="max-w-xl">
        <CategoryForm action={updateCategory} category={category} submitLabel="Salvar alterações" />
      </Panel>
    </>
  );
}
