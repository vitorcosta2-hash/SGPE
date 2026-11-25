import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  className?: string;
  /** Coluna usada como título do cartão no celular. */
  primary?: boolean;
  /** Oculta a coluna na versão de celular. */
  hideOnMobile?: boolean;
  /** Mostra a coluna no celular sem o rótulo. */
  mobileNoLabel?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption?: string;
}

/**
 * Tabela em telas médias/grandes; no celular cada linha vira um cartão
 * (evita rolagem horizontal e mantém áreas de toque confortáveis).
 */
export function DataTable<T>({ columns, rows, rowKey, caption }: DataTableProps<T>) {
  const primary = columns.find((c) => c.primary) ?? columns[0];
  const secondary = columns.filter((c) => c !== primary && !c.hideOnMobile);

  return (
    <>
      <div className="hidden overflow-x-auto rounded-md border border-line md:block">
        <table className="w-full border-collapse text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr className="border-b border-line bg-surface text-left text-xs font-semibold uppercase tracking-wide text-muted">
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn("px-3 py-2.5 whitespace-nowrap", c.align === "right" && "text-right", c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr key={rowKey(row)} className="hover:bg-surface/60">
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-3 py-2.5 align-middle", c.align === "right" && "text-right tabular", c.className)}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden" aria-label={caption}>
        {rows.map((row) => (
          <li key={rowKey(row)} className="rounded-md border border-line bg-white p-3">
            <div className="text-sm font-medium text-ink">{primary.cell(row)}</div>
            <dl className="mt-2 space-y-1.5">
              {secondary.map((c) => (
                <div key={c.key} className="flex items-start justify-between gap-3 text-sm">
                  {c.mobileNoLabel ? null : <dt className="shrink-0 text-muted">{c.header}</dt>}
                  <dd className={cn("min-w-0 text-right text-ink tabular", c.mobileNoLabel && "w-full text-left")}>{c.cell(row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
