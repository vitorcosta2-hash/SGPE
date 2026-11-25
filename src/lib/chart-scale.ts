/** Escala "bonita" para eixos: 1, 2, 2,5, 5 × 10ⁿ. */
export function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = 10 ** exp;
  const fraction = value / base;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * base;
}

/** Número de intervalos que dá marcas redondas (0,2 / 0,5 / 1 do múltiplo) conforme o máximo "bonito". */
function stepsFor(max: number): number {
  const mantissa = max / 10 ** Math.floor(Math.log10(max));
  return mantissa === 2 ? 4 : 5;
}

/** Marcas do eixo Y de 0 até o máximo "bonito" (ex.: 0, 500, 1 mil, 1,5 mil, 2 mil, 2,5 mil). */
export function axisTicks(maxValue: number, steps?: number): number[] {
  const max = niceMax(maxValue);
  const n = steps ?? stepsFor(max);
  return Array.from({ length: n + 1 }, (_, i) => (max / n) * i);
}

/** Posição X de cada ponto numa série de `count` pontos (centrado quando há um só). */
export function xPositions(count: number, left: number, width: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [left + width / 2];
  return Array.from({ length: count }, (_, i) => left + (width * i) / (count - 1));
}

/** Índice do ponto mais próximo de `x` (já em coordenadas do gráfico). */
export function nearestIndex(xs: number[], x: number): number {
  let best = 0;
  let bestDist = Infinity;
  xs.forEach((px, i) => {
    const d = Math.abs(px - x);
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
  });
  return best;
}

/**
 * Número abreviado para eixos ("1,5 mil", "2 mi"). Implementado à mão porque o
 * Intl com notação compacta difere entre Node e navegador (erro de hidratação).
 */
export function compactNumber(value: number): string {
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  const fmt = (n: number) => {
    const rounded = Math.round(n * 10) / 10;
    return String(rounded).replace(".", ",");
  };
  if (abs >= 1_000_000) return `${sign}${fmt(abs / 1_000_000)} mi`;
  if (abs >= 1_000) return `${sign}${fmt(abs / 1_000)} mil`;
  return `${sign}${fmt(abs)}`;
}
