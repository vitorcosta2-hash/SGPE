"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { decimalField, errorState, formDataToObject, successState, uuidField, validate, type ActionState } from "@/lib/actions";
import { requireAppContext } from "@/lib/auth/session";
import { describeDbError, logDbError } from "@/lib/errors";

const applyPriceSchema = z.object({
  product_id: uuidField("o produto"),
  price: decimalField("Preço de venda", { min: 0.01, max: 99_999_999.99 }),
});

/** Atualiza o preço de venda do produto. Só é chamada depois da confirmação do usuário. */
export async function applyProductPrice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireAppContext();
  const parsed = validate(applyPriceSchema, formDataToObject(formData));
  if (!parsed.ok) return parsed.state;

  const { data, error } = await ctx.supabase
    .from("products")
    .update({ sale_price: parsed.data.price })
    .eq("company_id", ctx.company.id)
    .eq("id", parsed.data.product_id)
    .select("id");
  if (error) {
    logDbError("applyProductPrice", error);
    return errorState(describeDbError(error));
  }
  if (!data?.length) return errorState("Produto não encontrado.");

  revalidatePath("/produtos");
  revalidatePath(`/produtos/${parsed.data.product_id}`);
  revalidatePath("/precificacao");
  return successState("Preço de venda atualizado no cadastro do produto.");
}
