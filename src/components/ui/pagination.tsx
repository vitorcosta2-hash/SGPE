import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonClasses } from "./button";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  params: Record<string, string | undefined>;
}

function hrefFor(basePath: string, params: Record<string, string | undefined>, page: number): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "pagina") search.set(key, value);
  }
  if (page > 1) search.set("pagina", String(page));
  const qs = search.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function Pagination({ page, pageSize, total, basePath, params }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav aria-label="Paginação" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
      <p>
        {first}–{last} de {total}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={hrefFor(basePath, params, page - 1)} className={buttonClasses("secondary", "sm")} rel="prev">
            <ChevronLeft aria-hidden className="h-4 w-4" /> Anterior
          </Link>
        ) : null}
        <span className="px-1 tabular">
          Página {Math.min(page, totalPages)} de {totalPages}
        </span>
        {page < totalPages ? (
          <Link href={hrefFor(basePath, params, page + 1)} className={buttonClasses("secondary", "sm")} rel="next">
            Próxima <ChevronRight aria-hidden className="h-4 w-4" />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
