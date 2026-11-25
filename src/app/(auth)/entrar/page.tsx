import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/feedback";
import { LoginForm } from "@/features/auth/components/login-form";
import { safeNextPath } from "@/lib/auth/redirect";
import { firstParam, type SearchParams } from "@/lib/search";

export const metadata: Metadata = { title: "Entrar" };

const ERRORS: Record<string, string> = {
  "link-invalido": "O link de confirmação é inválido ou expirou. Solicite um novo.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const next = safeNextPath(firstParam(params.next), "");
  const errorKey = firstParam(params.erro);
  const error = errorKey && Object.hasOwn(ERRORS, errorKey) ? ERRORS[errorKey] : null;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy">Entrar</h1>
      <p className="mt-1 text-sm text-muted">Acesse o painel da sua empresa.</p>
      <div className="mt-6 space-y-4">
        {error ? <Alert variant="error">{error}</Alert> : null}
        <LoginForm next={next || undefined} />
      </div>
      <p className="mt-8 text-center text-sm text-muted">
        Ainda não tem conta?{" "}
        <Link href="/cadastro" className="font-medium text-brand underline-offset-2 hover:underline">
          Cadastre-se
        </Link>
      </p>
    </div>
  );
}
