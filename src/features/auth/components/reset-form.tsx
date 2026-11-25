"use client";

import { useActionState } from "react";
import { initialActionState } from "@/lib/actions";
import { Field } from "@/components/ui/fields";
import { FormMessage, fieldError } from "@/components/ui/form-message";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { updatePassword } from "../actions";
import { PASSWORD_MIN_LENGTH } from "../schemas";

export function ResetPasswordForm() {
  const [state, formAction] = useActionState(updatePassword, initialActionState);
  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <Field label="Nova senha" htmlFor="password" error={fieldError(state, "password")} hint={`Mínimo de ${PASSWORD_MIN_LENGTH} caracteres.`} required>
        <PasswordInput id="password" name="password" autoComplete="new-password" invalid={Boolean(fieldError(state, "password"))} />
      </Field>
      <Field label="Confirmar nova senha" htmlFor="password_confirm" error={fieldError(state, "password_confirm")} required>
        <PasswordInput id="password_confirm" name="password_confirm" autoComplete="new-password" invalid={Boolean(fieldError(state, "password_confirm"))} />
      </Field>
      <SubmitButton className="w-full" pendingText="Salvando…">
        Redefinir senha
      </SubmitButton>
    </form>
  );
}
