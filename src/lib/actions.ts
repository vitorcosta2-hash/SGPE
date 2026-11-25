import { z } from "zod";
import { decimalPlaces, parseDecimal } from "@/lib/domain/money";

/** Estado devolvido pelas Server Actions aos formulários (useActionState). */
export interface ActionState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Valores enviados, para repreencher o formulário após um erro. */
  values?: Record<string, string>;
  /** Identificador do envio: muda a cada sucesso para reiniciar o formulário. */
  nonce?: number;
}

export const initialActionState: ActionState = { status: "idle" };

export function errorState(message: string, extra: Partial<ActionState> = {}): ActionState {
  return { status: "error", message, ...extra };
}

export function successState(message: string, extra: Partial<ActionState> = {}): ActionState {
  return { status: "success", message, nonce: Date.now(), ...extra };
}

/** Converte FormData em objeto de strings (campos repetidos viram o último valor; use getAll para listas). */
export function formDataToObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$ACTION")) out[key] = value;
  }
  return out;
}

export type ValidationResult<T> = { ok: true; data: T } | { ok: false; state: ActionState };

/** Valida com zod e devolve erros por campo no formato esperado pelos formulários. */
export function validate<S extends z.ZodType>(
  schema: S,
  raw: Record<string, unknown>,
  values?: Record<string, string>,
): ValidationResult<z.output<S>> {
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };

  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_form";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  const first = Object.values(fieldErrors)[0];
  return {
    ok: false,
    state: errorState(first ?? "Revise os campos do formulário.", {
      fieldErrors,
      values: values ?? stringifyValues(raw),
    }),
  };
}

function stringifyValues(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string") out[k] = v;
  return out;
}

/* ------------------------------------------------------------------ */
/* Campos de formulário reutilizáveis (zod)                           */
/* ------------------------------------------------------------------ */

/** Texto obrigatório com limites. */
export const requiredText = (label: string, max: number, min = 1) =>
  z
    .string({ error: `Informe ${label}.` })
    .trim()
    .min(min, min > 1 ? `${label}: mínimo de ${min} caracteres.` : `Informe ${label}.`)
    .max(max, `${label}: máximo de ${max} caracteres.`);

/** Texto opcional: vazio vira null. */
export const optionalText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${label}: máximo de ${max} caracteres.`)
    .optional()
    .transform((v) => (v ? v : null));

interface DecimalOptions {
  min?: number;
  max?: number;
  decimals?: number;
}

/** Número digitado em formato brasileiro (obrigatório). */
export const decimalField = (label: string, { min = 0, max = 999_999_999, decimals = 2 }: DecimalOptions = {}) =>
  z
    .string({ error: `Informe ${label}.` })
    .transform((raw, ctx) => {
      const text = raw.trim();
      if (text === "") {
        ctx.addIssue({ code: "custom", message: `Informe ${label}.` });
        return z.NEVER;
      }
      const value = parseDecimal(text);
      if (value === null) {
        ctx.addIssue({ code: "custom", message: `${label}: informe um número válido (ex.: 10,50).` });
        return z.NEVER;
      }
      if (value < min) {
        ctx.addIssue({ code: "custom", message: `${label}: o valor mínimo é ${formatLimit(min)}.` });
        return z.NEVER;
      }
      if (value > max) {
        ctx.addIssue({ code: "custom", message: `${label}: o valor máximo é ${formatLimit(max)}.` });
        return z.NEVER;
      }
      if (decimalPlaces(value) > decimals) {
        ctx.addIssue({
          code: "custom",
          message: decimals === 0 ? `${label}: informe um número inteiro.` : `${label}: use no máximo ${decimals} casas decimais.`,
        });
        return z.NEVER;
      }
      return value;
    });

/** Número opcional (vazio vira null). */
export const optionalDecimalField = (label: string, options: DecimalOptions = {}) =>
  z
    .string()
    .optional()
    .transform((raw, ctx) => {
      const text = (raw ?? "").trim();
      if (text === "") return null;
      const parsed = decimalField(label, options).safeParse(text);
      if (!parsed.success) {
        ctx.addIssue({ code: "custom", message: parsed.error.issues[0]?.message ?? `${label} inválido.` });
        return z.NEVER;
      }
      return parsed.data;
    });

export const uuidField = (label: string) => z.uuid({ error: `Selecione ${label}.` });

/** Caixa de seleção (checkbox): presente = verdadeiro. */
export const checkboxField = z
  .string()
  .optional()
  .transform((v) => v === "on" || v === "true" || v === "1");

export const isoDateField = (label: string) =>
  z
    .string({ error: `Informe ${label}.` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label}: informe uma data válida.`)
    .refine((v) => {
      const [y, m, d] = v.split("-").map(Number);
      const date = new Date(Date.UTC(y, m - 1, d));
      return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
    }, `${label}: informe uma data válida.`);

function formatLimit(n: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(n);
}
