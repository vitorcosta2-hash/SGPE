"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  errorState,
  formDataToObject,
  successState,
  validate,
  type ActionState,
} from "@/lib/actions";
import { getConfiguredSiteUrl } from "@/lib/env";
import { safeNextPath } from "@/lib/auth/redirect";
import { describeDbError, logDbError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import {
  createCompanySchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "./schemas";

/** Origem pública para links de e-mail: prefere a URL configurada (evita Host header spoofing). */
async function siteOrigin(): Promise<string> {
  const configured = getConfiguredSiteUrl();
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Remove campos de senha dos valores devolvidos ao formulário. */
function safeValues(raw: Record<string, string>): Record<string, string> {
  const out = { ...raw };
  delete out.password;
  delete out.password_confirm;
  return out;
}

function authErrorMessage(message: string, status?: number): string {
  const text = message.toLowerCase();
  if (text.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (text.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.";
  if (text.includes("rate limit") || status === 429) return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  if (text.includes("password") && text.includes("weak")) return "Senha fraca. Use uma senha mais longa e difícil de adivinhar.";
  if (text.includes("same password")) return "A nova senha deve ser diferente da senha atual.";
  if (text.includes("already registered") || text.includes("already been registered")) return "Já existe uma conta com este e-mail.";
  if (text.includes("session") && text.includes("missing")) return "Sua sessão expirou. Solicite um novo link de recuperação.";
  return "Não foi possível concluir a operação. Tente novamente.";
}

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = formDataToObject(formData);
  const parsed = validate(signInSchema, raw, safeValues(raw));
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    return errorState(authErrorMessage(error.message, error.status), { values: { email: raw.email ?? "", next: raw.next ?? "" } });
  }
  redirect(safeNextPath(parsed.data.next));
}

export async function signUp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = formDataToObject(formData);
  const parsed = validate(signUpSchema, raw, safeValues(raw));
  if (!parsed.ok) return parsed.state;

  const { email, password, full_name, company_name } = parsed.data;
  const supabase = await createClient();
  const origin = await siteOrigin();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name, company_name },
      emailRedirectTo: `${origin}/auth/confirmar?next=/`,
    },
  });

  if (error) {
    return errorState(authErrorMessage(error.message, error.status), { values: safeValues(raw) });
  }

  // Com confirmação de e-mail ativa, um e-mail já cadastrado volta sem identidades.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return errorState("Já existe uma conta com este e-mail. Tente entrar ou recuperar a senha.", { values: safeValues(raw) });
  }

  if (data.session) redirect("/?aviso=empresa-criada");

  return successState(
    "Cadastro realizado! Enviamos um link de confirmação para o seu e-mail. Confirme-o para acessar o sistema.",
  );
}

export async function requestPasswordReset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = formDataToObject(formData);
  const parsed = validate(forgotPasswordSchema, raw);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const origin = await siteOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/confirmar?next=/redefinir-senha`,
  });
  if (error && (error.status === 429 || error.message.toLowerCase().includes("rate"))) {
    return errorState("Muitas tentativas. Aguarde alguns minutos e tente novamente.", { values: raw });
  }
  // Resposta neutra: não revela se o e-mail possui cadastro.
  return successState("Se houver uma conta com este e-mail, enviamos um link para redefinir a senha.");
}

export async function updatePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = formDataToObject(formData);
  const parsed = validate(resetPasswordSchema, raw, {});
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return errorState("Seu link expirou ou já foi usado. Solicite um novo link de recuperação.");
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return errorState(authErrorMessage(error.message, error.status));

  redirect("/?aviso=senha-redefinida");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/entrar");
}

/** Cria a empresa de um usuário que ainda não possui nenhuma. */
export async function createCompany(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = formDataToObject(formData);
  const parsed = validate(createCompanySchema, raw);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/entrar");

  const { error } = await supabase.rpc("create_company", { p_name: parsed.data.company_name });
  if (error) {
    logDbError("create_company", error);
    return errorState(describeDbError(error), { values: raw });
  }
  redirect("/?aviso=empresa-criada");
}
