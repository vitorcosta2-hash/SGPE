import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";

interface KpiProps {
  label: string;
  value: string;
  hint?: ReactNode;
  tone?: "warn" | "danger";
  /** Variação em % contra o período anterior; null = sem base de comparação; omitido = sem comparação. */
  delta?: number | null;
  /** Quando true, queda é boa (ex.: cancelamentos). */
  invertDelta?: boolean;
}

export function Delta({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null) return <span className="text-xs text-muted">sem base de comparação</span>;
  if (value === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-muted">
        <Minus aria-hidden className="h-3 w-3" /> 0% igual ao anterior
      </span>
    );
  }
  const up = value > 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", good ? "text-emerald-700" : "text-red-700")}>
      <Icon aria-hidden className="h-3.5 w-3.5" />
      {up ? "+" : "−"}
      {formatPercent(Math.abs(value))}
      <span className="sr-only">{up ? " de aumento" : " de queda"} em relação ao período anterior</span>
    </span>
  );
}

export function Kpi({ label, value, hint, tone, delta, invertDelta }: KpiProps) {
  return (
    <div className="rounded-md border border-line bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular text-navy", tone === "warn" && "text-amber-700", tone === "danger" && "text-red-700")}>
        {value}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {delta !== undefined ? <Delta value={delta} invert={invertDelta} /> : null}
        {hint ? <span className="text-xs text-muted">{hint}</span> : null}
      </div>
    </div>
  );
}
