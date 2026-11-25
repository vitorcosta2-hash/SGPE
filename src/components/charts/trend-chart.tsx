"use client";

import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { axisTicks, compactNumber, nearestIndex, niceMax, xPositions } from "@/lib/chart-scale";
import { formatCurrency } from "@/lib/format";
import type { DailyPoint } from "@/types/db";

interface Props {
  data: DailyPoint[];
  currency: string;
}

const W = 720;
const H = 260;
const PAD = { top: 16, right: 16, bottom: 28, left: 56 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

const shortDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const longDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Gráfico de faturamento (área) e lucro estimado (linha tracejada) por dia, com dica ao passar o mouse/tocar. */
export function TrendChart({ data, currency }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);

  const geometry = useMemo(() => {
    const maxValue = Math.max(0, ...data.map((d) => Math.max(d.revenue, d.profit)));
    const top = niceMax(maxValue);
    const minValue = Math.min(0, ...data.map((d) => d.profit));
    const bottom = minValue < 0 ? -niceMax(-minValue) : 0;
    const range = top - bottom;
    const xs = xPositions(data.length, PAD.left, PLOT_W);
    const y = (v: number) => PAD.top + PLOT_H - ((v - bottom) / range) * PLOT_H;
    const line = (pick: (d: DailyPoint) => number) => data.map((d, i) => `${i === 0 ? "M" : "L"}${xs[i].toFixed(1)},${y(pick(d)).toFixed(1)}`).join(" ");
    const revenueLine = line((d) => d.revenue);
    const area = data.length
      ? `${revenueLine} L${xs[xs.length - 1].toFixed(1)},${y(0).toFixed(1)} L${xs[0].toFixed(1)},${y(0).toFixed(1)} Z`
      : "";
    const ticks = axisTicks(top).map((t) => t + bottom);
    const labelEvery = Math.max(1, Math.ceil(data.length / 7));
    return { xs, y, revenueLine, profitLine: line((d) => d.profit), area, ticks, labelEvery, zeroY: y(0) };
  }, [data]);

  const total = data.reduce((acc, d) => ({ revenue: acc.revenue + d.revenue, profit: acc.profit + d.profit }), { revenue: 0, profit: 0 });
  const isEmpty = total.revenue === 0 && data.every((d) => d.count === 0);

  function move(event: PointerEvent<SVGSVGElement>) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || data.length === 0) return;
    setActive(nearestIndex(geometry.xs, ((event.clientX - rect.left) / rect.width) * W));
  }

  function keys(event: KeyboardEvent<SVGSVGElement>) {
    if (data.length === 0) return;
    if (event.key === "ArrowRight") setActive((i) => Math.min(data.length - 1, (i ?? -1) + 1));
    else if (event.key === "ArrowLeft") setActive((i) => Math.max(0, (i ?? data.length) - 1));
    else if (event.key === "Escape") setActive(null);
    else return;
    event.preventDefault();
  }

  const point = active !== null ? data[active] : null;
  const px = active !== null ? geometry.xs[active] : 0;
  const tooltipLeft = Math.min(Math.max((px / W) * 100, 14), 86);

  return (
    <figure className="m-0">
      <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-brand" /> Faturamento
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg aria-hidden width="18" height="6">
            <line x1="0" y1="3" x2="18" y2="3" stroke="#00a8e8" strokeWidth="2" strokeDasharray="4 3" />
          </svg>
          Lucro estimado
        </span>
      </div>

      <div className="relative">
        <svg
          ref={ref}
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full touch-pan-y select-none"
          role="img"
          tabIndex={0}
          aria-label={`Faturamento de ${formatCurrency(total.revenue, currency)} e lucro estimado de ${formatCurrency(total.profit, currency)} em ${data.length} dias. Use as setas para percorrer os dias.`}
          onPointerMove={move}
          onPointerDown={move}
          onPointerLeave={() => setActive(null)}
          onKeyDown={keys}
          onBlur={() => setActive(null)}
        >
          {geometry.ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={geometry.y(t)} y2={geometry.y(t)} stroke="#dde3ec" strokeWidth="1" />
              <text x={PAD.left - 8} y={geometry.y(t) + 4} textAnchor="end" fontSize="11" fill="#5b6678">
                {compactNumber(t)}
              </text>
            </g>
          ))}
          {geometry.zeroY < PAD.top + PLOT_H - 1 ? (
            <line x1={PAD.left} x2={W - PAD.right} y1={geometry.zeroY} y2={geometry.zeroY} stroke="#5b6678" strokeWidth="1" />
          ) : null}

          {data.map((d, i) =>
            i % geometry.labelEvery === 0 || i === data.length - 1 ? (
              <text key={d.day} x={geometry.xs[i]} y={H - 8} textAnchor="middle" fontSize="11" fill="#5b6678">
                {shortDay(d.day)}
              </text>
            ) : null,
          )}

          {geometry.area ? <path d={geometry.area} fill="#134074" fillOpacity="0.1" /> : null}
          {data.length ? <path d={geometry.revenueLine} fill="none" stroke="#134074" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" /> : null}
          {data.length ? (
            <path d={geometry.profitLine} fill="none" stroke="#00a8e8" strokeWidth="2.25" strokeDasharray="6 4" strokeLinejoin="round" strokeLinecap="round" />
          ) : null}

          {data.length <= 31
            ? data.map((d, i) => <circle key={d.day} cx={geometry.xs[i]} cy={geometry.y(d.revenue)} r={active === i ? 4.5 : 2.5} fill="#134074" />)
            : null}

          {point ? (
            <g>
              <line x1={px} x2={px} y1={PAD.top} y2={PAD.top + PLOT_H} stroke="#134074" strokeOpacity="0.35" strokeWidth="1" />
              <circle cx={px} cy={geometry.y(point.revenue)} r="5" fill="#fff" stroke="#134074" strokeWidth="2.5" />
              <circle cx={px} cy={geometry.y(point.profit)} r="5" fill="#fff" stroke="#00a8e8" strokeWidth="2.5" />
            </g>
          ) : null}
        </svg>

        {point ? (
          <div
            role="status"
            className="pointer-events-none absolute top-1 z-10 w-44 -translate-x-1/2 rounded-md border border-line bg-white px-3 py-2 text-xs shadow-md"
            style={{ left: `${tooltipLeft}%` }}
          >
            <p className="font-semibold text-navy">{longDay(point.day)}</p>
            <p className="mt-1 flex justify-between gap-2">
              <span className="text-muted">Faturamento</span>
              <span className="tabular font-medium">{formatCurrency(point.revenue, currency)}</span>
            </p>
            <p className="flex justify-between gap-2">
              <span className="text-muted">Lucro est.</span>
              <span className="tabular font-medium">{formatCurrency(point.profit, currency)}</span>
            </p>
            <p className="flex justify-between gap-2">
              <span className="text-muted">Vendas</span>
              <span className="tabular font-medium">{point.count}</span>
            </p>
          </div>
        ) : null}

        {isEmpty ? (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center pb-6 text-sm text-muted">Nenhuma venda neste período.</p>
        ) : null}
      </div>
    </figure>
  );
}
