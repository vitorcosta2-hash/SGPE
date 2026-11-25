"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorState, formDataToObject, successState, validate, type ActionState } from "@/lib/actions";
import { requireAppContext } from "@/lib/auth/session";
import { describeDbError, logDbError } from "@/lib/errors";
import { companySchema, profileSchema } from "./schemas";

export async function updateCompany(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireAppContext();
  if (ctx.role !== "owner") return errorState("Apenas o proprietário pode alterar os dados da empresa.");

  const raw = formDataToObject(formData);
  const parsed = validate(companySchema, raw);
  if (!parsed.ok) return parsed.state;

  const { data, error } = await ctx.supabase.from("companies").update(parsed.data).eq("id", ctx.company.id).select("id");
  if (error) {
    logDbError("updateCompany", error);
    return errorState(describeDbError(error), { values: raw });
  }
  if (!data?.length) return errorState("Não foi possível salvar. Verifique suas permissões.", { values: raw });

  revalidatePath("/", "layout");
  redirect("/configuracoes?aviso=configuracoes-salvas");
}

export async function updateProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireAppContext();
  const raw = formDataToObject(formData);
  const parsed = validate(profileSchema, raw);
  if (!parsed.ok) return parsed.state;

  const { error } = await ctx.supabase.from("profiles").update({ full_name: parsed.data.full_name }).eq("id", ctx.user.id);
  if (error) {
    logDbError("updateProfile", error);
    return errorState(describeDbError(error), { values: raw });
  }
  revalidatePath("/", "layout");
  return successState("Nome atualizado.");
}
