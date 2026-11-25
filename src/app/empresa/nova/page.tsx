import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/layout/brand";
import { CreateCompanyForm } from "@/features/auth/components/create-company-form";
import { signOut } from "@/features/auth/actions";
import { getAppContext, getUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Criar empresa" };

export default async function NewCompanyPage() {
  const user = await getUser();
  if (!user) redirect("/entrar");
  const ctx = await getAppContext();
  if (ctx && ctx !== "no-company") redirect("/");

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <BrandMark tone="dark" size={36} />
          <span className="text-lg font-semibold tracking-wide text-navy">SGPE</span>
        </div>
        <h1 className="text-2xl font-semibold text-navy">Crie a sua empresa</h1>
        <p className="mt-1 text-sm text-muted">
          Sua conta ainda não está vinculada a uma empresa. Informe o nome para começar.
        </p>
        <div className="mt-6">
          <CreateCompanyForm />
        </div>
        <form action={signOut} className="mt-8 text-center">
          <button type="submit" className="text-sm text-muted underline-offset-2 hover:underline">
            Sair da conta
          </button>
        </form>
      </div>
    </div>
  );
}
