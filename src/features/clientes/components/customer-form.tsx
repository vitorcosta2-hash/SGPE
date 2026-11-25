"use client";

import { useActionState } from "react";
import Link from "next/link";
import { initialActionState, type ActionState } from "@/lib/actions";
import { buttonClasses } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/fields";
import { FormMessage, fieldError, fieldValue } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";

interface CustomerFormProps {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  customer?: { id: string; name: string; phone: string | null; email: string | null; notes: string | null };
  submitLabel: string;
}

export function CustomerForm({ action, customer, submitLabel }: CustomerFormProps) {
  const [state, formAction] = useActionState(action, initialActionState);
  const err = (n: string) => fieldError(state, n);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {customer ? <input type="hidden" name="id" value={customer.id} /> : null}
      <FormMessage state={state} />
      <Field label="Nome" htmlFor="name" error={err("name")} required>
        <Input id="name" name="name" maxLength={120} defaultValue={fieldValue(state, "name", customer?.name)} invalid={!!err("name")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Telefone" htmlFor="phone" error={err("phone")}>
          <Input id="phone" name="phone" type="tel" maxLength={30} defaultValue={fieldValue(state, "phone", customer?.phone ?? "")} />
        </Field>
        <Field label="E-mail" htmlFor="email" error={err("email")}>
          <Input id="email" name="email" type="email" maxLength={120} defaultValue={fieldValue(state, "email", customer?.email ?? "")} invalid={!!err("email")} />
        </Field>
      </div>
      <Field label="Observações" htmlFor="notes" error={err("notes")} hint="Opcional.">
        <Textarea id="notes" name="notes" maxLength={500} defaultValue={fieldValue(state, "notes", customer?.notes ?? "")} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingText="Salvando…">{submitLabel}</SubmitButton>
        <Link href="/clientes" className={buttonClasses("secondary", "md")}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
