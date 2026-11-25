import { NextResponse } from "next/server";
import { getNotifications } from "@/features/notificacoes/queries";
import { getAppContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getAppContext();
  if (!ctx || ctx === "no-company") return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  try {
    return NextResponse.json({ items: await getNotifications(ctx) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Não foi possível carregar os avisos." }, { status: 500 });
  }
}
