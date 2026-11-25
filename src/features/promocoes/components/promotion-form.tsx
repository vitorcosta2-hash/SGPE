"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { initialActionState, type ActionState } from "@/lib/actions";
import { buttonClasses } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/fields";
import { FormMessage, fieldError, fieldValue } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { parseDecimal } from "@/lib/domain/money";
import { discountPercent } from "@/lib/domain/promo-copy";
import { promoPrice } from "@/lib/domain/promotions";
import { DISCOUNT_TYPES, DISCOUNT_TYPE_LABELS, type DiscountType } from "@/lib/domain/stock";
import { formatCurrency, formatPercent } from "@/lib/format";

interface Props {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  products: { id: string; name: string; sku: string | null; sale_price: number; cost_price: number }[];
  currency: string;
  today: string;
  promotion?: {
    id: string;
    name: string;
    discount_type: string;
    discount_value: string;
    starts_on: string;
    ends_on: string;
    product_ids: string[];
  };
}

export function PromotionForm({ action, products, currency, today, promotion }: Props) {
  const [state, formAction] = useActionState(action, initialActionState);
  const [filter, setFilter] = useState("");
  const err = (n: string) => fieldError(state, n);
  const initialSelected = state.values?.product_ids ? state.values.product_ids.split(",") : (promotion?.product_ids ?? []);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelected));
  const [type, setType] = useState(fieldValue(state, "discount_type", promotion?.discount_type ?? "percentage"));
  const [value, setValue] = useState(fieldValue(state, "discount_value", promotion?.discount_value));

  const term = filter.trim().toLowerCase();
  const visible = products.filter((p) => !term || p.name.toLowerCase().includes(term) || p.sku?.toLowerCase().includes(term));

  const numericValue = parseDecimal(value);
  const preview =
    numericValue !== null && numericValue > 0
      ? products
          .filter((p) => selected.has(p.id))
          .map((p) => {
            const promo = promoPrice(type as DiscountType, numericValue, p.sale_price);
            const profit = Math.round((promo - p.cost_price) * 100) / 100;
            return {
              ...p,
              promo,
              profit,
              percent: discountPercent(p.sale_price, promo),
              margin: promo > 0 ? Math.round((profit / promo) * 10000) / 100 : null,
            };
          })
      : [];

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {promotion ? <input type="hidden" name="id" value={promotion.id} /> : null}
      <FormMessage state={state} />

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nome da promoção" htmlFor="name" error={err("name")} required className="md:col-span-2">
          <Input id="name" name="name" maxLength={80} defaultValue={fieldValue(state, "name", promotion?.name)} invalid={!!err("name")} />
        </Field>
        <Field label="Tipo de desconto" htmlFor="discount_type" error={err("discount_type")} required>
          <Select id="discount_type" name="discount_type" value={type} onChange={(e) => setType(e.target.value)}>
            {DISCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {DISCOUNT_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={type === "percentage" ? "Percentual (%)" : "Valor (R$)"}
          htmlFor="discount_value"
          error={err("discount_value")}
          required
        >
          <Input id="discount_value" name="discount_value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} invalid={!!err("discount_value")} />
        </Field>
        <Field label="Início" htmlFor="starts_on" error={err("starts_on")} required>
          <Input id="starts_on" name="starts_on" type="date" defaultValue={fieldValue(state, "starts_on", promotion?.starts_on ?? today)} invalid={!!err("starts_on")} />
        </Field>
        <Field label="Término (inclusive)" htmlFor="ends_on" error={err("ends_on")} required>
          <Input id="ends_on" name="ends_on" type="date" defaultValue={fieldValue(state, "ends_on", promotion?.ends_on)} invalid={!!err("ends_on")} />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">
          Produtos da promoção <span className="text-muted">({selected.size} selecionado{selected.size === 1 ? "" : "s"})</span>
        </legend>
        {err("product_ids") ? <p role="alert" className="mb-2 text-sm text-red-700">{err("product_ids")}</p> : null}
        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar produtos" aria-label="Filtrar produtos" className="mb-2 max-w-sm" />
        <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-md border border-line">
          {visible.length === 0 ? <li className="px-3 py-4 text-sm text-muted">Nenhum produto encontrado.</li> : null}
          {visible.map((p) => (
            <li key={p.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface">
                <input type="checkbox" className="h-4 w-4 accent-brand" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {p.name}
                  {p.sku ? <span className="text-muted"> · {p.sku}</span> : null}
                </span>
                <span className="text-sm tabular text-muted">{formatCurrency(p.sale_price, currency)}</span>
              </label>
            </li>
          ))}
        </ul>
        {/* Selecionados que o filtro oculta continuam sendo enviados. */}
        {[...selected].map((id) => (
          <input key={id} type="hidden" name="product_ids" value={id} />
        ))}
      </fieldset>

      {preview.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-medium text-ink">Prévia do desconto e do lucro estimado</h3>
          {preview.some((p) => p.profit < 0) ? (
            <p role="alert" className="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
              Atenção: {preview.filter((p) => p.profit < 0).length === 1 ? "um produto ficaria" : "alguns produtos ficariam"} com preço abaixo do custo. Cada venda geraria prejuízo.
            </p>
          ) : null}
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Prévia dos preços promocionais</caption>
              <thead>
                <tr className="border-b border-line bg-surface text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  <th scope="col" className="px-3 py-2">Produto</th>
                  <th scope="col" className="px-3 py-2 text-right">Promocional</th>
                  <th scope="col" className="px-3 py-2 text-right">Desconto</th>
                  <th scope="col" className="px-3 py-2 text-right">Lucro/un.</th>
                  <th scope="col" className="px-3 py-2 text-right">Margem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {preview.map((p) => (
                  <tr key={p.id}>
                    <td className="max-w-[12rem] truncate px-3 py-2">{p.name}</td>
                    <td className="px-3 py-2 text-right font-medium tabular">{formatCurrency(p.promo, currency)}</td>
                    <td className="px-3 py-2 text-right tabular">{p.percent === null ? "—" : `−${p.percent}%`}</td>
                    <td className={`px-3 py-2 text-right tabular ${p.profit < 0 ? "text-red-700" : "text-emerald-700"}`}>{formatCurrency(p.profit, currency)}</td>
                    <td className={`px-3 py-2 text-right tabular ${p.profit < 0 ? "text-red-700" : ""}`}>{p.margin === null ? "—" : formatPercent(p.margin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-xs text-muted">Lucro estimado por unidade = preço promocional − custo cadastrado. Não inclui taxas nem despesas fixas.</p>
        </div>
      ) : null}

      <p className="text-xs text-muted">O preço cadastrado dos produtos não é alterado: o desconto vale apenas durante o período, e a venda registra o preço aplicado.</p>

      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingText="Salvando…">{promotion ? "Salvar alterações" : "Criar promoção"}</SubmitButton>
        <Link href={promotion ? `/promocoes/${promotion.id}` : "/promocoes"} className={buttonClasses("secondary", "md")}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
