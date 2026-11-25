"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Search, Trash2 } from "lucide-react";
import { initialActionState, type ActionState } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/fields";
import { FormMessage, fieldError, fieldValue } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { fromCents, parseDecimal, toCents } from "@/lib/domain/money";
import { isIntegerUnit, PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/domain/stock";
import { formatCurrency, formatQuantity } from "@/lib/format";

interface FoundProduct {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  unit: string;
  stock_quantity: number;
  sale_price: number;
  effective_price: number;
  promotion_name: string | null;
}

interface Line {
  product: FoundProduct;
  quantity: string;
  discount: string;
}

interface SaleFormProps {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  idempotencyKey: string;
  customers: { id: string; name: string }[];
  currency: string;
}

/** Subtotal estimado de uma linha (centavos); o valor oficial é recalculado no servidor. */
function estimateLine(line: Line): { gross: number; discount: number; total: number; valid: boolean } {
  const qty = parseDecimal(line.quantity);
  const disc = line.discount.trim() === "" ? 0 : parseDecimal(line.discount);
  if (qty === null || qty <= 0 || disc === null || disc < 0) return { gross: 0, discount: 0, total: 0, valid: false };
  const gross = Math.round(qty * toCents(line.product.effective_price));
  const discount = toCents(disc);
  return { gross, discount, total: gross - discount, valid: gross - discount >= 0 };
}

export function SaleForm({ action, idempotencyKey, customers, currency }: SaleFormProps) {
  const [state, formAction] = useActionState(action, initialActionState);
  const [lines, setLines] = useState<Line[]>([]);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<FoundProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const requestId = useRef(0);

  // Busca com pequeno atraso (debounce) e descarte de respostas atrasadas.
  useEffect(() => {
    const text = term.trim();
    if (text.length < 1) return;
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/produtos/busca?q=${encodeURIComponent(text)}`, { cache: "no-store" });
        if (!response.ok) throw new Error("busca");
        const json = (await response.json()) as { products: FoundProduct[] };
        if (id === requestId.current) {
          setResults(json.products);
          setSearchError(null);
        }
      } catch {
        if (id === requestId.current) setSearchError("Não foi possível buscar os produtos. Tente novamente.");
      } finally {
        if (id === requestId.current) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [term]);

  const visibleResults = term.trim().length < 1 ? [] : results;

  function addProduct(product: FoundProduct) {
    setLines((current) => {
      const existing = current.find((l) => l.product.id === product.id);
      if (existing) {
        const qty = parseDecimal(existing.quantity) ?? 0;
        return current.map((l) => (l.product.id === product.id ? { ...l, quantity: String(qty + 1).replace(".", ",") } : l));
      }
      return [...current, { product, quantity: "1", discount: "" }];
    });
    setTerm("");
    setResults([]);
  }

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault(); // Enter no leitor de código de barras não envia a venda.
    const text = term.trim();
    const exact = results.find((p) => p.barcode === text || p.sku?.toLowerCase() === text.toLowerCase());
    const choice = exact ?? (results.length === 1 ? results[0] : undefined);
    if (choice) addProduct(choice);
  }

  function updateLine(productId: string, patch: Partial<Pick<Line, "quantity" | "discount">>) {
    setLines((current) => current.map((l) => (l.product.id === productId ? { ...l, ...patch } : l)));
  }

  function step(productId: string, delta: number) {
    setLines((current) =>
      current.map((l) => {
        if (l.product.id !== productId) return l;
        const next = Math.max(0, (parseDecimal(l.quantity) ?? 0) + delta);
        return { ...l, quantity: String(next).replace(".", ",") };
      }),
    );
  }

  const estimates = useMemo(() => lines.map(estimateLine), [lines]);
  const allValid = lines.length > 0 && estimates.every((e) => e.valid);
  const subtotal = estimates.reduce((sum, e) => sum + e.gross, 0);
  const discountTotal = estimates.reduce((sum, e) => sum + e.discount, 0);
  const total = subtotal - discountTotal;

  const itemsPayload = JSON.stringify(
    lines.map((l) => ({
      product_id: l.product.id,
      quantity: parseDecimal(l.quantity) ?? 0,
      discount: l.discount.trim() === "" ? 0 : (parseDecimal(l.discount) ?? 0),
    })),
  );

  return (
    <form action={formAction} className="grid gap-8 lg:grid-cols-[1.6fr_1fr]" noValidate>
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />
      <input type="hidden" name="items" value={itemsPayload} />

      <div className="space-y-5">
        <section aria-labelledby="add-title">
          <h2 id="add-title" className="mb-2 text-base font-semibold text-navy">
            Adicionar produtos
          </h2>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder="Buscar por nome, SKU ou ler o código de barras"
              aria-label="Buscar produto para adicionar"
              autoComplete="off"
              className="pl-9"
            />
          </div>
          {searching ? <p className="mt-2 text-sm text-muted">Buscando…</p> : null}
          {searchError ? <p role="alert" className="mt-2 text-sm text-red-700">{searchError}</p> : null}
          {term.trim() && !searching && !searchError && visibleResults.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nenhum produto ativo encontrado.</p>
          ) : null}
          {visibleResults.length > 0 ? (
            <ul className="mt-2 divide-y divide-line rounded-md border border-line bg-white">
              {visibleResults.map((p) => {
                const out = p.stock_quantity <= 0;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={out}
                      onClick={() => addProduct(p)}
                      className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{p.name}</span>
                        <span className="block text-xs text-muted">
                          {p.sku ? `SKU ${p.sku} · ` : ""}
                          {out ? "Sem estoque" : `Saldo ${formatQuantity(p.stock_quantity, p.unit)} ${p.unit}`}
                          {p.promotion_name ? ` · ${p.promotion_name}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm tabular">{formatCurrency(p.effective_price, currency)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>

        <section aria-labelledby="items-title">
          <h2 id="items-title" className="mb-2 text-base font-semibold text-navy">
            Itens da venda
          </h2>
          {fieldError(state, "items") ? <p role="alert" className="mb-2 text-sm text-red-700">{fieldError(state, "items")}</p> : null}
          {lines.length === 0 ? (
            <p className="rounded-md border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
              Nenhum item. Busque um produto acima para adicioná-lo.
            </p>
          ) : (
            <ul className="divide-y divide-line rounded-md border border-line">
              {lines.map((line, index) => {
                const est = estimates[index];
                const qty = parseDecimal(line.quantity);
                const overStock = qty !== null && qty > line.product.stock_quantity;
                const integer = isIntegerUnit(line.product.unit);
                return (
                  <li key={line.product.id} className="space-y-3 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{line.product.name}</p>
                        <p className="text-xs text-muted">
                          {formatCurrency(line.product.effective_price, currency)} / {line.product.unit}
                          {line.product.promotion_name ? ` · ${line.product.promotion_name}` : ""} · saldo{" "}
                          {formatQuantity(line.product.stock_quantity, line.product.unit)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setLines((c) => c.filter((l) => l.product.id !== line.product.id))}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-surface hover:text-red-700"
                        aria-label={`Remover ${line.product.name}`}
                      >
                        <Trash2 aria-hidden className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      <div>
                        <label htmlFor={`qty-${line.product.id}`} className="mb-1 block text-xs font-medium text-muted">
                          Quantidade ({line.product.unit})
                        </label>
                        <div className="flex items-center gap-1">
                          <Button variant="secondary" size="sm" onClick={() => step(line.product.id, integer ? -1 : -0.5)} aria-label="Diminuir quantidade">
                            <Minus aria-hidden className="h-4 w-4" />
                          </Button>
                          <Input
                            id={`qty-${line.product.id}`}
                            inputMode="decimal"
                            value={line.quantity}
                            onChange={(e) => updateLine(line.product.id, { quantity: e.target.value })}
                            className="w-24 text-center"
                            invalid={qty === null || qty <= 0 || overStock}
                          />
                          <Button variant="secondary" size="sm" onClick={() => step(line.product.id, integer ? 1 : 0.5)} aria-label="Aumentar quantidade">
                            <Plus aria-hidden className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div>
                        <label htmlFor={`disc-${line.product.id}`} className="mb-1 block text-xs font-medium text-muted">
                          Desconto (R$)
                        </label>
                        <Input
                          id={`disc-${line.product.id}`}
                          inputMode="decimal"
                          placeholder="0,00"
                          value={line.discount}
                          onChange={(e) => updateLine(line.product.id, { discount: e.target.value })}
                          className="w-28"
                          invalid={!est.valid && line.discount.trim() !== ""}
                        />
                      </div>
                      <p className="ml-auto text-sm font-semibold tabular">{est.valid ? formatCurrency(fromCents(est.total), currency) : "—"}</p>
                    </div>
                    {overStock ? <p role="alert" className="text-sm text-red-700">Quantidade maior que o saldo em estoque.</p> : null}
                    {!est.valid && qty !== null && qty > 0 && line.discount.trim() !== "" ? (
                      <p role="alert" className="text-sm text-red-700">O desconto não pode ser maior que o valor do item.</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <h2 className="text-base font-semibold text-navy">Fechamento</h2>
        <FormMessage state={state} />

        <Field label="Cliente" htmlFor="customer_id" error={fieldError(state, "customer_id")} hint="Opcional.">
          <Select id="customer_id" name="customer_id" defaultValue={fieldValue(state, "customer_id")}>
            <option value="">Sem cliente</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Forma de pagamento" htmlFor="payment_method" error={fieldError(state, "payment_method")} required>
          <Select id="payment_method" name="payment_method" defaultValue={fieldValue(state, "payment_method", "cash")}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Observações" htmlFor="notes" error={fieldError(state, "notes")} hint="Opcional.">
          <Textarea id="notes" name="notes" rows={2} maxLength={500} defaultValue={fieldValue(state, "notes")} />
        </Field>

        <dl className="space-y-1 rounded-md border border-line bg-surface p-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Subtotal</dt>
            <dd className="tabular">{formatCurrency(fromCents(subtotal), currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Descontos</dt>
            <dd className="tabular">− {formatCurrency(fromCents(discountTotal), currency)}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-2 text-base font-semibold text-navy">
            <dt>Total estimado</dt>
            <dd className="tabular">{formatCurrency(fromCents(Math.max(total, 0)), currency)}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted">Preços, promoções e totais são conferidos pelo sistema ao concluir a venda.</p>

        <SubmitButton pendingText="Registrando venda…" disabled={!allValid} className="w-full">
          Concluir venda
        </SubmitButton>
      </aside>
    </form>
  );
}
