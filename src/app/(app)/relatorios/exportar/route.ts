import { NextResponse, type NextRequest } from "next/server";
import { buildReportTable, isProfitOrder, isReportKind, tableToCsv, tableToXlsx } from "@/features/relatorios/export";
import { getAppContext } from "@/lib/auth/session";
import { formatIsoDate, resolveDateRange, todayInTimezone } from "@/lib/domain/dates";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const ctx = await getAppContext();
  if (!ctx || ctx === "no-company") return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const tipo = sp.get("tipo") ?? undefined;
  if (!isReportKind(tipo)) return NextResponse.json({ error: "Tipo de relatório inválido." }, { status: 400 });
  const formato = sp.get("formato") === "xlsx" ? "xlsx" : "csv";
  const ordem = sp.get("ordem") ?? undefined;

  const range = resolveDateRange(sp.get("de") ?? undefined, sp.get("ate") ?? undefined, todayInTimezone(ctx.company.timezone));
  try {
    const table = await buildReportTable(ctx, tipo, range.from, range.to, isProfitOrder(ordem) ? ordem : "lucro");
    const name = tipo === "estoque" ? "estoque" : `${tipo}_${range.from}_a_${range.to}`;
    const headers = { "Cache-Control": "no-store", "Content-Disposition": `attachment; filename="sgpe_${name}.${formato}"` };
    if (formato === "xlsx") {
      const subtitle = tipo === "estoque" ? ctx.company.name : `${ctx.company.name} · ${formatIsoDate(range.from)} a ${formatIsoDate(range.to)}`;
      const buffer = await tableToXlsx(table, subtitle);
      return new NextResponse(new Uint8Array(buffer), {
        headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      });
    }
    return new NextResponse(tableToCsv(table), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
  } catch {
    return NextResponse.json({ error: "Não foi possível gerar o relatório." }, { status: 500 });
  }
}
