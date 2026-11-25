import type { ReactNode } from "react";
import { BrandMark } from "@/components/layout/brand";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="hidden flex-col justify-between bg-navy p-12 text-slate-200 lg:flex">
        <div className="flex items-center gap-3">
          <BrandMark tone="light" size={44} />
          <span className="text-xl font-semibold tracking-wide text-white">SGPE</span>
        </div>
        <div className="max-w-md">
          <h1 className="text-3xl font-semibold leading-tight text-white">
            Controle de estoque simples para quem vende todos os dias.
          </h1>
          <p className="mt-4 text-slate-300">
            Cadastre produtos, registre entradas e saídas, venda e acompanhe o que precisa ser reposto — tudo em um só lugar, sem treinamento técnico.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-slate-200">
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              Saldo sempre atualizado, com histórico completo de movimentações.
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              Vendas que baixam o estoque automaticamente.
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              Alertas de estoque baixo, precificação e relatórios.
            </li>
          </ul>
        </div>
        <p className="text-xs text-slate-400">Sistema de Gerenciamento Web para Pequenas Empresas</p>
      </aside>

      <div className="flex min-h-screen flex-col justify-center px-5 py-10 sm:px-10 lg:min-h-0">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark tone="dark" size={36} />
            <span className="text-lg font-semibold tracking-wide text-navy">SGPE</span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
