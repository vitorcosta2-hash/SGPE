import Link from "next/link";
import { Badge } from "@/components/ui/feedback";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDateTime } from "@/lib/domain/dates";
import { MOVEMENT_TYPE_LABELS, movementDirection } from "@/lib/domain/stock";
import { formatQuantity } from "@/lib/format";
import type { MovementRow } from "@/types/db";

export function MovementsTable({ rows, timezone, showProduct = true }: { rows: MovementRow[]; timezone: string; showProduct?: boolean }) {
  const columns: Column<MovementRow>[] = [
    { key: "date", header: "Data", cell: (m) => <span className="whitespace-nowrap">{formatDateTime(m.created_at, timezone)}</span>, primary: !showProduct },
    ...(showProduct
      ? [
          {
            key: "product",
            header: "Produto",
            primary: true,
            cell: (m: MovementRow) => (
              <Link href={`/produtos/${m.product_id}`} className="font-medium text-brand hover:underline">
                {m.product_name}
              </Link>
            ),
          } satisfies Column<MovementRow>,
        ]
      : []),
    {
      key: "type",
      header: "Tipo",
      cell: (m) => <Badge variant={movementDirection(m.type) > 0 ? "success" : "warning"}>{MOVEMENT_TYPE_LABELS[m.type]}</Badge>,
    },
    {
      key: "qty",
      header: "Quantidade",
      align: "right",
      cell: (m) => `${movementDirection(m.type) > 0 ? "+" : "−"}${formatQuantity(m.quantity, m.product_unit)} ${m.product_unit}`,
    },
    {
      key: "balance",
      header: "Saldo",
      align: "right",
      cell: (m) => `${formatQuantity(m.balance_before, m.product_unit)} → ${formatQuantity(m.balance_after, m.product_unit)}`,
    },
    {
      key: "reason",
      header: "Motivo / origem",
      cell: (m) =>
        m.sale_id ? (
          <Link href={`/vendas/${m.sale_id}`} className="text-brand hover:underline">
            Venda nº {m.sale_number}
          </Link>
        ) : (
          (m.reason ?? <span className="text-muted">—</span>)
        ),
      className: "max-w-xs",
    },
    { key: "user", header: "Usuário", cell: (m) => m.created_by_name ?? <span className="text-muted">—</span>, hideOnMobile: true },
  ];

  return <DataTable columns={columns} rows={rows} rowKey={(m) => m.id} caption="Movimentações de estoque" />;
}
