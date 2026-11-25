"use client";

import { useActionState } from "react";
import { initialActionState } from "@/lib/actions";
import { Field, Input } from "@/components/ui/fields";
import { FormMessage, fieldError, fieldValue } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { requestPasswordReset } from "../actions";

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(requestPasswordReset, initialActionState);
  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormMessage state={state} />
      {state.status === "success" ? null : (
        <>
          <Field label="E-mail da conta" htmlFor="email" error={fieldError(state, "email")} required>
            <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" defaultValue={fieldValue(state, "email")} invalid={Boolean(fieldError(state, "email"))} />
          </Field>
          <SubmitButton className="w-full" pendingText="Enviando…">
            Enviar link de recuperação
          </SubmitButton>
        </>
      )}
    </form>
  );
}
