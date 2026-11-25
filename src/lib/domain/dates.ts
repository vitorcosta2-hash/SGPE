/** Utilidades de data. Datas "puras" são strings YYYY-MM-DD, sem deslocamento de fuso. */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string | null | undefined): value is string {
  if (!value || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Data de hoje (YYYY-MM-DD) no fuso informado. */
export function todayInTimezone(timezone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

export function firstDayOfMonth(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

/** Período a partir de parâmetros de busca; padrão: do dia 1º do mês até hoje. */
export function resolveDateRange(
  from: string | undefined,
  to: string | undefined,
  today: string,
): { from: string; to: string } {
  let start = isIsoDate(from) ? from : firstDayOfMonth(today);
  let end = isIsoDate(to) ? to : today;
  if (start > end) [start, end] = [end, start];
  return { from: start, to: end };
}

/** "2026-03-09" -> "09/03/2026" (sem converter fuso). */
export function formatIsoDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Instante (timestamptz) -> "09/03/2026 14:35" no fuso da empresa. */
export function formatDateTime(value: string | null | undefined, timezone: string): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: timezone,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
      .format(new Date(value))
      .replace(",", "");
  } catch {
    return value;
  }
}

/** Deslocamento (ms) do fuso em relação ao UTC em um instante. */
function tzOffsetMs(timezone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Instante UTC (ISO) em que o dia local `isoDate` começa no fuso informado. */
export function startOfLocalDayIso(isoDate: string, timezone: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  let result = guess - tzOffsetMs(timezone, new Date(guess));
  // Segunda passada: corrige a diferença quando o deslocamento muda no próprio dia (horário de verão).
  result = guess - tzOffsetMs(timezone, new Date(result));
  return new Date(result).toISOString();
}

/** Intervalo [início, fim) em UTC que cobre os dias locais de `from` a `to`, inclusive. */
export function localRangeIso(from: string, to: string, timezone: string): { start: string; endExclusive: string } {
  return { start: startOfLocalDayIso(from, timezone), endExclusive: startOfLocalDayIso(addDays(to, 1), timezone) };
}
