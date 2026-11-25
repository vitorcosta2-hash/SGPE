import { cn } from "@/lib/cn";

export interface BarItem {
  key: string;
  label: string;
  /** Texto à direita (valor formatado). */
  value: string;
  /** Texto secundário abaixo do nome. */
  hint?: string;
  /** Valor numérico usado só para o comprimento da barra. */
  amount: number;
}

/** Lista com barras horizontais proporcionais ao maior valor. Server component, sem JS no cliente. */
export function BarList({ items, className }: { items: BarItem[]; className?: string }) {
  const max = Math.max(0, ...items.map((i) => i.amount));
  return (
    <ul className={cn("space-y-3", className)}>
      {items.map((item) => {
        const width = max > 0 ? Math.max(2, (item.amount / max) * 100) : 0;
        return (
          <li key={item.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium text-ink" title={item.label}>
                {item.label}
              </span>
              <span className="shrink-0 tabular text-ink">{item.value}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface" aria-hidden>
              <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${width}%` }} />
            </div>
            {item.hint ? <p className="mt-0.5 text-xs text-muted">{item.hint}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
