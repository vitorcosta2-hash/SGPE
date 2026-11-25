import { z } from "zod";
import { decimalPlaces } from "@/lib/domain/money";
import { PAYMENT_METHODS } from "@/lib/domain/stock";
import { optionalText, requiredText, uuidField } from "@/lib/actions";

const itemSchema = z.object({
  product_id: z.uuid({ error: "Produto inválido na venda." }),
  quantity: z
    .number({ error: "Quantidade inválida." })
    .positive("A quantidade deve ser maior que zero.")
    .max(999_999_999, "Quantidade muito alta.")
    .refine((n) => decimalPlaces(n) <= 3, "Quantidade: use no máximo 3 casas decimais."),
  discount: z
    .number({ error: "Desconto inválido." })
    .min(0, "O desconto não pode ser negativo.")
    .max(99_999_999.99, "Desconto muito alto.")
    .refine((n) => decimalPlaces(n) <= 2, "Desconto: use no máximo 2 casas decimais."),
});

const itemsField = z
  .string({ error: "Adicione ao menos um produto à venda." })
  .transform((raw, ctx) => {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: "Itens da venda inválidos. Recarregue a página." });
      return z.NEVER;
    }
  })
  .pipe(
    z
      .array(itemSchema, { error: "Itens da venda inválidos." })
      .min(1, "Adicione ao menos um produto à venda.")
      .max(200, "Uma venda pode ter no máximo 200 itens.")
      .refine((items) => new Set(items.map((i) => i.product_id)).size === items.length, "Há produtos repetidos na venda."),
  );

export const saleSchema = z.object({
  items: itemsField,
  customer_id: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .pipe(z.uuid({ error: "Cliente inválido." }).nullable()),
  payment_method: z.enum(PAYMENT_METHODS, { error: "Selecione a forma de pagamento." }),
  notes: optionalText("Observações", 500),
  idempotency_key: z.uuid({ error: "Formulário expirado. Recarregue a página e tente novamente." }),
});

export const cancelSaleSchema = z.object({
  id: uuidField("a venda"),
  reason: requiredText("o motivo do cancelamento", 300, 3),
});
