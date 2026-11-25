import { z } from "zod";
import { decimalField, isoDateField, requiredText, uuidField } from "@/lib/actions";
import { DISCOUNT_TYPES } from "@/lib/domain/stock";

export const promotionSchema = z
  .object({
    id: z.string().optional(),
    name: requiredText("o nome da promoção", 80),
    discount_type: z.enum(DISCOUNT_TYPES, { error: "Selecione o tipo de desconto." }),
    discount_value: decimalField("Valor do desconto", { min: 0, max: 99_999_999.99 }),
    starts_on: isoDateField("Data de início"),
    ends_on: isoDateField("Data de término"),
    product_ids: z.array(z.uuid({ error: "Produto inválido." })).min(1, "Selecione ao menos um produto.").max(200, "Selecione no máximo 200 produtos."),
  })
  .superRefine((d, ctx) => {
    if (d.id && !z.uuid().safeParse(d.id).success) ctx.addIssue({ code: "custom", path: ["id"], message: "Promoção inválida." });
    if (d.ends_on < d.starts_on) {
      ctx.addIssue({ code: "custom", path: ["ends_on"], message: "A data de término deve ser igual ou posterior à de início." });
    }
    if (d.discount_type === "percentage" && (d.discount_value <= 0 || d.discount_value > 100)) {
      ctx.addIssue({ code: "custom", path: ["discount_value"], message: "O percentual deve ser maior que 0 e no máximo 100." });
    }
    if (d.discount_type === "amount_off" && d.discount_value <= 0) {
      ctx.addIssue({ code: "custom", path: ["discount_value"], message: "O desconto deve ser maior que zero." });
    }
  });

export const endPromotionSchema = z.object({ id: uuidField("a promoção") });
