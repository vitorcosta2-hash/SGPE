import type { Metadata } from "next";
import { ArrowLeftRight, Search } from "lucide-react";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/fields";
import { FlashNotice } from "@/components/ui/flash-notice";
import { PageHeader } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { MovementsTable } from "@/features/produtos/components/movements-table";
import { listMovements } from "@/features/produtos/movements-query";
import { listActiveProductOptions } from "@/features/produtos/queries";
import { requireAppContext } from "@/lib/auth/session";
import { resolveDateRange, todayInTimezone } from "@/lib/domain/dates";
import { MOVEMENT_GROUPS } from "@/lib/domain/stock";
import { firstParam, PAGE_SIZE, parsePage, type SearchParams } from "@/lib/search";

export const metadata: Metadata = { title: "Movimentações" };

export default async function MovementsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const ctx = await requireAppContext();
  const today = todayInTimezone(ctx.company.timezone);
  const range = resolveDateRange(firstParam(params.de), firstParam(params.ate), today);
  const produto = firstParam(params.produto);
  const grupo = firstParam(params.grupo);
  const page = parsePage(params.pagina);

  const [{ rows, total }, products] = await Promise.all([
    listMovements(ctx, { produto, grupo, from: range.from, to: range.to, page }),
    listActiveProductOptions(ctx),
  ]);

  return (
    <>
      <PageHeader
        title="Movimentações"
        description="Histórico imutável de tudo que alterou o estoque. Correções são feitas com novas movimentações."
        actions={<ButtonLink href="/movimentacoes/nova">Registrar movimentação</ButtonLink>}
      />
      <FlashNotice code={params.aviso} />

      <form method="get" role="search" className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        <Select name="produto" defaultValue={produto ?? ""} aria-label="Produto">
          <option value="">Todos os produtos</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select name="grupo" defaultValue={grupo ?? ""} aria-label="Tipo">
          <option value="">Todos os tipos</option>
          {MOVEMENT_GROUPS.map((g) => (
            <option key={g.key} value={g.key}>
              {g.label}
            </option>
          ))}
        </Select>
        <Input type="date" name="de" defaultValue={range.from} aria-label="Data inicial" />
        <Input type="date" name="ate" defaultValue={range.to} aria-label="Data final" />
        <button type="submit" className={buttonClasses("secondary", "md")}>
          <Search aria-hidden className="h-4 w-4" /> Filtrar
        </button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={<ArrowLeftRight aria-hidden className="h-8 w-8" />}
          title="Nenhuma movimentação no período"
          description="Ajuste os filtros ou registre uma movimentação de estoque."
        />
      ) : (
        <>
          <MovementsTable rows={rows} timezone={ctx.company.timezone} />
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            basePath="/movimentacoes"
            params={{ produto, grupo, de: range.from, ate: range.to }}
          />
        </>
      )}
    </>
  );
}
