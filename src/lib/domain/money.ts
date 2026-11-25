/**
 * Aritmética monetária em CENTAVOS (inteiros) e quantidades em MILÉSIMOS.
 * Evita erros de ponto flutuante e reproduz o arredondamento do PostgreSQL
 * (numeric/round: metade para cima em valores positivos), de modo que a prévia
 * exibida ao usuário coincida com o valor gravado pelo banco.
 */

export const toCents = (value: number): number => Math.round(value * 100);
export const fromCents = (cents: number): number => cents / 100;
export const toMilli = (value: number): number => Math.round(value * 1000);

/** round(valor, 2) com "metade para cima", sem erro de binário (ex.: 1.005 -> 1.01). */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON * Math.sign(value)) * 100) / 100;
}

/** Valor bruto da linha: round(quantidade * preço, 2), em centavos. */
export function lineGrossCents(quantity: number, unitPrice: number): number {
  const qtyMilli = toMilli(quantity);
  const priceCents = toCents(unitPrice);
  return Math.floor((qtyMilli * priceCents + 500) / 1000);
}

/** Número de casas decimais de um valor já normalizado (ex.: "12.345" -> 3). */
export function decimalPlaces(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const text = String(value);
  if (text.includes("e-")) {
    const [base, exp] = text.split("e-");
    return (base.split(".")[1]?.length ?? 0) + Number(exp);
  }
  return text.split(".")[1]?.length ?? 0;
}

/**
 * Interpreta números digitados em formato brasileiro ou simples.
 *   "1.234,56" -> 1234.56   "12,5" -> 12.5   "12.5" -> 12.5
 *   "1.234.567" -> 1234567  (vários pontos = separador de milhar)
 * Regra: havendo vírgula, ela é o separador decimal e os pontos são de milhar;
 * sem vírgula, um único ponto é tratado como separador decimal.
 * Retorna null quando não é um número válido.
 */
export function parseDecimal(input: string | null | undefined): number | null {
  if (input == null) return null;
  let text = String(input).trim().replace(/^R\$\s*/i, "").replace(/\s+/g, "");
  if (text === "") return null;

  const negative = text.startsWith("-");
  if (negative) text = text.slice(1);

  const GROUPED = /^\d{1,3}(\.\d{3})+$/; // 1.234 / 12.345.678 (milhar)
  let normalized: string;

  if (text.includes(",")) {
    const parts = text.split(",");
    if (parts.length !== 2) return null;
    const [integerPart, fractionPart] = parts;
    if (!/^\d+$/.test(fractionPart)) return null;
    if (integerPart.includes(".")) {
      if (!GROUPED.test(integerPart)) return null;
    } else if (!/^\d*$/.test(integerPart)) {
      return null;
    }
    normalized = `${integerPart.replace(/\./g, "") || "0"}.${fractionPart}`;
  } else {
    const dots = (text.match(/\./g) ?? []).length;
    if (dots > 1) {
      if (!GROUPED.test(text)) return null;
      normalized = text.replace(/\./g, "");
    } else if (dots === 1) {
      if (!/^\d*\.\d+$/.test(text)) return null;
      normalized = text.startsWith(".") ? `0${text}` : text;
    } else {
      if (!/^\d+$/.test(text)) return null;
      normalized = text;
    }
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}
