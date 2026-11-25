import type { AppContext } from "@/lib/auth/session";
import { toCsv, type CsvColumn, type CsvValue } from "@/lib/csv";
import { formatDateTime, localRangeIso } from "@/lib/domain/dates";
import { MOVEMENT_TYPE_LABELS, movementDirection, PAYMENT_METHOD_LABELS, SALE_STATUS_LABELS, STOCK_STATUS_LABELS } from "@/lib/domain/stock";
import type { DailyPoint, MovementRow, ProductProfitRow, ProductRow, SaleRow } from "@/types/db";

const BATCH = 1000;
const MAX_ROWS = 50_000;

/** Lê todas as linhas respeitando o limite de 1000 por requisição do PostgREST. */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += BATCH) {
    const { data, error } = await page(from, from + BATCH - 1);
    if (error) throw new Error("Falha ao ler os dados do relatório.");
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < BATCH) break;
  }
  return out;
}

export const REPORT_KINDS = ["estoque", "movimentacoes", "vendas", "faturamento", "lucratividade", "mais-vendidos"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
export const isReportKind = (v: string | undefined): v is ReportKind => REPORT_KINDS.includes(v as ReportKind);

export const PROFIT_ORDERS = ["lucro", "margem", "quantidade", "faturamento"] as const;
export type ProfitOrder = (typeof PROFIT_ORDERS)[number];
export const isProfitOrder = (v: string | undefined): v is ProfitOrder => PROFIT_ORDERS.includes(v as ProfitOrder);
export const PROFIT_ORDER_SQL: Record<ProfitOrder, string> = { lucro: "profit", margem: "margin", quantidade: "quantity", faturamento: "revenue" };

/** Tipo de coluna: decide a formatação no Excel (o CSV usa o valor cru). */
export type ColumnType = "text" | "int" | "qty" | "money" | "percent";

export interface ReportTable {
  slug: string;
  title: string;
  headers: string[];
  types: ColumnType[];
  rows: CsvValue[][];
}

export function tableToCsv(table: ReportTable): string {
  const columns: CsvColumn<CsvValue[]>[] = table.headers.map((header, i) => ({ header, value: (row) => row[i] }));
  return toCsv(table.rows, columns);
}

/** Arquivo .xlsx de uma aba: cabeçalho em negrito, números e moeda como números de verdade (somáveis no Excel). */
export async function tableToXlsx(table: ReportTable, subtitle: string): Promise<Buffer> {
  const { default: writeExcelFile } = await import("write-excel-file/node");
  const FORMATS: Record<ColumnType, string | undefined> = {
    text: undefined,
    int: "#,##0",
    qty: "#,##0.###",
    money: '"R$" #,##0.00',
    percent: "0.00%",
  };
  const header = table.headers.map((value) => ({ value, fontWeight: "bold" as const, backgroundColor: "#E8EEF6" }));
  const data = table.rows.map((row) =>
    row.map((value, i) => {
      const type = table.types[i];
      if (value === null || value === undefined || value === "") return null;
      if (typeof value === "number") {
        return { value: type === "percent" ? Number((value / 100).toFixed(6)) : value, type: Number, format: FORMATS[type] };
      }
      if (typeof value === "boolean") return { value: value ? "Sim" : "Não", type: String };
      // Texto nunca é interpretado como fórmula.
      return { value: /^[=+\-@\t\r]/.test(value) ? `'${value}` : value, type: String };
    }),
  );
  const sheetData = [[{ value: `${table.title} — ${subtitle}`, fontWeight: "bold" as const }], [], header, ...data];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await writeExcelFile(sheetData as any, { sheet: table.title.slice(0, 28) }).toBuffer()) as Buffer;
}

export async function buildReportTable(
  ctx: AppContext,
  kind: ReportKind,
  from: string,
  to: string,
  order: ProfitOrder = "lucro",
): Promise<ReportTable> {
  const tz = ctx.company.timezone;
  const companyId = ctx.company.id;

  if (kind === "estoque") {
    const rows = await fetchAll<ProductRow>((a, b) =>
      ctx.supabase.from("products_overview").select("*").eq("company_id", companyId).order("name").order("id").range(a, b),
    );
    return {
      slug: "estoque",
      title: "Estoque",
      headers: ["Produto", "SKU", "Código de barras", "Categoria", "Unidade", "Saldo", "Estoque mínimo", "Situação", "Custo unitário", "Preço de venda", "Valor em estoque (custo)"],
      types: ["text", "text", "text", "text", "text", "qty", "qty", "text", "money", "money", "money"],
      rows: rows.map((p) => [
        p.name, p.sku, p.barcode, p.category_name, p.unit, p.stock_quantity, p.min_stock,
        p.is_active ? STOCK_STATUS_LABELS[p.stock_status] : "Inativo", p.cost_price, p.sale_price, p.stock_value,
      ]),
    };
  }

  const { start, endExclusive } = localRangeIso(from, to, tz);

  if (kind === "movimentacoes") {
    const rows = await fetchAll<MovementRow>((a, b) =>
      ctx.supabase.from("stock_movements_detailed").select("*").eq("company_id", companyId)
        .gte("created_at", start).lt("created_at", endExclusive).order("seq", { ascending: false }).range(a, b),
    );
    return {
      slug: "movimentacoes",
      title: "Movimentações",
      headers: ["Data", "Produto", "SKU", "Tipo", "Quantidade", "Unidade", "Saldo anterior", "Saldo posterior", "Motivo", "Venda", "Usuário"],
      types: ["text", "text", "text", "text", "qty", "text", "qty", "qty", "text", "int", "text"],
      rows: rows.map((m) => [
        formatDateTime(m.created_at, tz), m.product_name, m.product_sku, MOVEMENT_TYPE_LABELS[m.type],
        movementDirection(m.type) * m.quantity, m.product_unit, m.balance_before, m.balance_after, m.reason, m.sale_number, m.created_by_name,
      ]),
    };
  }

  if (kind === "vendas") {
    const rows = await fetchAll<SaleRow>((a, b) =>
      ctx.supabase.from("sales_overview").select("*").eq("company_id", companyId)
        .gte("created_at", start).lt("created_at", endExclusive).order("sale_number", { ascending: false }).range(a, b),
    );
    return {
      slug: "vendas",
      title: "Vendas",
      headers: ["Venda", "Data", "Situação", "Cliente", "Pagamento", "Itens", "Subtotal", "Descontos", "Total", "Atendente", "Motivo do cancelamento"],
      types: ["int", "text", "text", "text", "text", "int", "money", "money", "money", "text", "text"],
      rows: rows.map((s) => [
        s.sale_number, formatDateTime(s.created_at, tz), SALE_STATUS_LABELS[s.status], s.customer_name, PAYMENT_METHOD_LABELS[s.payment_method],
        s.items_count, s.subtotal, s.discount_total, s.total, s.created_by_name, s.cancel_reason,
      ]),
    };
  }

  if (kind === "faturamento") {
    const { data, error } = await ctx.supabase.rpc("report_sales_daily", { p_company_id: companyId, p_from: from, p_to: to });
    if (error) throw new Error("Falha ao ler os dados do relatório.");
    const days = (data ?? []) as DailyPoint[];
    return {
      slug: "faturamento",
      title: "Faturamento",
      headers: ["Dia", "Vendas", "Faturamento", "Lucro estimado", "Margem"],
      types: ["text", "int", "money", "money", "percent"],
      rows: days.map((d) => [
        `${d.day.slice(8, 10)}/${d.day.slice(5, 7)}/${d.day.slice(0, 4)}`, d.count, d.revenue, d.profit,
        d.revenue > 0 ? Math.round((d.profit / d.revenue) * 10000) / 100 : null,
      ]),
    };
  }

  // lucratividade / mais vendidos
  const effectiveOrder: ProfitOrder = kind === "mais-vendidos" ? "quantidade" : order;
  const { data, error } = await ctx.supabase.rpc("report_product_profitability", {
    p_company_id: companyId, p_from: from, p_to: to, p_limit: 200, p_order: PROFIT_ORDER_SQL[effectiveOrder],
  });
  if (error) throw new Error("Falha ao ler os dados do relatório.");
  const rows = (data ?? []) as ProductProfitRow[];
  return {
    slug: kind,
    title: kind === "mais-vendidos" ? "Mais vendidos" : "Lucratividade",
    headers: ["Produto", "SKU", "Unidade", "Quantidade vendida", "Faturamento", "Custo das mercadorias", "Lucro estimado", "Margem"],
    types: ["text", "text", "text", "qty", "money", "money", "money", "percent"],
    rows: rows.map((r) => [r.name, r.sku, r.unit, r.quantity, r.revenue, r.cost, r.profit, r.margin_percent]),
  };
}
