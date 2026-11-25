"use client";

import { useActionState } from "react";
import { initialActionState } from "@/lib/actions";
import { Field, Input } from "@/components/ui/fields";
import { FormMessage, fieldError, fieldValue } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { createCompany } from "../actions";

export function CreateCompanyForm() {
  const [state, formAction] = useActionState(createCompany, initialActionState);
  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <Field label="Nome da empresa" htmlFor="company_name" error={fieldError(state, "company_name")} required>
        <Input id="company_name" name="company_name" autoComplete="organization" defaultValue={fieldValue(state, "company_name")} invalid={Boolean(fieldError(state, "company_name"))} />
      </Field>
      <SubmitButton className="w-full" pendingText="Criando…">
        Criar empresa
      </SubmitButton>
    </form>
  );
}
