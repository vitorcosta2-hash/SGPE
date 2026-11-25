import { z } from "zod";
import {
  checkboxField,
  decimalField,
  optionalDecimalField,
  optionalText,
  requiredText,
  uuidField,
} from "@/lib/actions";
import { isIntegerUnit, MANUAL_MOVEMENT_TYPES, UNIT_CODES } from "@/lib/domain/stock";

const unitField = z.enum(UNIT_CODES, { error: "Selecione a unidade de medida." });

const idempotencyKey = z.uuid({ error: "Formulário expirado. Recarregue a página e tente novamente." });

function checkQuantityPrecision(
  data: { unit: string; min_stock: number; initial_stock?: number | null },
  ctx: z.RefinementCtx,
) {
  if (!isIntegerUnit(data.unit)) return;
  if (!Number.isInteger(data.min_stock)) {
    ctx.addIssue({ code: "custom", path: ["min_stock"], message: "Estoque mínimo: esta unidade aceita apenas números inteiros." });
  }
  if (data.initial_stock != null && !Number.isInteger(data.initial_stock)) {
    ctx.addIssue({ code: "custom", path: ["initial_stock"], message: "Estoque inicial: esta unidade aceita apenas números inteiros." });
  }
}

const productBase = {
  name: requiredText("o nome do produto", 120),
  category_id: uuidField("a categoria"),
  supplier_id: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || z.uuid().safeParse(v).success, "Fornecedor inválido."),
  sku: optionalText("Código (SKU)", 60),
  barcode: optionalText("Código de barras", 60),
  description: optionalText("Descrição", 500),
  unit: unitField,
  cost_price: decimalField("Preço de custo", { max: 99_999_999.99 }),
  sale_price: decimalField("Preço de venda", { max: 99_999_999.99 }),
  min_stock: decimalField("Estoque mínimo", { max: 999_999_999, decimals: 3 }),
  is_active: checkboxField,
};

export const createProductSchema = z
  .object({
    ...productBase,
    initial_stock: optionalDecimalField("Estoque inicial", { max: 999_999_999, decimals: 3 }),
    idempotency_key: idempotencyKey,
  })
  .superRefine(checkQuantityPrecision);

export const updateProductSchema = z
  .object({ id: uuidField("o produto"), ...productBase })
  .superRefine(checkQuantityPrecision);

export const productIdSchema = z.object({ id: uuidField("o produto") });

export const toggleProductSchema = z.object({
  id: uuidField("o produto"),
  active: z.enum(["true", "false"]).transform((v) => v === "true"),
});

/** "count" = contagem de inventário (informa o saldo contado). */
export const MOVEMENT_FORM_TYPES = [...MANUAL_MOVEMENT_TYPES, "count"] as const;

export const movementSchema = z
  .object({
    product_id: uuidField("o produto"),
    type: z.enum(MOVEMENT_FORM_TYPES, { error: "Selecione o tipo de movimentação." }),
    quantity: decimalField("Quantidade", { min: 0, max: 999_999_999, decimals: 3 }),
    reason: optionalText("Motivo", 300),
    idempotency_key: idempotencyKey,
  })
  .superRefine((d, ctx) => {
    if (d.type !== "count" && d.quantity <= 0) {
      ctx.addIssue({ code: "custom", path: ["quantity"], message: "Quantidade: informe um valor maior que zero." });
    }
    if ((d.type === "adjust_in" || d.type === "adjust_out" || d.type === "count") && !d.reason) {
      ctx.addIssue({ code: "custom", path: ["reason"], message: "Informe o motivo do ajuste ou da contagem." });
    }
  });
