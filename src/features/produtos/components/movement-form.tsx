"use client";

import { useActionState } from "react";
import { initialActionState, type ActionState } from "@/lib/actions";
import { Field, Input, Select, Textarea } from "@/components/ui/fields";
import { FormMessage, fieldError, fieldValue } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatQuantity } from "@/lib/format";

interface MovementFormProps {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  idempotencyKey: string;
  /** Produto fixo (página do produto) ou lista para escolher. */
  product?: { id: string; name: string; unit: string; stock_quantity: number };
  products?: { id: string; name: string; sku: string | null; unit: string; stock_quantity: number }[];
  defaultProductId?: string;
}

const TYPE_OPTIONS = [
  { value: "entry", label: "Entrada (compra, reposição)" },
  { value: "manual_exit", label: "Saída manual (perda, uso interno)" },
  { value: "adjust_in", label: "Ajuste positivo" },
  { value: "adjust_out", label: "Ajuste negativo" },
  { value: "count", label: "Contagem de inventário (informar saldo contado)" },
];

export function MovementForm({ action, idempotencyKey, product, products, defaultProductId }: MovementFormProps) {
  const [state, formAction] = useActionState(action, initialActionState);
  const err = (n: string) => fieldError(state, n);

  return (
    // A chave reinicia o formulário depois de um registro bem-sucedido.
    <form key={state.nonce ?? "novo"} action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />
      <FormMessage state={state} />

      {product ? (
        <input type="hidden" name="product_id" value={product.id} />
      ) : (
        <Field label="Produto" htmlFor="product_id" error={err("product_id")} required>
          <Select id="product_id" name="product_id" defaultValue={fieldValue(state, "product_id", defaultProductId ?? "")} invalid={!!err("product_id")}>
            <option value="">Selecione…</option>
            {(products ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.sku ? ` (${p.sku})` : ""} — saldo {formatQuantity(p.stock_quantity, p.unit)} {p.unit}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo" htmlFor="type" error={err("type")} required>
          <Select id="type" name="type" defaultValue={fieldValue(state, "type", "entry")} invalid={!!err("type")}>
            {TYPE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={product ? `Quantidade (${product.unit})` : "Quantidade"}
          htmlFor="quantity"
          error={err("quantity")}
          hint="Na contagem de inventário, informe o saldo total contado."
          required
        >
          <Input id="quantity" name="quantity" inputMode="decimal" defaultValue={fieldValue(state, "quantity")} invalid={!!err("quantity")} />
        </Field>
      </div>

      <Field label="Motivo" htmlFor="reason" error={err("reason")} hint="Obrigatório para ajustes e contagens.">
        <Textarea id="reason" name="reason" rows={2} maxLength={300} defaultValue={fieldValue(state, "reason")} />
      </Field>

      <p className="text-xs text-muted">Movimentações não podem ser editadas nem excluídas; para corrigir, registre um ajuste. O saldo nunca fica negativo.</p>
      <SubmitButton pendingText="Registrando…">Registrar movimentação</SubmitButton>
    </form>
  );
}
