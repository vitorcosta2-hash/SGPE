import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "@/features/auth/components/signup-form";

export const metadata: Metadata = { title: "Criar conta" };

export default function SignUpPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy">Criar conta</h1>
      <p className="mt-1 text-sm text-muted">Cadastre sua empresa e comece a controlar o estoque.</p>
      <div className="mt-6">
        <SignUpForm />
      </div>
      <p className="mt-8 text-center text-sm text-muted">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-medium text-brand underline-offset-2 hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
