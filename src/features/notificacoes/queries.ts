import type { AppContext } from "@/lib/auth/session";
import { addDays, todayInTimezone } from "@/lib/domain/dates";
import { formatQuantity } from "@/lib/format";

export interface AppNotification {
  id: string;
  tone: "danger" | "warning" | "info";
  title: string;
  description?: string;
  href: string;
}

/**
 * Avisos calculados na hora a partir dos dados reais (não há tabela de notificações):
 * estoque zerado ou baixo, promoções terminando e vendas canceladas hoje.
 */
export async function getNotifications(ctx: AppContext): Promise<AppNotification[]> {
  const today = todayInTimezone(ctx.company.timezone);
  const company = ctx.company.id;
  const db = ctx.supabase;

  const [out, low, ending, cancelled] = await Promise.all([
    db.from("products_overview").select("id, name, unit, stock_quantity", { count: "exact" }).eq("company_id", company).eq("is_active", true).eq("stock_status", "out").order("name").limit(3),
    db.from("products_overview").select("id, name, unit, stock_quantity, min_stock", { count: "exact" }).eq("company_id", company).eq("is_active", true).eq("stock_status", "low").order("stock_quantity").limit(3),
    db.from("promotions_overview").select("id, name, ends_on").eq("company_id", company).eq("status", "active").lte("ends_on", addDays(today, 2)).order("ends_on").limit(3),
    db.rpc("report_period_metrics", { p_company_id: company, p_from: today, p_to: today }),
  ]);

  const items: AppNotification[] = [];
  const outCount = out.count ?? 0;
  if (outCount > 0) {
    const names = (out.data ?? []).map((p: { name: string }) => p.name).join(", ");
    items.push({
      id: "estoque-zerado", tone: "danger",
      title: `${outCount} ${outCount === 1 ? "produto sem estoque" : "produtos sem estoque"}`,
      description: outCount > 3 ? `${names} e outros` : names, href: "/produtos?estoque=out",
    });
  }
  const lowCount = low.count ?? 0;
  if (lowCount > 0) {
    const names = (low.data ?? [])
      .map((p: { name: string; unit: string; stock_quantity: number }) => `${p.name} (${formatQuantity(p.stock_quantity, p.unit)} ${p.unit})`)
      .join(", ");
    items.push({
      id: "estoque-baixo", tone: "warning",
      title: `${lowCount} ${lowCount === 1 ? "produto com estoque baixo" : "produtos com estoque baixo"}`,
      description: lowCount > 3 ? `${names} e outros` : names, href: "/produtos?estoque=low",
    });
  }
  for (const p of (ending.data ?? []) as { id: string; name: string; ends_on: string }[]) {
    const when = p.ends_on === today ? "termina hoje" : p.ends_on === addDays(today, 1) ? "termina amanhã" : "termina em 2 dias";
    items.push({ id: `promo-${p.id}`, tone: "info", title: `Promoção "${p.name}" ${when}`, href: `/promocoes/${p.id}` });
  }
  const cancelledToday = (cancelled.data as { cancelled_count?: number } | null)?.cancelled_count ?? 0;
  if (cancelledToday > 0) {
    items.push({
      id: "cancelamentos", tone: "warning",
      title: `${cancelledToday} ${cancelledToday === 1 ? "venda cancelada hoje" : "vendas canceladas hoje"}`, href: "/vendas",
    });
  }
  return items;
}
