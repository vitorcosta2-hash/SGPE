import { z } from "zod";
import { decimalField, optionalText, requiredText } from "@/lib/actions";

export const BR_TIMEZONES = [
  { value: "America/Sao_Paulo", label: "Brasília (Sudeste, Sul, Nordeste parcial, Goiás)" },
  { value: "America/Campo_Grande", label: "Mato Grosso do Sul" },
  { value: "America/Cuiaba", label: "Mato Grosso" },
  { value: "America/Manaus", label: "Amazonas, Rondônia, Roraima" },
  { value: "America/Rio_Branco", label: "Acre" },
  { value: "America/Fortaleza", label: "Ceará e Nordeste (sem horário de verão)" },
  { value: "America/Noronha", label: "Fernando de Noronha" },
] as const;

export const companySchema = z.object({
  name: requiredText("o nome da empresa", 120, 2),
  contact_email: z
    .string()
    .trim()
    .max(120, "E-mail: máximo de 120 caracteres.")
    .optional()
    .transform((v) => (v ? v.toLowerCase() : null))
    .refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Informe um e-mail válido."),
  contact_phone: optionalText("Telefone", 30),
  timezone: z.enum(BR_TIMEZONES.map((t) => t.value) as [string, ...string[]], { error: "Selecione o fuso horário." }),
  default_min_stock: decimalField("Estoque mínimo padrão", { max: 999_999_999, decimals: 3 }),
  min_margin_percent: decimalField("Margem mínima", { max: 99.99, decimals: 2 }),
});

export const profileSchema = z.object({ full_name: requiredText("seu nome", 120, 2) });
