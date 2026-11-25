import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/feedback";
import { ResetPasswordForm } from "@/features/auth/components/reset-form";
import { getUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Redefinir senha" };

export default async function ResetPasswordPage() {
  // Chegamos aqui pelo link de recuperação, que cria uma sessão temporária.
  const user = await getUser();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy">Redefinir senha</h1>
      {user ? (
        <>
          <p className="mt-1 text-sm text-muted">Escolha uma nova senha para a sua conta.</p>
          <div className="mt-6">
            <ResetPasswordForm />
          </div>
        </>
      ) : (
        <div className="mt-6 space-y-4">
          <Alert variant="error">O link de recuperação é inválido ou expirou.</Alert>
          <Link href="/recuperar-senha" className="text-sm font-medium text-brand underline-offset-2 hover:underline">
            Solicitar um novo link
          </Link>
        </div>
      )}
    </div>
  );
}
