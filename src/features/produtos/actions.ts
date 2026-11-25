"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorState, formDataToObject, successState, validate, type ActionState } from "@/lib/actions";
import { requireAppContext } from "@/lib/auth/session";
import { describeDbError, logDbError } from "@/lib/errors";
import { createProductSchema, movementSchema, toggleProductSchema, updateProductSchema } from "./schemas";

function revalidateStock(productId?: string) {
  revalidatePath("/");
  revalidatePath("/produtos");
  revalidatePath("/movimentacoes");
  if (productId) revalidatePath(`/produtos/${productId}`);
}

export async function createProduct(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireAppContext();
  const raw = formDataToObject(formData);
  const parsed = validate(createProductSchema, raw);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;

  const { data, error } = await ctx.supabase.rpc("create_product", {
    p_company_id: ctx.company.id,
    p_name: d.name,
    p_category_id: d.category_id,
    p_sku: d.sku,
    p_barcode: d.barcode,
    p_description: d.description,
    p_unit: d.unit,
    p_cost_price: d.cost_price,
    p_sale_price: d.sale_price,
    p_min_stock: d.min_stock,
    p_initial_stock: d.initial_stock ?? 0,
    p_is_active: d.is_active,
    p_idempotency_key: d.idempotency_key,
    p_supplier_id: d.supplier_id,
  });
  if (error) {
    logDbError("createProduct", error);
    return errorState(describeDbError(error), { values: raw });
  }

  revalidateStock();
  const id = typeof data === "string" ? data : (data as { id?: string } | null)?.id;
  redirect(id ? `/produtos/${id}?aviso=produto-criado` : "/produtos?aviso=produto-criado");
}

export async function updateProduct(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireAppContext();
  const raw = formDataToObject(formData);
  const parsed = validate(updateProductSchema, raw);
  if (!parsed.ok) return parsed.state;
  const { id, ...d } = parsed.data;

  const { data, error } = await ctx.supabase
    .from("products")
    .update({
      category_id: d.category_id,
      supplier_id: d.supplier_id,
      name: d.name,
      sku: d.sku,
      barcode: d.barcode,
      description: d.description,
      unit: d.unit,
      cost_price: d.cost_price,
      sale_price: d.sale_price,
      min_stock: d.min_stock,
      is_active: d.is_active,
    })
    .eq("company_id", ctx.company.id)
    .eq("id", id)
    .select("id");
  if (error) {
    logDbError("updateProduct", error);
    return errorState(describeDbError(error), { values: raw });
  }
  if (!data?.length) return errorState("Produto não encontrado.", { values: raw });

  revalidateStock(id);
  redirect(`/produtos/${id}?aviso=produto-atualizado`);
}

export async function setProductActive(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireAppContext();
  const parsed = validate(toggleProductSchema, formDataToObject(formData));
  if (!parsed.ok) return parsed.state;

  const { data, error } = await ctx.supabase
    .from("products")
    .update({ is_active: parsed.data.active })
    .eq("company_id", ctx.company.id)
    .eq("id", parsed.data.id)
    .select("id");
  if (error) {
    logDbError("setProductActive", error);
    return errorState(describeDbError(error));
  }
  if (!data?.length) return errorState("Produto não encontrado.");

  revalidateStock(parsed.data.id);
  return successState(parsed.data.active ? "Produto reativado." : "Produto desativado. O histórico foi preservado.");
}

/** Entrada, saída manual, ajuste (+/−) ou contagem de inventário. */
export async function registerMovement(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireAppContext();
  const raw = formDataToObject(formData);
  const parsed = validate(movementSchema, raw);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;

  const { error } =
    d.type === "count"
      ? await ctx.supabase.rpc("register_inventory_count", {
          p_company_id: ctx.company.id,
          p_product_id: d.product_id,
          p_counted: d.quantity,
          p_reason: d.reason,
          p_idempotency_key: d.idempotency_key,
        })
      : await ctx.supabase.rpc("register_stock_movement", {
          p_company_id: ctx.company.id,
          p_product_id: d.product_id,
          p_type: d.type,
          p_quantity: d.quantity,
          p_reason: d.reason,
          p_idempotency_key: d.idempotency_key,
        });
  if (error) {
    logDbError("registerMovement", error);
    return errorState(describeDbError(error), { values: raw });
  }

  revalidateStock(d.product_id);
  return successState("Movimentação registrada e saldo atualizado.");
}
