"use client";

import { useActionState } from "react";
import Link from "next/link";
import { initialActionState, type ActionState } from "@/lib/actions";
import { Field, Input, Textarea } from "@/components/ui/fields";
import { FormMessage, fieldError, fieldValue } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { buttonClasses } from "@/components/ui/button";

interface SupplierFormProps {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  supplier?: { id: string; name: string; phone: string | null; email: string | null; notes: string | null };
  submitLabel: string;
  /** Mostra o botão Cancelar (tela de edição). */
  cancelHref?: string;
}

export function SupplierForm({ action, supplier, submitLabel, cancelHref }: SupplierFormProps) {
  const [state, formAction] = useActionState(action, initialActionState);
  const err = (name: string) => fieldError(state, name);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {supplier ? <input type="hidden" name="id" value={supplier.id} /> : null}
      <FormMessage state={state} />
      <Field label="Nome" htmlFor="name" error={err("name")} required>
        <Input id="name" name="name" maxLength={120} defaultValue={fieldValue(state, "name", supplier?.name ?? "")} invalid={!!err("name")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Telefone" htmlFor="phone" error={err("phone")} hint="Opcional.">
          <Input id="phone" name="phone" type="tel" maxLength={30} defaultValue={fieldValue(state, "phone", supplier?.phone ?? "")} />
        </Field>
        <Field label="E-mail" htmlFor="email" error={err("email")} hint="Opcional.">
          <Input id="email" name="email" type="email" maxLength={120} defaultValue={fieldValue(state, "email", supplier?.email ?? "")} invalid={!!err("email")} />
        </Field>
      </div>
      <Field label="Observações" htmlFor="notes" error={err("notes")} hint="Opcional.">
        <Textarea id="notes" name="notes" maxLength={500} defaultValue={fieldValue(state, "notes", supplier?.notes ?? "")} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingText="Salvando…">{submitLabel}</SubmitButton>
        {cancelHref ? (
          <Link href={cancelHref} className={buttonClasses("secondary", "md")}>
            Cancelar
          </Link>
        ) : null}
      </div>
    </form>
  );
}
