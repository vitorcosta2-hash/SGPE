"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorState, formDataToObject, successState, validate, type ActionState } from "@/lib/actions";
import { requireAppContext } from "@/lib/auth/session";
import { describeDbError, logDbError } from "@/lib/errors";
import { supplierIdSchema, supplierSchema, updateSupplierSchema } from "./schemas";

export async function createSupplier(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireAppContext();
  const raw = formDataToObject(formData);
  const parsed = validate(supplierSchema, raw);
  if (!parsed.ok) return parsed.state;

  const { error } = await ctx.supabase.from("suppliers").insert({ company_id: ctx.company.id, ...parsed.data });
  if (error) {
    logDbError("createSupplier", error);
    return errorState(describeDbError(error), { values: raw });
  }
  revalidatePath("/fornecedores");
  return successState(`Fornecedor "${parsed.data.name}" cadastrado.`);
}

export async function updateSupplier(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireAppContext();
  const raw = formDataToObject(formData);
  const parsed = validate(updateSupplierSchema, raw);
  if (!parsed.ok) return parsed.state;
  const { id, ...fields } = parsed.data;

  const { data, error } = await ctx.supabase
    .from("suppliers")
    .update(fields)
    .eq("company_id", ctx.company.id)
    .eq("id", id)
    .select("id");
  if (error) {
    logDbError("updateSupplier", error);
    return errorState(describeDbError(error), { values: raw });
  }
  if (!data?.length) return errorState("Fornecedor não encontrado.", { values: raw });

  revalidatePath("/fornecedores");
  redirect("/fornecedores");
}

export async function deleteSupplier(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireAppContext();
  const id = validate(supplierIdSchema, formDataToObject(formData));
  if (!id.ok) return id.state;

  const { data: supplier } = await ctx.supabase
    .from("suppliers_overview")
    .select("name, product_count")
    .eq("company_id", ctx.company.id)
    .eq("id", id.data.id)
    .maybeSingle();
  if (!supplier) return errorState("Fornecedor não encontrado.");
  const count = Number((supplier as { product_count: number }).product_count);
  if (count > 0) {
    return errorState(
      `Este fornecedor possui ${count} ${count === 1 ? "produto associado" : "produtos associados"}. Troque o fornecedor desses produtos antes de excluí-lo.`,
    );
  }

  const { error } = await ctx.supabase.from("suppliers").delete().eq("company_id", ctx.company.id).eq("id", id.data.id);
  if (error) {
    logDbError("deleteSupplier", error);
    return errorState(describeDbError(error));
  }
  revalidatePath("/fornecedores");
  redirect("/fornecedores?aviso=fornecedor-excluido");
}
