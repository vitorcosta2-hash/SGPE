import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, dbError, dbTestsEnabled, type TestDb } from "./helpers";

const enabled = await dbTestsEnabled();

describe.skipIf(!enabled)("banco: indicadores gerenciais (lucro, série diária, lucratividade)", () => {
  let db: TestDb;
  let userId: string;
  let companyId: string;
  let categoryId: string;
  let otherUser: string;
  let otherCompany: string;
  let caderno: string;
  let lapis: string;
  const today = new Date().toISOString().slice(0, 10);

  const makeProduct = async (name: string, price: number, cost: number, stock: number) =>
    (
      await db.rpc<{ id: string }>(userId, "create_product", [
        companyId, name, categoryId, null, null, null, "un", cost, price, 0, stock, true, null,
      ])
    ).id;

  const sell = (items: unknown[]) =>
    db.rpc<{ id: string }>(
      userId,
      "register_sale",
      [companyId, null, "pix", JSON.stringify(items), null, null],
      ["uuid", "uuid", "payment_method", "jsonb", "text", "text"],
    );

  const metrics = async (from = today, to = today) =>
    (await db.rpc<{ report_period_metrics: Record<string, number | null> }>(userId, "report_period_metrics", [companyId, from, to], ["uuid", "date", "date"]))
      .report_period_metrics;

  beforeAll(async () => {
    db = await createTestDb();
    ({ userId, companyId, categoryId } = await db.createCompanyWithOwner("Loja Analítica"));
    ({ userId: otherUser, companyId: otherCompany } = await db.createCompanyWithOwner("Outra Loja"));
    // Fuso fixo para o teste ficar determinístico no dia "de hoje" da empresa.
    await db.admin.query("update public.companies set timezone = 'UTC' where id = any($1)", [[companyId, otherCompany]]);
    caderno = await makeProduct("Caderno", 10, 6, 100);
    lapis = await makeProduct("Lápis", 2.5, 1, 100);
  });
  afterAll(async () => {
    await db?.close();
  });

  it("sem vendas: zeros e margem nula (nunca divide por zero)", async () => {
    const m = await metrics();
    expect(m).toMatchObject({ sales_count: 0, revenue: 0, cost: 0, profit: 0, avg_ticket: 0, units_sold: 0 });
    expect(m.margin_percent).toBeNull();
  });

  it("calcula receita, custo, lucro e margem a partir do custo gravado na venda", async () => {
    // Venda 1: 2 cadernos (receita 20, custo 12) + 4 lápis com R$ 1 de desconto (receita 9, custo 4)
    await sell([
      { product_id: caderno, quantity: 2 },
      { product_id: lapis, quantity: 4, discount: 1 },
    ]);
    // Venda 2: 1 caderno (receita 10, custo 6)
    await sell([{ product_id: caderno, quantity: 1 }]);

    const m = await metrics();
    expect(m.sales_count).toBe(2);
    expect(m.revenue).toBe(39); // 20 + 9 + 10
    expect(m.cost).toBe(22); // 12 + 4 + 6
    expect(m.profit).toBe(17);
    expect(m.margin_percent).toBe(43.59); // 17 / 39
    expect(m.avg_ticket).toBe(19.5);
    expect(m.units_sold).toBe(7);
    expect(m.discounts).toBe(1);
  });

  it("alterar o custo do produto depois não reescreve o lucro das vendas passadas", async () => {
    await db.admin.query("update public.products set cost_price = 9 where id = $1", [caderno]);
    expect((await metrics()).profit).toBe(17);
  });

  it("vendas canceladas saem de todos os valores", async () => {
    const sale = await sell([{ product_id: lapis, quantity: 10 }]); // receita 25, custo 10
    expect((await metrics()).revenue).toBe(64);
    await db.rpc(userId, "cancel_sale", [companyId, sale.id, "teste"]);
    const m = await metrics();
    expect(m.revenue).toBe(39);
    expect(m.profit).toBe(17);
    expect(m.cancelled_count).toBe(1);
  });

  it("série diária cobre todos os dias do intervalo, inclusive os sem venda", async () => {
    const from = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
    const { report_sales_daily: series } = await db.rpc<{ report_sales_daily: { day: string; count: number; revenue: number; profit: number }[] }>(
      userId, "report_sales_daily", [companyId, from, today], ["uuid", "date", "date"],
    );
    expect(series).toHaveLength(4);
    expect(series.slice(0, 3).every((d) => d.count === 0 && d.revenue === 0 && d.profit === 0)).toBe(true);
    expect(series[3]).toMatchObject({ day: today, count: 2, revenue: 39, profit: 17 });
  });

  it("lucratividade por produto ordena por quantidade, lucro e margem", async () => {
    const call = async (order: string) =>
      (await db.rpc<{ report_product_profitability: { name: string; quantity: number; revenue: number; cost: number; profit: number; margin_percent: number }[] }>(
        userId, "report_product_profitability", [companyId, today, today, 10, order], ["uuid", "date", "date", "integer", "text"],
      )).report_product_profitability;

    const byQty = await call("quantity");
    expect(byQty.map((p) => p.name)).toEqual(["Lápis", "Caderno"]); // 4 un > 3 un
    expect(byQty[1]).toMatchObject({ quantity: 3, revenue: 30, cost: 18, profit: 12, margin_percent: 40 });
    expect(byQty[0]).toMatchObject({ quantity: 4, revenue: 9, cost: 4, profit: 5, margin_percent: 55.56 });

    expect((await call("profit")).map((p) => p.name)).toEqual(["Caderno", "Lápis"]);
    expect((await call("margin")).map((p) => p.name)).toEqual(["Lápis", "Caderno"]);
    expect((await call("revenue")).map((p) => p.name)).toEqual(["Caderno", "Lápis"]);
  });

  it("rejeita ordenação inválida e períodos absurdos", async () => {
    const badOrder = await dbError(
      db.rpc(userId, "report_product_profitability", [companyId, today, today, 10, "x; drop table"], ["uuid", "date", "date", "integer", "text"]),
    );
    expect(badOrder.code).toBe("SG005");
    const badRange = await dbError(db.rpc(userId, "report_period_metrics", [companyId, "2020-01-01", today], ["uuid", "date", "date"]));
    expect(badRange.code).toBe("SG005");
    const inverted = await dbError(db.rpc(userId, "report_sales_daily", [companyId, today, "2020-01-01"], ["uuid", "date", "date"]));
    expect(inverted.code).toBe("SG005");
  });

  it("isolamento: outra empresa não enxerga nem soma as vendas", async () => {
    const mine = await db.rpc<{ report_period_metrics: { revenue: number } }>(otherUser, "report_period_metrics", [companyId, today, today], ["uuid", "date", "date"]);
    expect(mine.report_period_metrics.revenue).toBe(0);
    const own = await db.rpc<{ report_period_metrics: { revenue: number } }>(otherUser, "report_period_metrics", [otherCompany, today, today], ["uuid", "date", "date"]);
    expect(own.report_period_metrics.revenue).toBe(0);
  });

  it("usuário anônimo não executa as funções", async () => {
    const err = await dbError(
      db.asAnon(async (c) => c.query("select public.report_period_metrics($1, $2, $3)", [companyId, today, today])),
    );
    expect(err.code).toBe("42501");
  });
});

describe.skipIf(!enabled)("banco: resultado real de uma promoção", () => {
  let db: TestDb;
  let userId: string;
  let companyId: string;
  let categoryId: string;
  let other: { userId: string; companyId: string };

  beforeAll(async () => {
    db = await createTestDb();
    ({ userId, companyId, categoryId } = await db.createCompanyWithOwner("Loja Promo"));
    other = await db.createCompanyWithOwner("Outra Promo");
  });
  afterAll(async () => {
    await db?.close();
  });

  it("soma só vendas concluídas feitas com a promoção e calcula lucro e desconto concedido", async () => {
    const p = (
      await db.rpc<{ id: string }>(userId, "create_product", [companyId, "Tênis", categoryId, null, null, null, "un", 100, 200, 0, 50, true, null])
    ).id;
    const q = (
      await db.rpc<{ id: string }>(userId, "create_product", [companyId, "Meia", categoryId, null, null, null, "un", 5, 10, 0, 50, true, null])
    ).id;
    // Promoção de 25% só no tênis, vigente hoje.
    const promo = await db.rpc<{ id: string }>(
      userId, "save_promotion",
      [companyId, null, "Queima", "percentage", 25, "2000-01-01", "2999-12-31", [p]],
      ["uuid", "uuid", "text", "discount_type", "numeric", "date", "date", "uuid[]"],
    );
    const promoId = promo.id;
    const sell = (items: unknown[]) =>
      db.rpc<{ id: string }>(userId, "register_sale", [companyId, null, "pix", JSON.stringify(items), null, null], ["uuid", "uuid", "payment_method", "jsonb", "text", "text"]);

    await sell([{ product_id: p, quantity: 2 }, { product_id: q, quantity: 3 }]); // tênis a 150 (promo) + meias sem promo
    const cancelled = await sell([{ product_id: p, quantity: 5 }]);
    await db.rpc(userId, "cancel_sale", [companyId, cancelled.id, "teste"]);

    const r = (await db.rpc<{ report_promotion_results: Record<string, unknown> }>(userId, "report_promotion_results", [companyId, promoId], ["uuid", "uuid"])).report_promotion_results;
    expect(r).toMatchObject({ sales_count: 1, units: 2, revenue: 300, cost: 200, profit: 100, discount_given: 100 });
    expect(r.by_product).toEqual([expect.objectContaining({ name: "Tênis", quantity: 2, revenue: 300, profit: 100 })]);
  });

  it("promoção sem vendas devolve zeros; outra empresa não enxerga nada", async () => {
    const empty = (await db.rpc<{ report_promotion_results: Record<string, unknown> }>(userId, "report_promotion_results", [companyId, "00000000-0000-0000-0000-000000000000"], ["uuid", "uuid"])).report_promotion_results;
    expect(empty).toMatchObject({ sales_count: 0, units: 0, revenue: 0, profit: 0, by_product: [] });
    const { rows } = await db.admin.query("select id from public.promotions where company_id = $1", [companyId]);
    const spied = (await db.rpc<{ report_promotion_results: Record<string, unknown> }>(other.userId, "report_promotion_results", [companyId, rows[0].id], ["uuid", "uuid"])).report_promotion_results;
    expect(spied).toMatchObject({ sales_count: 0, units: 0, revenue: 0 });
  });
});
