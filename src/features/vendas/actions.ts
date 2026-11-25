"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorState, formDataToObject, validate, type ActionState } from "@/lib/actions";
import { requireAppContext, canManage } from "@/lib/auth/session";
import { describeDbError, logDbError } from "@/lib/errors";
import { cancelSaleSchema, saleSchema } from "./schemas";

function revalidateAfterSale(saleId?: string) {
  for (const path of ["/", "/vendas", "/produtos", "/movimentacoes", "/relatorios"]) revalidatePath(path);
  if (saleId) revalidatePath(`/vendas/${saleId}`);
}

export async function registerSale(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireAppContext();
  const raw = formDataToObject(formData);
  const parsed = validate(saleSchema, raw);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;

  // Somente produto, quantidade e desconto vão ao banco; preços e totais são calculados lá.
  const { data, error } = await ctx.supabase.rpc("register_sale", {
    p_company_id: ctx.company.id,
    p_customer_id: d.customer_id,
    p_payment_method: d.payment_method,
    p_items: d.items,
    p_notes: d.notes,
    p_idempotency_key: d.idempotency_key,
  });
  if (error) {
    logDbError("registerSale", error);
    return errorState(describeDbError(error), { values: raw });
  }

  revalidateAfterSale();
  const id = (data as { id?: string } | null)?.id;
  redirect(id ? `/vendas/${id}?aviso=venda-registrada` : "/vendas?aviso=venda-registrada");
}

export async function cancelSale(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireAppContext();
  if (!canManage(ctx.role)) return errorState("Apenas proprietários e gerentes podem cancelar vendas.");

  const parsed = validate(cancelSaleSchema, formDataToObject(formData));
  if (!parsed.ok) return parsed.state;

  const { error } = await ctx.supabase.rpc("cancel_sale", {
    p_company_id: ctx.company.id,
    p_sale_id: parsed.data.id,
    p_reason: parsed.data.reason,
  });
  if (error) {
    logDbError("cancelSale", error);
    return errorState(describeDbError(error));
  }

  revalidateAfterSale(parsed.data.id);
  redirect(`/vendas/${parsed.data.id}?aviso=venda-cancelada`);
}
