import type { ActionState } from "@/lib/actions";
import { Alert } from "./feedback";

/** Mensagem de resultado de uma Server Action (erro ou sucesso). */
export function FormMessage({ state }: { state: ActionState }) {
  if (state.status === "idle" || !state.message) return null;
  return <Alert variant={state.status === "success" ? "success" : "error"}>{state.message}</Alert>;
}

/** Erro de um campo específico, se houver. */
export function fieldError(state: ActionState, name: string): string | undefined {
  return state.fieldErrors?.[name];
}

/** Valor anterior de um campo (para repreencher o formulário após erro). */
export function fieldValue(state: ActionState, name: string, fallback = ""): string {
  return state.values?.[name] ?? fallback;
}
