import { isIntegerUnit } from "@/lib/domain/stock";

export function formatCurrency(value: number | null | undefined, currency = "BRL"): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
}

/** Quantidade com a precisão da unidade (inteiros para "un", até 3 casas para kg etc.). */
export function formatQuantity(value: number | null | undefined, unit?: string): string {
  if (value == null || Number.isNaN(value)) return "—";
  const integer = unit ? isIntegerUnit(unit) : Number.isInteger(value);
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: integer ? 0 : 3,
  }).format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value)}%`;
}

/** Valor para preencher inputs de texto em formato brasileiro (12,5). */
export function toInputNumber(value: number | null | undefined, maxDecimals = 3): string {
  if (value == null || Number.isNaN(value)) return "";
  return new Intl.NumberFormat("pt-BR", { useGrouping: false, minimumFractionDigits: 0, maximumFractionDigits: maxDecimals }).format(value);
}

/** Valor monetário para inputs (sempre 2 casas: 10,50). */
export function toInputMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "";
  return new Intl.NumberFormat("pt-BR", { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}
