"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorState, formDataToObject, validate, type ActionState } from "@/lib/actions";
import { requireAppContext } from "@/lib/auth/session";
import { describeDbError, logDbError } from "@/lib/errors";
import { endPromotionSchema, promotionSchema } from "./schemas";

export async function savePromotion(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireAppContext();
  const raw = formDataToObject(formData);
  const productIds = formData.getAll("product_ids").filter((v): v is string => typeof v === "string");
  const parsed = validate(promotionSchema, { ...raw, product_ids: productIds }, { ...raw });
  if (!parsed.ok) return { ...parsed.state, values: { ...raw, product_ids: productIds.join(",") } };
  const d = parsed.data;

  const { data, error } = await ctx.supabase.rpc("save_promotion", {
    p_company_id: ctx.company.id,
    p_promotion_id: d.id || null,
    p_name: d.name,
    p_discount_type: d.discount_type,
    p_discount_value: d.discount_value,
    p_starts_on: d.starts_on,
    p_ends_on: d.ends_on,
    p_product_ids: d.product_ids,
  });
  if (error) {
    logDbError("savePromotion", error);
    return errorState(describeDbError(error), { values: { ...raw, product_ids: productIds.join(",") } });
  }

  for (const path of ["/promocoes", "/produtos", "/vendas/nova"]) revalidatePath(path);
  const id = (data as { id?: string } | null)?.id;
  redirect(id ? `/promocoes/${id}?aviso=promocao-salva` : "/promocoes?aviso=promocao-salva");
}

export async function endPromotion(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireAppContext();
  const parsed = validate(endPromotionSchema, formDataToObject(formData));
  if (!parsed.ok) return parsed.state;

  const { error } = await ctx.supabase.rpc("end_promotion", { p_company_id: ctx.company.id, p_promotion_id: parsed.data.id });
  if (error) {
    logDbError("endPromotion", error);
    return errorState(describeDbError(error));
  }
  for (const path of ["/promocoes", "/produtos"]) revalidatePath(path);
  revalidatePath(`/promocoes/${parsed.data.id}`);
  redirect(`/promocoes/${parsed.data.id}?aviso=promocao-encerrada`);
}
