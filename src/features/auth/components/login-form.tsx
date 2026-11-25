"use client";

import Link from "next/link";
import { useActionState } from "react";
import { initialActionState } from "@/lib/actions";
import { Field, Input } from "@/components/ui/fields";
import { FormMessage, fieldError, fieldValue } from "@/components/ui/form-message";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { signIn } from "../actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState(signIn, initialActionState);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <FormMessage state={state} />
      <Field label="E-mail" htmlFor="email" error={fieldError(state, "email")} required>
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" defaultValue={fieldValue(state, "email")} invalid={Boolean(fieldError(state, "email"))} />
      </Field>
      <Field label="Senha" htmlFor="password" error={fieldError(state, "password")} required>
        <PasswordInput id="password" name="password" autoComplete="current-password" invalid={Boolean(fieldError(state, "password"))} />
      </Field>
      <div className="flex justify-end">
        <Link href="/recuperar-senha" className="text-sm text-brand underline-offset-2 hover:underline">
          Esqueci minha senha
        </Link>
      </div>
      <SubmitButton className="w-full" pendingText="Entrando…">
        Entrar
      </SubmitButton>
    </form>
  );
}
