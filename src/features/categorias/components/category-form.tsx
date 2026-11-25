"use client";

import { useActionState } from "react";
import { initialActionState, type ActionState } from "@/lib/actions";
import { Field, Input, Textarea } from "@/components/ui/fields";
import { FormMessage, fieldError, fieldValue } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";

interface CategoryFormProps {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  /** Preenchimento inicial (edição). */
  category?: { id: string; name: string; description: string | null };
  submitLabel: string;
  /** Layout compacto em linha (cadastro rápido na listagem). */
  inline?: boolean;
}

export function CategoryForm({ action, category, submitLabel, inline }: CategoryFormProps) {
  const [state, formAction] = useActionState(action, initialActionState);
  const nameError = fieldError(state, "name");

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {category ? <input type="hidden" name="id" value={category.id} /> : null}
      <FormMessage state={state} />
      <div className={inline ? "grid gap-4 md:grid-cols-[1fr_1.5fr_auto] md:items-start" : "space-y-4"}>
        <Field label="Nome" htmlFor="name" error={nameError} required>
          <Input id="name" name="name" maxLength={80} defaultValue={fieldValue(state, "name", category?.name ?? "")} invalid={Boolean(nameError)} />
        </Field>
        <Field label="Descrição" htmlFor="description" error={fieldError(state, "description")} hint="Opcional.">
          {inline ? (
            <Input id="description" name="description" maxLength={300} defaultValue={fieldValue(state, "description", category?.description ?? "")} />
          ) : (
            <Textarea id="description" name="description" maxLength={300} defaultValue={fieldValue(state, "description", category?.description ?? "")} />
          )}
        </Field>
        <div className={inline ? "md:pt-[26px]" : ""}>
          <SubmitButton pendingText="Salvando…" className={inline ? "w-full md:w-auto" : undefined}>
            {submitLabel}
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
