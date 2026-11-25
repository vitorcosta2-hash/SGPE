"use client";

import { useActionState } from "react";
import { initialActionState } from "@/lib/actions";
import { Field, Input } from "@/components/ui/fields";
import { FormMessage, fieldError, fieldValue } from "@/components/ui/form-message";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { signUp } from "../actions";
import { PASSWORD_MIN_LENGTH } from "../schemas";

export function SignUpForm() {
  const [state, formAction] = useActionState(signUp, initialActionState);
  const done = state.status === "success";

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormMessage state={state} />
      {done ? null : (
        <>
          <Field label="Seu nome" htmlFor="full_name" error={fieldError(state, "full_name")} required>
            <Input id="full_name" name="full_name" autoComplete="name" defaultValue={fieldValue(state, "full_name")} invalid={Boolean(fieldError(state, "full_name"))} />
          </Field>
          <Field label="Nome da empresa" htmlFor="company_name" error={fieldError(state, "company_name")} required>
            <Input id="company_name" name="company_name" autoComplete="organization" defaultValue={fieldValue(state, "company_name")} invalid={Boolean(fieldError(state, "company_name"))} />
          </Field>
          <Field label="E-mail" htmlFor="email" error={fieldError(state, "email")} required>
            <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" defaultValue={fieldValue(state, "email")} invalid={Boolean(fieldError(state, "email"))} />
          </Field>
          <Field label="Senha" htmlFor="password" error={fieldError(state, "password")} hint={`Mínimo de ${PASSWORD_MIN_LENGTH} caracteres.`} required>
            <PasswordInput id="password" name="password" autoComplete="new-password" invalid={Boolean(fieldError(state, "password"))} />
          </Field>
          <Field label="Confirmar senha" htmlFor="password_confirm" error={fieldError(state, "password_confirm")} required>
            <PasswordInput id="password_confirm" name="password_confirm" autoComplete="new-password" invalid={Boolean(fieldError(state, "password_confirm"))} />
          </Field>
          <SubmitButton className="w-full" pendingText="Criando conta…">
            Criar conta
          </SubmitButton>
        </>
      )}
    </form>
  );
}
