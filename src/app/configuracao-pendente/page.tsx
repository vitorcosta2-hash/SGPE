import type { Metadata } from "next";
import { BrandMark } from "@/components/layout/brand";

export const metadata: Metadata = { title: "Configuração pendente" };

/** Exibida quando as variáveis de ambiente do Supabase não foram preenchidas. */
export default function PendingConfigPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5 py-10">
      <div className="mb-6 flex items-center gap-3">
        <BrandMark tone="dark" size={36} />
        <span className="text-lg font-semibold tracking-wide text-navy">SGPE</span>
      </div>
      <h1 className="text-2xl font-semibold text-navy">Configuração pendente</h1>
      <p className="mt-2 text-sm text-muted">
        O sistema ainda não está conectado ao Supabase. Crie o arquivo <code className="rounded bg-surface px-1">.env.local</code> a
        partir de <code className="rounded bg-surface px-1">.env.example</code> e preencha:
      </p>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">
        <li>
          <code className="rounded bg-surface px-1">NEXT_PUBLIC_SUPABASE_URL</code> — URL do projeto Supabase
        </li>
        <li>
          <code className="rounded bg-surface px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> — chave pública (anon/publishable)
        </li>
      </ul>
      <p className="mt-4 text-sm text-muted">
        Depois, reinicie o servidor. As instruções completas estão no <code className="rounded bg-surface px-1">README.md</code>.
      </p>
    </div>
  );
}
