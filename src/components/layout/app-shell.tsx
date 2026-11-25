"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { BrandMark } from "./brand";
import { NAV_ITEMS, isActivePath } from "./nav";
import { ShellTools } from "./shell-tools";

interface AppShellProps {
  companyName: string;
  userName: string;
  userEmail: string;
  signOutAction: () => Promise<void>;
  children: ReactNode;
}

export function AppShell({ companyName, userName, userEmail, signOutAction, children }: AppShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Fecha o menu do celular ao navegar (ajuste de estado durante a renderização).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  const sidebar = (
    <div className="flex h-full flex-col bg-navy text-slate-200">
      <div className="flex items-center gap-3 px-5 py-5">
        <BrandMark tone="light" size={34} />
        <div className="min-w-0">
          <p className="text-base font-semibold leading-tight tracking-wide text-white">SGPE</p>
          <p className="truncate text-xs text-slate-400">Gestão para pequenas empresas</p>
        </div>
      </div>

      <div className="mx-5 mb-3 rounded-md bg-white/5 px-3 py-2">
        <p className="text-[11px] uppercase tracking-wide text-slate-400">Empresa</p>
        <p className="truncate text-sm font-medium text-white" title={companyName}>
          {companyName}
        </p>
      </div>

      <nav aria-label="Menu principal" className="flex-1 overflow-y-auto px-3 pb-4">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors md:min-h-10",
                    active ? "bg-white/10 font-medium text-white" : "text-slate-300 hover:bg-white/5 hover:text-white",
                  )}
                >
                  {active ? <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded bg-accent" /> : null}
                  <Icon aria-hidden className="h-[18px] w-[18px] shrink-0" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-white/10 px-5 py-4">
        <p className="truncate text-sm font-medium text-white" title={userName}>
          {userName}
        </p>
        <p className="truncate text-xs text-slate-400" title={userEmail}>
          {userEmail}
        </p>
        <form action={signOutAction} className="mt-3">
          <button
            type="submit"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-white/20 px-3 text-sm text-slate-100 transition-colors hover:bg-white/10"
          >
            <LogOut aria-hidden className="h-4 w-4" />
            Sair
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow"
      >
        Ir para o conteúdo
      </a>

      {/* Barra superior (celular/tablet) */}
      <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 bg-navy px-4 text-white lg:hidden">
        <button
          type="button"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
          aria-controls="menu-lateral"
          onClick={() => setOpen((v) => !v)}
          className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-md hover:bg-white/10"
        >
          {open ? <X aria-hidden className="h-5 w-5" /> : <Menu aria-hidden className="h-5 w-5" />}
        </button>
        <BrandMark tone="light" size={28} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{companyName}</span>
        <ShellTools tone="dark" />
      </header>

      {/* Menu lateral: fixo no desktop, gaveta no celular */}
      <aside
        id="menu-lateral"
        className={cn(
          "no-print fixed inset-y-0 left-0 z-40 w-72 transform transition-transform duration-200 lg:static lg:z-auto lg:w-64 lg:translate-x-0 lg:shrink-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="h-full lg:sticky lg:top-0 lg:h-screen">{sidebar}</div>
      </aside>
      {open ? (
        <button
          type="button"
          aria-label="Fechar menu"
          className="no-print fixed inset-0 z-30 bg-navy/50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <main id="conteudo" className="min-w-0 flex-1">
        <div className="no-print sticky top-0 z-30 hidden justify-end border-b border-line bg-white/90 px-10 py-2 backdrop-blur lg:flex">
          <ShellTools tone="light" />
        </div>
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
