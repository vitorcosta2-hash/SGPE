import Link from "next/link";
import { CalendarRange } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/fields";
import { cn } from "@/lib/cn";
import { formatIsoDate } from "@/lib/domain/dates";
import { PERIOD_PRESETS, type ResolvedPeriod } from "@/lib/domain/periods";

interface Props {
  period: ResolvedPeriod;
  basePath: string;
  /** Parâmetros preservados nos links (ex.: tipo do relatório). */
  extra?: Record<string, string>;
}

/** Filtro de período: atalhos + datas livres. Funciona sem JavaScript (links e formulário GET). */
export function PeriodFilter({ period, basePath, extra = {} }: Props) {
  const href = (preset: string) => `${basePath}?${new URLSearchParams({ ...extra, periodo: preset }).toString()}`;
  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Período" className="flex flex-wrap gap-1.5">
          {PERIOD_PRESETS.map((p) => {
            const active = period.preset === p.key;
            return (
              <Link
                key={p.key}
                href={href(p.key)}
                aria-current={active ? "true" : undefined}
                className={buttonClasses(active ? "primary" : "secondary", "sm")}
              >
                {p.label}
              </Link>
            );
          })}
        </nav>

        <details className="group relative">
          <summary
            className={cn(
              buttonClasses(period.preset === "personalizado" ? "primary" : "secondary", "sm"),
              "cursor-pointer list-none [&::-webkit-details-marker]:hidden",
            )}
          >
            <CalendarRange aria-hidden className="h-4 w-4" /> Personalizar
          </summary>
          <form
            method="get"
            action={basePath}
            className="absolute left-0 z-20 mt-2 flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-3 rounded-md border border-line bg-white p-4 shadow-lg"
          >
            {Object.entries(extra).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            <div>
              <label htmlFor="pf-de" className="mb-1 block text-sm font-medium">De</label>
              <Input id="pf-de" type="date" name="de" defaultValue={period.from} required />
            </div>
            <div>
              <label htmlFor="pf-ate" className="mb-1 block text-sm font-medium">Até</label>
              <Input id="pf-ate" type="date" name="ate" defaultValue={period.to} required />
            </div>
            <button type="submit" className={buttonClasses("primary", "md")}>Aplicar período</button>
          </form>
        </details>
      </div>
      <p className="text-xs text-muted">
        {period.from === period.to ? formatIsoDate(period.from) : `${formatIsoDate(period.from)} a ${formatIsoDate(period.to)}`} · comparado com{" "}
        {period.previous.from === period.previous.to
          ? formatIsoDate(period.previous.from)
          : `${formatIsoDate(period.previous.from)} a ${formatIsoDate(period.previous.to)}`}
      </p>
    </div>
  );
}
