"use client";

import { useActionState } from "react";
import Link from "next/link";
import { initialActionState, type ActionState } from "@/lib/actions";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/fields";
import { FormMessage, fieldError, fieldValue } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { buttonClasses } from "@/components/ui/button";
import { UNITS } from "@/lib/domain/stock";

interface ProductFormProps {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  categories: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  defaultMinStock: number;
  /** Preenchido na edição. */
  product?: {
    id: string;
    name: string;
    category_id: string;
    supplier_id: string | null;
    sku: string | null;
    barcode: string | null;
    description: string | null;
    unit: string;
    cost_price: string;
    sale_price: string;
    min_stock: string;
    is_active: boolean;
    /** Unidade bloqueada após a primeira movimentação. */
    lockUnit: boolean;
  };
  /** Somente no cadastro. */
  idempotencyKey?: string;
  cancelHref: string;
  submitLabel: string;
}

export function ProductForm({ action, categories, suppliers, defaultMinStock, product, idempotencyKey, cancelHref, submitLabel }: ProductFormProps) {
  const [state, formAction] = useActionState(action, initialActionState);
  const err = (name: string) => fieldError(state, name);
  const val = (name: string, fallback = "") => fieldValue(state, name, fallback);
  const creating = !product;
  const activeDefault = state.values ? state.values.is_active === "on" : (product?.is_active ?? true);

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {product ? <input type="hidden" name="id" value={product.id} /> : null}
      {idempotencyKey ? <input type="hidden" name="idempotency_key" value={idempotencyKey} /> : null}
      <FormMessage state={state} />

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nome do produto" htmlFor="name" error={err("name")} required className="md:col-span-2">
          <Input id="name" name="name" maxLength={120} defaultValue={val("name", product?.name)} invalid={!!err("name")} />
        </Field>

        <Field label="Categoria" htmlFor="category_id" error={err("category_id")} required>
          <Select id="category_id" name="category_id" defaultValue={val("category_id", product?.category_id)} invalid={!!err("category_id")}>
            <option value="">Selecione…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Fornecedor" htmlFor="supplier_id" error={err("supplier_id")} hint="Opcional.">
          <Select id="supplier_id" name="supplier_id" defaultValue={val("supplier_id", product?.supplier_id ?? "")} invalid={!!err("supplier_id")}>
            <option value="">Sem fornecedor</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Unidade de medida"
          htmlFor="unit"
          error={err("unit")}
          hint={product?.lockUnit ? "Bloqueada: o produto já possui movimentações." : undefined}
          required
        >
          <Select
            id="unit"
            name="unit"
            defaultValue={val("unit", product?.unit ?? "un")}
            disabled={product?.lockUnit}
            invalid={!!err("unit")}
          >
            {UNITS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </Select>
          {product?.lockUnit ? <input type="hidden" name="unit" value={product.unit} /> : null}
        </Field>

        <Field label="Código (SKU)" htmlFor="sku" error={err("sku")} hint="Opcional. Não pode repetir dentro da empresa.">
          <Input id="sku" name="sku" maxLength={60} defaultValue={val("sku", product?.sku ?? "")} invalid={!!err("sku")} />
        </Field>

        <Field label="Código de barras" htmlFor="barcode" error={err("barcode")} hint="Opcional. Não pode repetir dentro da empresa.">
          <Input id="barcode" name="barcode" inputMode="numeric" maxLength={60} defaultValue={val("barcode", product?.barcode ?? "")} invalid={!!err("barcode")} />
        </Field>

        <Field label="Preço de custo (R$)" htmlFor="cost_price" error={err("cost_price")} required>
          <Input id="cost_price" name="cost_price" inputMode="decimal" placeholder="0,00" defaultValue={val("cost_price", product?.cost_price ?? "")} invalid={!!err("cost_price")} />
        </Field>

        <Field label="Preço de venda (R$)" htmlFor="sale_price" error={err("sale_price")} required>
          <Input id="sale_price" name="sale_price" inputMode="decimal" placeholder="0,00" defaultValue={val("sale_price", product?.sale_price ?? "")} invalid={!!err("sale_price")} />
        </Field>

        <Field label="Estoque mínimo" htmlFor="min_stock" error={err("min_stock")} hint="Abaixo ou igual a este saldo o produto aparece como estoque baixo." required>
          <Input id="min_stock" name="min_stock" inputMode="decimal" defaultValue={val("min_stock", product?.min_stock ?? String(defaultMinStock))} invalid={!!err("min_stock")} />
        </Field>

        {creating ? (
          <Field label="Estoque inicial" htmlFor="initial_stock" error={err("initial_stock")} hint="Gera a movimentação de estoque inicial. Pode ficar vazio.">
            <Input id="initial_stock" name="initial_stock" inputMode="decimal" placeholder="0" defaultValue={val("initial_stock")} invalid={!!err("initial_stock")} />
          </Field>
        ) : null}

        <Field label="Descrição" htmlFor="description" error={err("description")} className="md:col-span-2" hint="Opcional.">
          <Textarea id="description" name="description" maxLength={500} defaultValue={val("description", product?.description ?? "")} />
        </Field>

        <div className="md:col-span-2">
          <Checkbox name="is_active" label="Produto ativo (disponível para venda e movimentação)" defaultChecked={activeDefault} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingText="Salvando…">{submitLabel}</SubmitButton>
        <Link href={cancelHref} className={buttonClasses("secondary", "md")}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
