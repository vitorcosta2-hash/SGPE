import { z } from "zod";
import { optionalText, requiredText, uuidField } from "@/lib/actions";

const optionalEmail = z
  .string()
  .trim()
  .max(120, "E-mail: máximo de 120 caracteres.")
  .optional()
  .transform((v) => (v ? v.toLowerCase() : null))
  .refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Informe um e-mail válido.");

export const supplierSchema = z.object({
  name: requiredText("o nome do fornecedor", 120),
  phone: optionalText("Telefone", 30),
  email: optionalEmail,
  notes: optionalText("Observações", 500),
});

export const updateSupplierSchema = supplierSchema.extend({ id: uuidField("o fornecedor") });
export const supplierIdSchema = z.object({ id: uuidField("o fornecedor") });
