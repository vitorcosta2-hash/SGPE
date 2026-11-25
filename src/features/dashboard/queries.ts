import type { AppContext } from "@/lib/auth/session";
import { todayInTimezone } from "@/lib/domain/dates";
import { resolvePeriod, type ResolvedPeriod } from "@/lib/domain/periods";
import type {
  DailyPoint,
  MovementRow,
  PeriodMetrics,
  ProductProfitRow,
  ProductRow,
  SaleRow,
  SalesSummary,
  StockSummary,
} from "@/types/db";

export const EMPTY_METRICS: PeriodMetrics = {
  sales_count: 0,
  revenue: 0,
  discounts: 0,
  cost: 0,
  profit: 0,
  margin_percent: null,
  avg_ticket: 0,
  units_sold: 0,
  cancelled_count: 0,
};

const EMPTY_STOCK: StockSummary = { total_products: 0, active_products: 0, low_stock: 0, out_of_stock: 0, stock_value: 0 };

export type ActivityItem =
  | { kind: "sale"; id: string; at: string; sale: SaleRow }
  | { kind: "movement"; id: string; at: string; movement: MovementRow };

export interface DashboardData {
  period: ResolvedPeriod;
  today: string;
  stock: StockSummary;
  hasProducts: boolean;
  current: PeriodMetrics;
  previous: PeriodMetrics;
  daily: DailyPoint[];
  topProducts: ProductProfitRow[];
  byPayment: SalesSummary["by_payment"];
  replenish: ProductRow[];
  activity: ActivityItem[];
}

export async function getDashboardData(
  ctx: AppContext,
  params: { periodo?: string; de?: string; ate?: string },
): Promise<DashboardData> {
  const today = todayInTimezone(ctx.company.timezone);
  const period = resolvePeriod(params, today);
  const companyId = ctx.company.id;
  const rpc = ctx.supabase.rpc.bind(ctx.supabase);

  const [stock, current, previous, daily, top, summary, replenish, movements, sales] = await Promise.all([
    rpc("report_stock_summary", { p_company_id: companyId }),
    rpc("report_period_metrics", { p_company_id: companyId, p_from: period.from, p_to: period.to }),
    rpc("report_period_metrics", { p_company_id: companyId, p_from: period.previous.from, p_to: period.previous.to }),
    rpc("report_sales_daily", { p_company_id: companyId, p_from: period.from, p_to: period.to }),
    rpc("report_product_profitability", { p_company_id: companyId, p_from: period.from, p_to: period.to, p_limit: 5, p_order: "quantity" }),
    rpc("report_sales_summary", { p_company_id: companyId, p_from: period.from, p_to: period.to }),
    ctx.supabase
      .from("products_overview")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .in("stock_status", ["low", "out"])
      .order("stock_quantity", { ascending: true })
      .order("name", { ascending: true })
      .limit(6),
    ctx.supabase
      .from("stock_movements_detailed")
      .select("*")
      .eq("company_id", companyId)
      // Saídas e estornos de venda já aparecem como a própria venda.
      .not("type", "in", "(sale_exit,sale_reversal)")
      .order("seq", { ascending: false })
      .limit(6),
    ctx.supabase.from("sales_overview").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(6),
  ]);

  const stockSummary = (stock.data as StockSummary | null) ?? EMPTY_STOCK;
  const activity: ActivityItem[] = [
    ...((sales.data ?? []) as SaleRow[]).map((sale) => ({ kind: "sale" as const, id: `s-${sale.id}`, at: sale.created_at, sale })),
    ...((movements.data ?? []) as MovementRow[]).map((movement) => ({ kind: "movement" as const, id: `m-${movement.id}`, at: movement.created_at, movement })),
  ]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 8);

  return {
    period,
    today,
    stock: stockSummary,
    hasProducts: stockSummary.total_products > 0,
    current: (current.data as PeriodMetrics | null) ?? EMPTY_METRICS,
    previous: (previous.data as PeriodMetrics | null) ?? EMPTY_METRICS,
    daily: (daily.data as DailyPoint[] | null) ?? [],
    topProducts: (top.data as ProductProfitRow[] | null) ?? [],
    byPayment: (summary.data as SalesSummary | null)?.by_payment ?? [],
    replenish: (replenish.data ?? []) as ProductRow[],
    activity,
  };
}
