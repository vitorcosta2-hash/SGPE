/**
 * Texto de busca seguro para os filtros do PostgREST (.or / .ilike):
 * remove caracteres que têm significado na sintaxe de filtros ( , ( ) " \ * % _ ).
 */
export function sanitizeSearch(term: string | null | undefined, maxLength = 60): string {
  if (!term) return "";
  return term
    .replace(/[,()"\\*%_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export type SearchParams = Record<string, string | string[] | undefined>;

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export const PAGE_SIZE = 20;

export function parsePage(value: string | string[] | undefined): number {
  const n = Number.parseInt(firstParam(value) ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100000) : 1;
}

export function pageRange(page: number, pageSize = PAGE_SIZE): { from: number; to: number } {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}
