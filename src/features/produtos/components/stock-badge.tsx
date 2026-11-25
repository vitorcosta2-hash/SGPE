import { Badge } from "@/components/ui/feedback";
import { STOCK_STATUS_LABELS, type StockStatus } from "@/lib/domain/stock";

const VARIANT = { ok: "success", low: "warning", out: "danger" } as const;

export function StockBadge({ status }: { status: StockStatus }) {
  return <Badge variant={VARIANT[status]}>{STOCK_STATUS_LABELS[status]}</Badge>;
}
