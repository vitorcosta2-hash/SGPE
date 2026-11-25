"use client";

import { useActionState, useState, type ReactNode } from "react";
import type { ActionState } from "@/lib/actions";
import { initialActionState } from "@/lib/actions";
import { Button, type ButtonVariant } from "./button";
import { FormMessage } from "./form-message";
import { SubmitButton } from "./submit-button";

interface InlineConfirmProps {
  /** Texto do botão que abre a confirmação. */
  triggerLabel: string;
  triggerVariant?: ButtonVariant;
  /** Pergunta de confirmação. */
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  /** Campos ocultos enviados com a ação (ex.: id do registro). */
  hidden?: Record<string, string>;
  /** Campos extras (ex.: motivo). */
  children?: ReactNode;
}

/**
 * Confirmação de ações destrutivas dentro da própria página (sem janela pop-up):
 * o primeiro clique apenas revela a confirmação; a ação só roda no segundo passo.
 */
export function InlineConfirm({
  triggerLabel,
  triggerVariant = "danger-outline",
  title,
  description,
  confirmLabel,
  pendingLabel,
  action,
  hidden,
  children,
}: InlineConfirmProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(action, initialActionState);

  if (!open) {
    return (
      <Button variant={triggerVariant} onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-md border border-red-200 bg-red-50/60 p-4">
      <div>
        <p className="text-sm font-semibold text-red-900">{title}</p>
        {description ? <div className="mt-1 text-sm text-red-900/80">{description}</div> : null}
      </div>
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <FormMessage state={state} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton variant="danger" pendingText={pendingLabel}>
          {confirmLabel}
        </SubmitButton>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Voltar
        </Button>
      </div>
    </form>
  );
}
