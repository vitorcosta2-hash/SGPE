import type { AppContext } from "@/lib/auth/session";
import { localRangeIso } from "@/lib/domain/dates";
import { MOVEMENT_GROUPS } from "@/lib/domain/stock";
import { PAGE_SIZE, pageRange } from "@/lib/search";
import type { MovementRow } from "@/types/db";
import { isUuid } from "./queries";

export interface MovementFilters {
  produto?: string;
  grupo?: string;
  from: string;
  to: string;
  page: number;
}

export async function listMovements(ctx: AppContext, f: MovementFilters): Promise<{ rows: MovementRow[]; total: number }> {
  const { start, endExclusive } = localRangeIso(f.from, f.to, ctx.company.timezone);
  let query = ctx.supabase
    .from("stock_movements_detailed")
    .select("*", { count: "exact" })
    .eq("company_id", ctx.company.id)
    .gte("created_at", start)
    .lt("created_at", endExclusive);

  if (isUuid(f.produto)) query = query.eq("product_id", f.produto);
  const group = MOVEMENT_GROUPS.find((g) => g.key === f.grupo);
  if (group) query = query.in("type", group.types);

  const { from, to } = pageRange(f.page, PAGE_SIZE);
  const { data, count } = await query.order("seq", { ascending: false }).range(from, to);
  return { rows: (data ?? []) as MovementRow[], total: count ?? 0 };
}
