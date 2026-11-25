import { addDays, firstDayOfMonth, isIsoDate } from "./dates";

/**
 * Períodos usados no painel e nos relatórios. Todas as datas são "puras"
 * (YYYY-MM-DD) no fuso da empresa; a comparação é sempre com o período de
 * MESMA duração imediatamente anterior.
 */

export const PERIOD_PRESETS = [
  { key: "hoje", label: "Hoje" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "mes", label: "Este mês" },
  { key: "mes-anterior", label: "Mês anterior" },
] as const;

export type PeriodPreset = (typeof PERIOD_PRESETS)[number]["key"];

export interface DateRange {
  from: string;
  to: string;
}

export interface ResolvedPeriod extends DateRange {
  /** Predefinição usada, ou "personalizado" quando as datas vieram do usuário. */
  preset: PeriodPreset | "personalizado";
  label: string;
  /** Período anterior de mesma duração, usado na comparação. */
  previous: DateRange;
  /** Número de dias do período (inclusive). */
  days: number;
}

export const isPeriodPreset = (value: string | undefined): value is PeriodPreset =>
  PERIOD_PRESETS.some((p) => p.key === value);

/** Quantidade de dias entre duas datas, inclusive nas duas pontas. */
export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000) + 1;
}

/** Período imediatamente anterior, com a mesma quantidade de dias. */
export function previousRange(range: DateRange): DateRange {
  const days = daysBetween(range.from, range.to);
  return { from: addDays(range.from, -days), to: addDays(range.from, -1) };
}

function lastDayOfPreviousMonth(today: string): string {
  return addDays(firstDayOfMonth(today), -1);
}

/**
 * Resolve o período a partir dos parâmetros da URL.
 * Datas válidas (de/ate) têm prioridade; depois a predefinição; padrão: 30 dias.
 */
export function resolvePeriod(
  params: { periodo?: string; de?: string; ate?: string },
  today: string,
): ResolvedPeriod {
  if (isIsoDate(params.de) && isIsoDate(params.ate)) {
    let from = params.de;
    let to = params.ate;
    if (from > to) [from, to] = [to, from];
    // Janela máxima de 731 dias (mesmo limite do banco).
    if (daysBetween(from, to) > 731) from = addDays(to, -730);
    const range = { from, to };
    return { ...range, preset: "personalizado", label: "Período personalizado", previous: previousRange(range), days: daysBetween(from, to) };
  }

  const preset: PeriodPreset = isPeriodPreset(params.periodo) ? params.periodo : "30d";
  let range: DateRange;
  switch (preset) {
    case "hoje":
      range = { from: today, to: today };
      break;
    case "7d":
      range = { from: addDays(today, -6), to: today };
      break;
    case "mes":
      range = { from: firstDayOfMonth(today), to: today };
      break;
    case "mes-anterior": {
      const end = lastDayOfPreviousMonth(today);
      range = { from: firstDayOfMonth(end), to: end };
      break;
    }
    case "30d":
    default:
      range = { from: addDays(today, -29), to: today };
  }
  const label = PERIOD_PRESETS.find((p) => p.key === preset)?.label ?? "30 dias";
  return { ...range, preset, label, previous: previousRange(range), days: daysBetween(range.from, range.to) };
}

/**
 * Variação percentual de `current` em relação a `previous`.
 * Retorna null quando não há base de comparação (anterior igual a zero).
 */
export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}
