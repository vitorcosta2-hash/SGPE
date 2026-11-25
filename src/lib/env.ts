/**
 * Variáveis de ambiente públicas do Supabase.
 *
 * Importante: o Next.js só embute no navegador as variáveis NEXT_PUBLIC_* quando
 * elas são referenciadas literalmente (process.env.NEXT_PUBLIC_X), por isso não
 * há acesso dinâmico por chave aqui. A chave service_role NUNCA é usada pela aplicação.
 */
export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

export function getSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )?.trim();

  if (!url || !anonKey) return null;
  if (!/^https?:\/\//.test(url)) return null;
  return { url, anonKey };
}

export function requireSupabaseEnv(): SupabaseEnv {
  const env = getSupabaseEnv();
  if (!env) {
    throw new Error(
      "Supabase não configurado: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY (veja .env.example).",
    );
  }
  return env;
}

/** URL pública do sistema, usada nos links de e-mail (confirmação e recuperação de senha). */
export function getConfiguredSiteUrl(): string | null {
  const value = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return value ? value.replace(/\/+$/, "") : null;
}
