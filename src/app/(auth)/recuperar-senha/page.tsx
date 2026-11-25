import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-form";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function ForgotPasswordPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy">Recuperar senha</h1>
      <p className="mt-1 text-sm text-muted">Informe o e-mail da sua conta para receber o link de redefinição.</p>
      <div className="mt-6">
        <ForgotPasswordForm />
      </div>
      <p className="mt-8 text-center text-sm text-muted">
        <Link href="/entrar" className="font-medium text-brand underline-offset-2 hover:underline">
          Voltar para o login
        </Link>
      </p>
    </div>
  );
}
