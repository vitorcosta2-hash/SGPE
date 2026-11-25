"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/fields";
import { InlineConfirm } from "@/components/ui/inline-confirm";
import { Panel } from "@/components/ui/page";
import { cn } from "@/lib/cn";
import { calculatePricing, profitForUnits, type PriceAnalysis } from "@/lib/domain/pricing";
import { parseDecimal } from "@/lib/domain/money";
import { formatCurrency, formatPercent, toInputMoney } from "@/lib/format";
import type { ActionState } from "@/lib/actions";

interface PricingProduct {
  id: string;
  name: string;
  cost_price: number;
  sale_price: number;
}

interface Props {
  products: PricingProduct[];
  currency: string;
  minMarginPercent: number;
  initialProductId?: string;
  applyAction: (state: ActionState, formData: FormData) => Promise<ActionState>;
}

/** Explicação curta e opcional ao lado de um campo, sem ocupar espaço até ser aberta. */
function Help({ children }: { children: ReactNode }) {
  return (
    <details className="mt-1 text-xs text-muted">
      <summary className="cursor-pointer select-none text-brand hover:underline">O que é isso?</summary>
      <p className="mt-1 leading-relaxed">{children}</p>
    </details>
  );
}

const SEGMENTS = [
  { key: "acquisitionCost", label: "Custo do produto", color: "bg-navy" },
  { key: "extraCost", label: "Despesas por unidade", color: "bg-slate-400" },
  { key: "variableCharges", label: "Taxas e impostos", color: "bg-amber-400" },
  { key: "profit", label: "Lucro", color: "bg-emerald-500" },
] as const;

/** Mostra como o preço de venda se divide entre custo, despesas, taxas e lucro. */
function PriceComposition({ a, currency }: { a: PriceAnalysis; currency: string }) {
  const values = {
    acquisitionCost: a.acquisitionCost,
    extraCost: a.extraCost,
    variableCharges: a.variableCharges,
    profit: Math.max(0, a.grossProfit),
  };
  const total = Object.values(values).reduce((x, y) => x + y, 0);
  const loss = a.grossProfit < 0;
  return (
    <div>
      <div
        role="img"
        aria-label={`Composição do preço de ${formatCurrency(a.price, currency)}: ${SEGMENTS.map((s) => `${s.label} ${formatCurrency(values[s.key], currency)}`).join(", ")}`}
        className="flex h-4 overflow-hidden rounded-full bg-surface"
      >
        {total > 0
          ? SEGMENTS.map((s) =>
              values[s.key] > 0 ? (
                <div key={s.key} className={cn("h-full transition-[width] duration-500", s.color)} style={{ width: `${(values[s.key] / total) * 100}%` }} />
              ) : null,
            )
          : null}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {SEGMENTS.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 text-muted">
              <span aria-hidden className={cn("h-2.5 w-2.5 rounded-sm", s.color)} />
              {s.label}
            </span>
            <span className="tabular font-medium">{formatCurrency(s.key === "profit" ? a.grossProfit : values[s.key], currency)}</span>
          </li>
        ))}
      </ul>
      {loss ? <p className="mt-2 text-xs text-red-700">Neste preço o lucro é negativo (prejuízo por unidade).</p> : null}
    </div>
  );
}

function signed(value: number, format: (n: number) => string): string {
  if (value === 0) return format(0);
  return `${value > 0 ? "+" : "−"}${format(Math.abs(value))}`;
}

interface CompareRow {
  label: string;
  hint?: string;
  current: string | null;
  suggested: string;
  diff: { text: string; good: boolean | null } | null;
}

export function PricingCalculator({ products, currency, minMarginPercent, initialProductId, applyAction }: Props) {
  const initial = products.find((p) => p.id === initialProductId);
  const [productId, setProductId] = useState(initial?.id ?? "");
  const [cost, setCost] = useState(initial ? toInputMoney(initial.cost_price) : "");
  const [extra, setExtra] = useState("");
  const [variable, setVariable] = useState("");
  const [margin, setMargin] = useState("30");
  const [current, setCurrent] = useState(initial ? toInputMoney(initial.sale_price) : "");
  const [units, setUnits] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "amount">("percent");
  const [discountValue, setDiscountValue] = useState("");

  function selectProduct(id: string) {
    setProductId(id);
    const product = products.find((p) => p.id === id);
    if (product) {
      setCost(toInputMoney(product.cost_price));
      setCurrent(toInputMoney(product.sale_price));
    }
  }

  const money = (n: number) => formatCurrency(n, currency);

  const parsed = useMemo(() => {
    const costValue = parseDecimal(cost);
    const extraValue = extra.trim() === "" ? 0 : parseDecimal(extra);
    const variableValue = variable.trim() === "" ? 0 : parseDecimal(variable);
    const marginValue = parseDecimal(margin);
    const currentValue = current.trim() === "" ? null : parseDecimal(current);
    const unitsValue = units.trim() === "" ? null : parseDecimal(units);
    const discountNumber = discountValue.trim() === "" ? null : parseDecimal(discountValue);

    const errors: string[] = [];
    if (costValue === null || costValue < 0) errors.push("Informe o custo do produto (ex.: 10,50).");
    if (extraValue === null || extraValue < 0) errors.push("As despesas por unidade devem ser um valor em reais, de zero para cima.");
    if (variableValue === null || variableValue < 0 || variableValue >= 100) errors.push("As taxas e impostos devem estar entre 0 e 99,99%.");
    if (marginValue === null || marginValue < 0 || marginValue >= 100) errors.push("A margem desejada deve estar entre 0 e 99,99%.");
    if (
      marginValue !== null && variableValue !== null && marginValue >= 0 && variableValue >= 0 && marginValue < 100 && variableValue < 100 &&
      marginValue + variableValue >= 100
    ) {
      errors.push("A margem somada às taxas e impostos precisa ser menor que 100%: não sobra preço para pagar o custo.");
    }
    if (current.trim() !== "" && (currentValue === null || currentValue < 0)) errors.push("Preço atual inválido.");
    if (units.trim() !== "" && (unitsValue === null || unitsValue < 0 || !Number.isFinite(unitsValue) || unitsValue > 10_000_000)) {
      errors.push("A quantidade vendida por mês deve ser um número válido.");
    }
    if (discountValue.trim() !== "" && (discountNumber === null || discountNumber < 0)) errors.push("Desconto inválido.");
    if (discountType === "percent" && discountNumber !== null && discountNumber > 100) errors.push("O desconto percentual não pode passar de 100%.");
    if (errors.length > 0 || costValue === null || marginValue === null || extraValue === null || variableValue === null) {
      return { errors, result: null, unitsValue: null as number | null };
    }

    return {
      errors,
      unitsValue,
      result: calculatePricing({
        cost: costValue,
        extraCost: extraValue,
        variablePercent: variableValue,
        desiredMarginPercent: marginValue,
        currentPrice: currentValue,
        discount: discountNumber ? { type: discountType, value: discountNumber } : null,
        minMarginPercent,
      }),
    };
  }, [cost, extra, variable, margin, current, units, discountType, discountValue, minMarginPercent]);

  const result = parsed.result;
  const selected = products.find((p) => p.id === productId);

  const rows: CompareRow[] = (() => {
    if (!result) return [];
    const s = result.suggested;
    const c = result.current;
    const pct = (n: number | null) => (n === null ? "—" : formatPercent(n));
    const out: CompareRow[] = [
      {
        label: "Preço de venda",
        current: c ? money(c.price) : null,
        suggested: money(s.price),
        diff: c ? { text: signed(s.price - c.price, money), good: null } : null,
      },
      {
        label: "Custo + despesas",
        hint: "Custo do produto mais despesas por unidade",
        current: c ? money(c.acquisitionCost + c.extraCost) : null,
        suggested: money(s.acquisitionCost + s.extraCost),
        diff: null,
      },
      {
        label: "Taxas e impostos",
        hint: "Percentual que incide sobre o preço",
        current: c ? money(c.variableCharges) : null,
        suggested: money(s.variableCharges),
        diff: null,
      },
      {
        label: "Lucro por unidade",
        current: c ? money(c.grossProfit) : null,
        suggested: money(s.grossProfit),
        diff: c ? { text: signed(s.grossProfit - c.grossProfit, money), good: s.grossProfit - c.grossProfit >= 0 } : null,
      },
      {
        label: "Margem de lucro",
        hint: "Lucro ÷ preço de venda",
        current: c ? pct(c.marginPercent) : null,
        suggested: pct(s.marginPercent),
        diff:
          c && c.marginPercent !== null && s.marginPercent !== null
            ? { text: signed(Math.round((s.marginPercent - c.marginPercent) * 100) / 100, (n) => `${formatPercent(n)} p.p.`), good: s.marginPercent >= c.marginPercent }
            : null,
      },
      {
        label: "Acréscimo sobre o custo (markup)",
        hint: "Lucro ÷ custo total",
        current: c ? pct(c.markupPercent) : null,
        suggested: pct(s.markupPercent),
        diff: null,
      },
    ];
    if (parsed.unitsValue) {
      const u = parsed.unitsValue;
      const sm = profitForUnits(s.grossProfit, u);
      const cm = c ? profitForUnits(c.grossProfit, u) : null;
      out.push({
        label: `Lucro em ${new Intl.NumberFormat("pt-BR").format(u)} un./mês`,
        hint: "Estimativa se o volume de vendas for o mesmo",
        current: cm === null ? null : money(cm),
        suggested: money(sm),
        diff: cm === null ? null : { text: signed(sm - cm, money), good: sm - cm >= 0 },
      });
    }
    return out;
  })();

  const gapPerUnit = result?.current ? result.suggested.grossProfit - result.current.grossProfit : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.25fr]">
      <Panel className="space-y-6 self-start">
        <Field label="Produto cadastrado" htmlFor="product" hint="Opcional: preenche custo e preço atual e permite aplicar o novo preço.">
          <Select id="product" value={productId} onChange={(e) => selectProduct(e.target.value)}>
            <option value="">Cálculo avulso</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>

        <fieldset className="space-y-4">
          <legend className="mb-1 text-sm font-semibold text-navy">1. Quanto custa</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Custo de aquisição (R$)" htmlFor="cost" required hint="O que você paga por cada unidade.">
              <Input id="cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0,00" />
            </Field>
            <Field label="Despesas por unidade (R$)" htmlFor="extra" hint="Frete, embalagem, etiqueta…">
              <Input id="extra" inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="0,00" />
            </Field>
          </div>
          <Field label="Taxas e impostos sobre a venda (%)" htmlFor="variable" hint="Percentual que sai de cada venda: imposto, taxa do cartão, comissão.">
            <Input id="variable" inputMode="decimal" value={variable} onChange={(e) => setVariable(e.target.value)} placeholder="0" />
          </Field>
        </fieldset>

        <div className="border-t border-line pt-5">
        <fieldset className="space-y-4">
          <legend className="mb-1 text-sm font-semibold text-navy">2. Quanto você quer ganhar</legend>
          <Field label="Margem de lucro desejada (%)" htmlFor="margin" required hint="Parte do preço de venda que fica como lucro.">
            <Input id="margin" inputMode="decimal" value={margin} onChange={(e) => setMargin(e.target.value)} />
          </Field>
          <Help>
            Margem é o lucro dividido pelo preço de venda. Se você vende por R$ 100 e sobram R$ 30, a margem é 30%. Já o markup é o lucro dividido pelo custo:
            nesse exemplo o custo é R$ 70 e o markup é 42,86%. Para ter 50% de margem é preciso vender pelo dobro do custo.
          </Help>
        </fieldset>
        </div>

        <div className="border-t border-line pt-5">
        <fieldset className="space-y-4">
          <legend className="mb-1 text-sm font-semibold text-navy">3. Comparar e simular (opcional)</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Preço de venda atual (R$)" htmlFor="current" hint="Para comparar com o sugerido.">
              <Input id="current" inputMode="decimal" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="0,00" />
            </Field>
            <Field label="Vendas por mês (unidades)" htmlFor="units" hint="Mostra o lucro mensal estimado.">
              <Input id="units" inputMode="decimal" value={units} onChange={(e) => setUnits(e.target.value)} placeholder="0" />
            </Field>
            <Field label="Simular desconto" htmlFor="discount_type">
              <Select id="discount_type" value={discountType} onChange={(e) => setDiscountType(e.target.value as "percent" | "amount")}>
                <option value="percent">Percentual (%)</option>
                <option value="amount">Valor (R$)</option>
              </Select>
            </Field>
            <Field label={discountType === "percent" ? "Desconto (%)" : "Desconto (R$)"} htmlFor="discount_value">
              <Input id="discount_value" inputMode="decimal" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} placeholder="0" />
            </Field>
          </div>
        </fieldset>
        </div>
      </Panel>

      <div className="space-y-5">
        {parsed.errors.length > 0 ? (
          <Alert variant="warning" title="Revise os valores">
            <ul className="list-inside list-disc">
              {parsed.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Alert>
        ) : null}

        {!result && parsed.errors.length === 0 ? (
          <Panel>
            <p className="text-sm text-muted">Informe o custo do produto e a margem desejada para ver o preço sugerido.</p>
          </Panel>
        ) : null}

        {result ? (
          <>
            <Panel>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Preço sugerido</p>
              <p className="mt-1 text-4xl font-semibold tabular text-navy">{money(result.suggested.price)}</p>
              <p className="mt-1 text-sm text-muted">
                Lucro de <strong className="font-semibold text-ink tabular">{money(result.suggested.grossProfit)}</strong> por unidade ·{" "}
                margem de <strong className="font-semibold text-ink tabular">{result.suggested.marginPercent === null ? "—" : formatPercent(result.suggested.marginPercent)}</strong>
              </p>

              <div className="mt-5">
                <PriceComposition a={result.suggested} currency={currency} />
              </div>

              <p className="mt-4 rounded-md bg-surface px-3 py-2 text-sm text-muted">
                Preço mínimo sem prejuízo: <strong className="tabular text-ink">{money(result.breakEvenPrice)}</strong>. Abaixo disso, cada venda perde dinheiro.
              </p>

              {selected ? (
                <div className="mt-4 border-t border-line pt-4">
                  <InlineConfirm
                    triggerLabel="Aplicar este preço ao produto"
                    triggerVariant="secondary"
                    title={`Alterar o preço de venda de "${selected.name}"?`}
                    description={
                      <>
                        O preço passará de {money(selected.sale_price)} para {money(result.suggested.price)}. Vendas já realizadas não são alteradas.
                      </>
                    }
                    confirmLabel="Confirmar novo preço"
                    pendingLabel="Aplicando…"
                    action={applyAction}
                    hidden={{ product_id: selected.id, price: toInputMoney(result.suggested.price) }}
                  />
                </div>
              ) : null}
            </Panel>

            <Panel>
              <h2 className="mb-1 text-base font-semibold text-navy">{result.current ? "Preço atual × preço sugerido" : "Detalhes do preço sugerido"}</h2>
              {gapPerUnit !== null && result.current ? (
                <p className="mb-3 text-sm text-muted">
                  {gapPerUnit > 0
                    ? `Com o preço atual você deixa de ganhar ${money(gapPerUnit)} por unidade em relação à margem que escolheu.`
                    : gapPerUnit < 0
                      ? `O preço atual rende ${money(Math.abs(gapPerUnit))} a mais por unidade do que a margem que você escolheu.`
                      : "O preço atual rende o mesmo que o sugerido."}
                </p>
              ) : null}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <caption className="sr-only">Comparação entre preço atual e sugerido</caption>
                  <thead>
                    <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-muted">
                      <th scope="col" className="py-2 pr-3" />
                      {result.current ? <th scope="col" className="px-3 py-2 text-right">Atual</th> : null}
                      <th scope="col" className="px-3 py-2 text-right">Sugerido</th>
                      {result.current ? <th scope="col" className="py-2 pl-3 text-right">Variação</th> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rows.map((r) => (
                      <tr key={r.label}>
                        <th scope="row" className="py-2 pr-3 text-left font-normal">
                          {r.label}
                          {r.hint ? <span className="block text-xs text-muted">{r.hint}</span> : null}
                        </th>
                        {result.current ? <td className="px-3 py-2 text-right tabular">{r.current ?? "—"}</td> : null}
                        <td className="px-3 py-2 text-right font-medium tabular">{r.suggested}</td>
                        {result.current ? (
                          <td
                            className={cn(
                              "py-2 pl-3 text-right tabular",
                              r.diff?.good === true && "text-emerald-700",
                              r.diff?.good === false && "text-red-700",
                            )}
                          >
                            {r.diff?.text ?? ""}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.current && result.current.marginPercent !== null && result.current.marginPercent < minMarginPercent ? (
                <Alert variant="warning" className="mt-3">
                  A margem atual está abaixo do mínimo configurado ({formatPercent(minMarginPercent)}).
                </Alert>
              ) : null}
            </Panel>

            {result.discountOnSuggested || result.discountOnCurrent ? (
              <Panel>
                <h2 className="mb-2 text-base font-semibold text-navy">Efeito do desconto</h2>
                {[
                  { title: "Sobre o preço sugerido", d: result.discountOnSuggested },
                  { title: "Sobre o preço atual", d: result.discountOnCurrent },
                ].map(({ title, d }) =>
                  d ? (
                    <div key={title} className="mb-4 last:mb-0">
                      <h3 className="text-sm font-medium">{title}</h3>
                      <dl className="divide-y divide-line">
                        <div className="flex justify-between gap-4 py-1.5 text-sm">
                          <dt className="text-muted">Preço com desconto</dt>
                          <dd className="font-medium tabular">{money(d.price)}</dd>
                        </div>
                        <div className="flex justify-between gap-4 py-1.5 text-sm">
                          <dt className="text-muted">Lucro por unidade</dt>
                          <dd className="font-medium tabular">{money(d.grossProfit)}</dd>
                        </div>
                        <div className="flex justify-between gap-4 py-1.5 text-sm">
                          <dt className="text-muted">Margem</dt>
                          <dd className="font-medium tabular">{d.marginPercent === null ? "—" : formatPercent(d.marginPercent)}</dd>
                        </div>
                      </dl>
                      {d.belowCost ? (
                        <Alert variant="error" className="mt-2" title="Prejuízo">
                          Com este desconto o preço não cobre o custo, as despesas e as taxas.
                        </Alert>
                      ) : d.belowMinMargin ? (
                        <Alert variant="warning" className="mt-2" title="Margem abaixo do mínimo">
                          A margem fica abaixo do mínimo configurado ({formatPercent(minMarginPercent)}).
                        </Alert>
                      ) : null}
                    </div>
                  ) : null,
                )}
              </Panel>
            ) : null}

            <details className="rounded-md border border-line bg-white px-4 py-3 text-sm">
              <summary className="cursor-pointer select-none font-medium text-navy">Como o cálculo é feito</summary>
              <div className="mt-2 space-y-2 text-muted">
                <p>
                  <strong className="text-ink">Preço sugerido</strong> = (custo + despesas por unidade) ÷ (1 − taxas − margem). As taxas e a margem entram em
                  porcentagem do preço de venda.
                </p>
                <p>
                  <strong className="text-ink">Lucro por unidade</strong> = preço − custo − despesas − taxas sobre o preço.
                </p>
                <p>
                  <strong className="text-ink">Margem</strong> = lucro ÷ preço de venda. <strong className="text-ink">Markup</strong> = lucro ÷ custo total.
                </p>
                <p>Os valores são estimativas por unidade e não incluem despesas fixas do negócio, como aluguel e salários.</p>
              </div>
            </details>
          </>
        ) : null}
      </div>
    </div>
  );
}
