"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CircleAlert, Info, Search, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/cn";

interface Hit {
  group: string;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}
interface Notice {
  id: string;
  tone: "danger" | "warning" | "info";
  title: string;
  description?: string;
  href: string;
}

const TONE_ICON = { danger: CircleAlert, warning: TriangleAlert, info: Info } as const;
const TONE_COLOR = { danger: "text-red-600", warning: "text-amber-600", info: "text-sky-600" } as const;

/** Busca global (atalho "/" ou Ctrl+K) e central de avisos. Os dados vêm das APIs da empresa logada. */
export function ShellTools({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const [bellOpen, setBellOpen] = useState(false);
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [noticeError, setNoticeError] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setQuery("");
    setHits([]);
    setSearchError(false);
  }, []);

  // Atalhos: "/" ou Ctrl/Cmd+K abrem a busca (exceto ao digitar em campos); Esc fecha.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === "Escape") {
        closeSearch();
        setBellOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeSearch]);

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  // Busca com atraso para não consultar a cada tecla.
  useEffect(() => {
    if (!searchOpen) return;
    if (query.trim().length < 2) return; // a lista só é exibida com 2+ letras
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/busca?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { hits: Hit[] };
        setHits(data.hits);
        setActive(0);
        setSearchError(false);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setSearchError(true);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, searchOpen]);

  // Avisos: carrega ao abrir e fecha ao clicar fora.
  useEffect(() => {
    if (!bellOpen) return;
    let cancelled = false;
    fetch("/api/notificacoes")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { items: Notice[] }) => {
        if (!cancelled) {
          setNotices(d.items);
          setNoticeError(false);
        }
      })
      .catch(() => !cancelled && setNoticeError(true));
    const onDown = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => {
      cancelled = true;
      document.removeEventListener("mousedown", onDown);
    };
  }, [bellOpen]);

  // Contagem inicial do sino (sem abrir o painel).
  useEffect(() => {
    fetch("/api/notificacoes")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { items: Notice[] } | null) => d && setNotices(d.items))
      .catch(() => undefined);
  }, []);

  function go(href: string) {
    closeSearch();
    setBellOpen(false);
    router.push(href);
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(hits.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && hits[active]) {
      e.preventDefault();
      go(hits[active].href);
    }
  }

  const btn = cn(
    "inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm transition-colors",
    tone === "dark" ? "text-white hover:bg-white/10" : "border border-line bg-white text-muted hover:bg-surface",
  );
  const count = notices?.length ?? 0;
  const groups = hits.reduce<Record<string, Hit[]>>((acc, h) => ((acc[h.group] ??= []).push(h), acc), {});
  let index = -1;

  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={() => setSearchOpen(true)} className={btn} aria-label="Buscar no sistema">
        <Search aria-hidden className="h-4 w-4" />
        <span className="hidden sm:inline">Buscar</span>
        <kbd className={cn("hidden rounded border px-1.5 text-[11px] lg:inline", tone === "dark" ? "border-white/30" : "border-line")}>/</kbd>
      </button>

      <div ref={bellRef} className="relative">
        <button type="button" onClick={() => setBellOpen((v) => !v)} className={cn(btn, "relative px-2.5")} aria-label={count > 0 ? `Avisos: ${count} novos` : "Avisos"} aria-expanded={bellOpen}>
          <Bell aria-hidden className="h-[18px] w-[18px]" />
          {count > 0 ? (
            <span aria-hidden className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
              {count > 9 ? "9+" : count}
            </span>
          ) : null}
        </button>
        {bellOpen ? (
          <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] rounded-md border border-line bg-white text-ink shadow-xl">
            <p className="border-b border-line px-4 py-3 text-sm font-semibold text-navy">Avisos</p>
            {noticeError ? (
              <p className="px-4 py-6 text-sm text-red-700">Não foi possível carregar os avisos.</p>
            ) : notices === null ? (
              <p className="px-4 py-6 text-sm text-muted">Carregando…</p>
            ) : notices.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted">Tudo em ordem: nenhum aviso no momento.</p>
            ) : (
              <ul className="max-h-96 divide-y divide-line overflow-y-auto">
                {notices.map((n) => {
                  const Icon = TONE_ICON[n.tone];
                  return (
                    <li key={n.id}>
                      <Link href={n.href} onClick={() => setBellOpen(false)} className="flex gap-3 px-4 py-3 hover:bg-surface">
                        <Icon aria-hidden className={cn("mt-0.5 h-4 w-4 shrink-0", TONE_COLOR[n.tone])} />
                        <span className="min-w-0 text-sm">
                          <span className="block font-medium">{n.title}</span>
                          {n.description ? <span className="block truncate text-xs text-muted">{n.description}</span> : null}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      {searchOpen ? (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-navy/50 p-3 pt-[10vh]" onMouseDown={(e) => e.target === e.currentTarget && closeSearch()}>
          <div role="dialog" aria-modal="true" aria-label="Busca global" className="w-full max-w-xl overflow-hidden rounded-lg bg-white text-ink shadow-2xl">
            <div className="flex items-center gap-2 border-b border-line px-3">
              <Search aria-hidden className="h-4 w-4 text-muted" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKey}
                placeholder="Buscar produto, cliente, fornecedor, venda (nº) ou promoção"
                aria-label="Buscar"
                className="h-12 flex-1 border-0 bg-transparent text-base outline-none placeholder:text-slate-400"
              />
              <button type="button" onClick={closeSearch} aria-label="Fechar busca" className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-surface">
                <X aria-hidden className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto" aria-live="polite">
              {query.trim().length < 2 ? (
                <p className="px-4 py-8 text-center text-sm text-muted">Digite pelo menos 2 letras. Dica: digite o número de uma venda para abri-la.</p>
              ) : searchError ? (
                <p className="px-4 py-8 text-center text-sm text-red-700">Não foi possível buscar agora. Tente de novo.</p>
              ) : searching && hits.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted">Buscando…</p>
              ) : hits.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted">Nada encontrado para “{query.trim()}”.</p>
              ) : (
                Object.entries(groups).map(([group, list]) => (
                  <div key={group}>
                    <p className="bg-surface px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{group}</p>
                    <ul>
                      {list.map((h) => {
                        index += 1;
                        const i = index;
                        return (
                          <li key={`${h.group}-${h.id}`}>
                            <button
                              type="button"
                              onClick={() => go(h.href)}
                              onMouseEnter={() => setActive(i)}
                              className={cn("flex w-full items-baseline justify-between gap-3 px-4 py-2.5 text-left text-sm", active === i && "bg-surface")}
                            >
                              <span className="truncate font-medium">{h.title}</span>
                              {h.subtitle ? <span className="shrink-0 text-xs text-muted">{h.subtitle}</span> : null}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
