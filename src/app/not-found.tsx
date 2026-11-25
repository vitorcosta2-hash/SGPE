import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-5 text-center">
      <p className="text-sm font-semibold text-accent-700">Erro 404</p>
      <h1 className="mt-2 text-2xl font-semibold text-navy">Página não encontrada</h1>
      <p className="mt-2 text-sm text-muted">O endereço não existe ou o registro foi removido.</p>
      <Link href="/" className={buttonClasses("primary", "md", "mt-6")}>
        Ir para o início
      </Link>
    </div>
  );
}
