import type { Metadata } from "next";
import Link from "next/link";
import { BadgePercent } from "lucide-react";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { FlashNotice } from "@/components/ui/flash-notice";
import { PageHeader } from "@/components/ui/page";
import { listPromotions } from "@/features/promocoes/queries";
import { requireAppContext } from "@/lib/auth/session";
import { formatIsoDate } from "@/lib/domain/dates";
import { describeDiscount } from "@/lib/domain/promotions";
import { PROMOTION_STATUS_LABELS, type PromotionStatus } from "@/lib/domain/stock";
import { formatCurrency } from "@/lib/format";
import { firstParam, type SearchParams } from "@/lib/search";
import type { PromotionRow } from "@/types/db";

export const metadata: Metadata = { title: "Promoções" };

const VARIANT = { active: "success", scheduled: "info", ended: "neutral" } as const;
const TABS: { value: string; label: string }[] = [
  { value: "", label: "Todas" },
  { value: "active", label: "Ativas" },
  { value: "scheduled", label: "Agendadas" },
  { value: "ended", label: "Encerradas" },
];

export default async function PromotionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const ctx = await requireAppContext();
  const status = firstParam(params.status) ?? "";
  const promotions = await listPromotions(ctx, status);
  const currency = ctx.company.currency;

  const columns: Column<PromotionRow>[] = [
    {
      key: "name",
      header: "Promoção",
      primary: true,
      cell: (p) => (
        <Link href={`/promocoes/${p.id}`} className="font-medium text-brand hover:underline">
          {p.name}
        </Link>
      ),
    },
    { key: "discount", header: "Desconto", cell: (p) => describeDiscount(p.discount_type, p.discount_value, (n) => formatCurrency(n, currency)) },
    { key: "period", header: "Período", cell: (p) => `${formatIsoDate(p.starts_on)} a ${formatIsoDate(p.ends_on)}` },
    { key: "products", header: "Produtos", align: "right", cell: (p) => p.product_count },
    { key: "status", header: "Situação", cell: (p) => <Badge variant={VARIANT[p.status as PromotionStatus]}>{PROMOTION_STATUS_LABELS[p.status as PromotionStatus]}</Badge> },
  ];

  return (
    <>
      <PageHeader
        title="Promoções"
        description="Descontos por período. O preço cadastrado do produto não muda; ao terminar o período a promoção deixa de valer sozinha."
        actions={<ButtonLink href="/promocoes/nova">Nova promoção</ButtonLink>}
      />
      <FlashNotice code={params.aviso} />

      <nav aria-label="Filtrar por situação" className="mb-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={t.value ? `/promocoes?status=${t.value}` : "/promocoes"}
            aria-current={status === t.value ? "page" : undefined}
            className={buttonClasses(status === t.value ? "primary" : "secondary", "sm")}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {promotions.length === 0 ? (
        <EmptyState
          icon={<BadgePercent aria-hidden className="h-8 w-8" />}
          title="Nenhuma promoção"
          description="Crie uma promoção para vender produtos selecionados com desconto por tempo determinado."
          action={<ButtonLink href="/promocoes/nova">Criar promoção</ButtonLink>}
        />
      ) : (
        <DataTable columns={columns} rows={promotions} rowKey={(p) => p.id} caption="Lista de promoções" />
      )}
    </>
  );
}
