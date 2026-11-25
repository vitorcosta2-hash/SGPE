"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorState, formDataToObject, successState, validate, type ActionState } from "@/lib/actions";
import { requireAppContext } from "@/lib/auth/session";
import { describeDbError, logDbError } from "@/lib/errors";
import { categoryIdSchema, categorySchema } from "./schemas";

export async function createCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireAppContext();
  const raw = formDataToObject(formData);
  const parsed = validate(categorySchema, raw);
  if (!parsed.ok) return parsed.state;

  const { error } = await ctx.supabase
    .from("categories")
    .insert({ company_id: ctx.company.id, name: parsed.data.name, description: parsed.data.description });
  if (error) {
    logDbError("createCategory", error);
    return errorState(describeDbError(error), { values: raw });
  }

  revalidatePath("/categorias");
  return successState(`Categoria "${parsed.data.name}" criada.`);
}

export async function updateCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireAppContext();
  const raw = formDataToObject(formData);
  const id = validate(categoryIdSchema, raw);
  if (!id.ok) return id.state;
  const parsed = validate(categorySchema, raw);
  if (!parsed.ok) return parsed.state;

  const { data, error } = await ctx.supabase
    .from("categories")
    .update({ name: parsed.data.name, description: parsed.data.description })
    .eq("company_id", ctx.company.id)
    .eq("id", id.data.id)
    .select("id");
  if (error) {
    logDbError("updateCategory", error);
    return errorState(describeDbError(error), { values: raw });
  }
  if (!data?.length) return errorState("Categoria não encontrada.");

  revalidatePath("/categorias");
  redirect("/categorias");
}

export async function deleteCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireAppContext();
  const id = validate(categoryIdSchema, formDataToObject(formData));
  if (!id.ok) return id.state;

  // Explica o motivo antes de tentar (o banco também impede via chave estrangeira).
  const { data: category } = await ctx.supabase
    .from("categories_overview")
    .select("name, product_count")
    .eq("company_id", ctx.company.id)
    .eq("id", id.data.id)
    .maybeSingle();
  if (!category) return errorState("Categoria não encontrada.");
  const count = Number((category as { product_count: number }).product_count);
  if (count > 0) {
    return errorState(
      `Esta categoria possui ${count} ${count === 1 ? "produto associado" : "produtos associados"}. Mova-${count === 1 ? "o" : "os"} para outra categoria antes de excluí-la.`,
    );
  }

  const { error } = await ctx.supabase.from("categories").delete().eq("company_id", ctx.company.id).eq("id", id.data.id);
  if (error) {
    logDbError("deleteCategory", error);
    return errorState(describeDbError(error));
  }

  revalidatePath("/categorias");
  redirect("/categorias?aviso=categoria-excluida");
}
