"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorState, formDataToObject, validate, type ActionState } from "@/lib/actions";
import { requireAppContext } from "@/lib/auth/session";
import { describeDbError, logDbError } from "@/lib/errors";
import { customerSchema, updateCustomerSchema } from "./schemas";

export async function createCustomer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireAppContext();
  const raw = formDataToObject(formData);
  const parsed = validate(customerSchema, raw);
  if (!parsed.ok) return parsed.state;

  const { error } = await ctx.supabase.from("customers").insert({ company_id: ctx.company.id, ...parsed.data });
  if (error) {
    logDbError("createCustomer", error);
    return errorState(describeDbError(error), { values: raw });
  }
  revalidatePath("/clientes");
  redirect("/clientes?aviso=cliente-criado");
}

export async function updateCustomer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireAppContext();
  const raw = formDataToObject(formData);
  const parsed = validate(updateCustomerSchema, raw);
  if (!parsed.ok) return parsed.state;
  const { id, ...data } = parsed.data;

  const { data: updated, error } = await ctx.supabase.from("customers").update(data).eq("company_id", ctx.company.id).eq("id", id).select("id");
  if (error) {
    logDbError("updateCustomer", error);
    return errorState(describeDbError(error), { values: raw });
  }
  if (!updated?.length) return errorState("Cliente não encontrado.", { values: raw });
  revalidatePath("/clientes");
  redirect("/clientes?aviso=cliente-atualizado");
}
