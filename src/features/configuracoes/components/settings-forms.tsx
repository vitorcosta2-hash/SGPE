"use client";

import { useActionState } from "react";
import { initialActionState, type ActionState } from "@/lib/actions";
import { Field, Input, Select } from "@/components/ui/fields";
import { FormMessage, fieldError, fieldValue } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { BR_TIMEZONES } from "../schemas";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

export function CompanyForm({
  action,
  readOnly,
  company,
}: {
  action: Action;
  readOnly: boolean;
  company: { name: string; contact_email: string | null; contact_phone: string | null; timezone: string; default_min_stock: string; min_margin_percent: string };
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  const err = (n: string) => fieldError(state, n);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <fieldset disabled={readOnly} className="grid gap-4 md:grid-cols-2">
        <Field label="Nome da empresa" htmlFor="name" error={err("name")} required className="md:col-span-2">
          <Input id="name" name="name" maxLength={120} defaultValue={fieldValue(state, "name", company.name)} invalid={!!err("name")} />
        </Field>
        <Field label="E-mail de contato" htmlFor="contact_email" error={err("contact_email")}>
          <Input id="contact_email" name="contact_email" type="email" defaultValue={fieldValue(state, "contact_email", company.contact_email ?? "")} invalid={!!err("contact_email")} />
        </Field>
        <Field label="Telefone" htmlFor="contact_phone" error={err("contact_phone")}>
          <Input id="contact_phone" name="contact_phone" type="tel" defaultValue={fieldValue(state, "contact_phone", company.contact_phone ?? "")} />
        </Field>
        <Field label="Moeda" htmlFor="currency" hint="Real brasileiro (BRL).">
          <Input id="currency" value="BRL — Real" readOnly disabled />
        </Field>
        <Field label="Fuso horário" htmlFor="timezone" error={err("timezone")} hint="Define o dia das vendas, promoções e relatórios.">
          <Select id="timezone" name="timezone" defaultValue={fieldValue(state, "timezone", company.timezone)}>
            {BR_TIMEZONES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Estoque mínimo padrão" htmlFor="default_min_stock" error={err("default_min_stock")} hint="Sugerido ao cadastrar novos produtos.">
          <Input id="default_min_stock" name="default_min_stock" inputMode="decimal" defaultValue={fieldValue(state, "default_min_stock", company.default_min_stock)} invalid={!!err("default_min_stock")} />
        </Field>
        <Field label="Margem mínima desejada (%)" htmlFor="min_margin_percent" error={err("min_margin_percent")} hint="Usada nos alertas da precificação.">
          <Input id="min_margin_percent" name="min_margin_percent" inputMode="decimal" defaultValue={fieldValue(state, "min_margin_percent", company.min_margin_percent)} invalid={!!err("min_margin_percent")} />
        </Field>
      </fieldset>
      {readOnly ? (
        <p className="text-sm text-muted">Somente o proprietário da empresa pode alterar estes dados.</p>
      ) : (
        <SubmitButton pendingText="Salvando…">Salvar configurações</SubmitButton>
      )}
    </form>
  );
}

export function ProfileForm({ action, fullName, email }: { action: Action; fullName: string; email: string }) {
  const [state, formAction] = useActionState(action, initialActionState);
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Seu nome" htmlFor="full_name" error={fieldError(state, "full_name")} required>
          <Input id="full_name" name="full_name" maxLength={120} defaultValue={fieldValue(state, "full_name", fullName)} invalid={!!fieldError(state, "full_name")} />
        </Field>
        <Field label="E-mail de acesso" htmlFor="email">
          <Input id="email" value={email} readOnly disabled />
        </Field>
      </div>
      <SubmitButton pendingText="Salvando…">Salvar nome</SubmitButton>
    </form>
  );
}
