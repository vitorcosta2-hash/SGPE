import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, dbError, dbTestsEnabled, type TestDb } from "./helpers";

const enabled = await dbTestsEnabled();

describe.skipIf(!enabled)("banco: promoções e relatórios", () => {
  let db: TestDb;
  let userId: string;
  let companyId: string;
  let categoryId: string;

  const today = async (offsetDays = 0) =>
    (await db.admin.query("select ((now() at time zone co.timezone)::date + $2::int)::text as d from public.companies co where co.id = $1", [companyId, offsetDays])).rows[0].d as string;

  const makeProduct = async (name: string, price: number, stock: number, cost = price / 2) =>
    (await db.rpc<{ id: string }>(userId, "create_product", [companyId, name, categoryId, null, null, null, "un", cost, price, 0, stock, true, null])).id;

  const savePromo = async (
    name: string,
    type: string,
    value: number,
    start: string,
    end: string,
    productIds: string[],
    promotionId: string | null = null,
  ) =>
    db.rpc<{ id: string }>(
      userId,
      "save_promotion",
      [companyId, promotionId, name, type, value, start, end, productIds],
      ["uuid", "uuid", "text", "discount_type", "numeric", "date", "date", "uuid[]"],
    );

  const sell = (items: unknown[]) =>
    db.rpc<{ id: string; total: string }>(userId, "register_sale", [companyId, null, "pix", JSON.stringify(items), null, null], ["uuid", "uuid", "payment_method", "jsonb", "text", "text"]);

  const statusOf = async (promoId: string) =>
    (await db.asUser(userId, (c) => c.query("select status from public.promotions_overview where id = $1", [promoId]))).rows[0].status as string;

  beforeAll(async () => {
    db = await createTestDb();
    ({ userId, companyId, categoryId } = await db.createCompanyWithOwner("Promo & Cia"));
    await db.admin.query("update public.companies set timezone = 'America/Cuiaba' where id = $1", [companyId]);
  });
  afterAll(async () => {
    await db?.close();
  });

  describe("cálculo do preço promocional", () => {
    const price = async (type: string, value: number, base: number) =>
      Number((await db.admin.query("select private.promo_price($1::public.discount_type, $2::numeric, $3::numeric) as p", [type, value, base])).rows[0].p);

    it("percentual, valor de desconto e preço fixo", async () => {
      expect(await price("percentage", 15, 100)).toBe(85);
      expect(await price("percentage", 33.33, 10)).toBe(6.67);
      expect(await price("amount_off", 30, 100)).toBe(70);
      expect(await price("fixed_price", 60, 100)).toBe(60);
    });
    it("nunca fica negativo nem acima do preço base", async () => {
      expect(await price("amount_off", 500, 100)).toBe(0);
      expect(await price("fixed_price", 150, 100)).toBe(100);
    });
  });

  describe("cadastro e validação", () => {
    it("valida período, produtos e valores", async () => {
      const p = await makeProduct("Validação promo", 10, 5);
      const d0 = await today();
      const d1 = await today(1);
      expect((await dbError(savePromo("X", "percentage", 10, d1, d0, [p]))).code).toBe("SG005"); // término antes do início
      expect((await dbError(savePromo("X", "percentage", 10, d0, d1, []))).code).toBe("SG005"); // sem produtos
      expect((await dbError(savePromo("X", "percentage", 100, d0, d1, [p]))).code).toBe("23514"); // 100% não permitido
      expect((await dbError(savePromo("X", "percentage", 0, d0, d1, [p]))).code).toBe("23514");
      expect((await dbError(savePromo("   ", "percentage", 10, d0, d1, [p]))).code).toBe("23514");
      expect((await dbError(savePromo("X", "percentage", 10, d0, d1, ["00000000-0000-0000-0000-000000000000"]))).code).toBe("SG006");
    });

    it("identifica promoções agendadas, ativas e encerradas (pelo fuso da empresa)", async () => {
      const p = await makeProduct("Status promo", 10, 5);
      const [m2, m1, d0, p1, p2] = await Promise.all([today(-2), today(-1), today(0), today(1), today(2)]);
      const scheduled = await savePromo("Futura", "percentage", 10, p1, p2, [p]);
      const active = await savePromo("Hoje", "percentage", 10, d0, p1, [p]);
      const past = await db.admin.query(
        "insert into public.promotions (company_id, name, discount_type, discount_value, starts_on, ends_on) values ($1,'Passada','percentage',10,$2,$3) returning id",
        [companyId, m2, m1],
      );
      expect(await statusOf(scheduled.id)).toBe("scheduled");
      expect(await statusOf(active.id)).toBe("active");
      expect(await statusOf(past.rows[0].id)).toBe("ended");
    });

    it("editar substitui os produtos vinculados; promoções encerradas não podem ser editadas", async () => {
      const a = await makeProduct("Edita A", 10, 5);
      const b = await makeProduct("Edita B", 10, 5);
      const d0 = await today();
      const d3 = await today(3);
      const promo = await savePromo("Editável", "percentage", 10, d0, d3, [a]);
      await savePromo("Editável v2", "amount_off", 2, d0, d3, [b], promo.id);
      const { rows } = await db.asUser(userId, (c) => c.query("select product_id from public.promotion_products_detailed where promotion_id = $1", [promo.id]));
      expect(rows.map((r) => r.product_id)).toEqual([b]);

      await db.rpc(userId, "end_promotion", [companyId, promo.id]);
      expect((await dbError(savePromo("Tentativa", "percentage", 5, d0, d3, [b], promo.id))).code).toBe("SG005");
    });

    it("encerrar é idempotente e muda o status para encerrada", async () => {
      const a = await makeProduct("Encerra", 10, 5);
      const promo = await savePromo("Para encerrar", "percentage", 10, await today(), await today(5), [a]);
      expect(await statusOf(promo.id)).toBe("active");
      const e1 = await db.rpc<{ ended_at: string }>(userId, "end_promotion", [companyId, promo.id]);
      const e2 = await db.rpc<{ ended_at: string }>(userId, "end_promotion", [companyId, promo.id]);
      expect(e2.ended_at).toEqual(e1.ended_at);
      expect(await statusOf(promo.id)).toBe("ended");
    });

    it("a promoção não altera o preço-base do produto", async () => {
      const a = await makeProduct("Base intacta", 100, 5);
      await savePromo("20% off", "percentage", 20, await today(), await today(2), [a]);
      const { rows } = await db.asUser(userId, (c) => c.query("select sale_price, effective_price, promotion_name from public.products_overview where id = $1", [a]));
      expect(Number(rows[0].sale_price)).toBe(100);
      expect(Number(rows[0].effective_price)).toBe(80);
      expect(rows[0].promotion_name).toBe("20% off");
    });
  });

  describe("promoções na venda", () => {
    it("aplica o preço promocional vigente e guarda preço base e promoção no item", async () => {
      const a = await makeProduct("Venda promo", 100, 10);
      const promo = await savePromo("Semana", "percentage", 25, await today(), await today(3), [a]);
      const sale = await sell([{ product_id: a, quantity: 2 }]);
      expect(Number(sale.total)).toBe(150);
      const { rows } = await db.admin.query("select base_price, unit_price, promotion_id from public.sale_items where sale_id = $1", [sale.id]);
      expect(Number(rows[0].base_price)).toBe(100);
      expect(Number(rows[0].unit_price)).toBe(75);
      expect(rows[0].promotion_id).toBe(promo.id);
    });

    it("escolhe a melhor promoção quando há sobreposição e ignora promoções futuras/encerradas", async () => {
      const a = await makeProduct("Sobreposição", 100, 10);
      await savePromo("10%", "percentage", 10, await today(), await today(3), [a]);
      await savePromo("R$ 30 off", "amount_off", 30, await today(), await today(3), [a]);
      await savePromo("Futura 90%", "percentage", 90, await today(1), await today(3), [a]);
      const encerrada = await savePromo("Encerrada 80%", "percentage", 80, await today(), await today(3), [a]);
      await db.rpc(userId, "end_promotion", [companyId, encerrada.id]);
      expect(Number((await sell([{ product_id: a, quantity: 1 }])).total)).toBe(70);
    });

    it("depois de encerrada, a venda volta ao preço normal", async () => {
      const a = await makeProduct("Volta", 50, 10);
      const promo = await savePromo("Relâmpago", "fixed_price", 30, await today(), await today(1), [a]);
      expect(Number((await sell([{ product_id: a, quantity: 1 }])).total)).toBe(30);
      await db.rpc(userId, "end_promotion", [companyId, promo.id]);
      expect(Number((await sell([{ product_id: a, quantity: 1 }])).total)).toBe(50);
    });

    it("desconto manual soma-se ao preço promocional", async () => {
      const a = await makeProduct("Soma", 100, 10);
      await savePromo("10% soma", "percentage", 10, await today(), await today(1), [a]);
      const sale = await sell([{ product_id: a, quantity: 1, discount: 5 }]);
      expect(Number(sale.total)).toBe(85);
    });
  });

  describe("relatórios", () => {
    let c2: { userId: string; companyId: string; categoryId: string };
    let p1: string;
    let p2: string;

    const insertSale = async (cid: string, number: number, createdAt: string, total: number, method: string, status: "completed" | "cancelled", productId: string, name: string, qty: number) => {
      const s = await db.admin.query(
        `insert into public.sales (company_id, sale_number, payment_method, status, subtotal, discount_total, total, created_at, cancelled_at)
         values ($1, $2, $3::public.payment_method, $4::public.sale_status, $5::numeric, 0, $5::numeric, $6::timestamptz,
                 case when $4::public.sale_status = 'cancelled' then $6::timestamptz else null end) returning id`,
        [cid, number, method, status, total, createdAt],
      );
      await db.admin.query(
        `insert into public.sale_items (company_id, sale_id, product_id, product_name, unit, quantity, base_price, unit_price, unit_cost, discount, line_total)
         values ($1,$2,$3,$4,'un',$5,$6,$6,1,0,$7)`,
        [cid, s.rows[0].id, productId, name, qty, total / qty, total],
      );
    };

    beforeAll(async () => {
      p1 = await makeProduct("Relatório A", 10, 100);
      p2 = await makeProduct("Relatório B", 20, 100);
      // Empresa 'Cuiabá' (UTC-4). 2026-03-10T02:30Z = 09/03 22:30 local.
      await insertSale(companyId, 9001, "2026-03-09T15:00:00Z", 100, "pix", "completed", p1, "Relatório A", 10);
      await insertSale(companyId, 9002, "2026-03-10T02:30:00Z", 40, "cash", "completed", p2, "Relatório B", 2);
      await insertSale(companyId, 9003, "2026-03-10T15:00:00Z", 60, "pix", "completed", p1, "Relatório A", 6);
      await insertSale(companyId, 9004, "2026-03-10T16:00:00Z", 999, "credit_card", "cancelled", p2, "Relatório B", 1);
      c2 = await db.createCompanyWithOwner("Outra empresa");
      const other = await db.rpc<{ id: string }>(c2.userId, "create_product", [c2.companyId, "Alheio", c2.categoryId, null, null, null, "un", 1, 2, 0, 5, true, null]);
      await insertSale(c2.companyId, 1, "2026-03-10T15:00:00Z", 5000, "pix", "completed", other.id, "Alheio", 1);
    });

    const summary = (from: string, to: string, as = userId, company = companyId) =>
      db.asUser(as, async (c) => (await c.query("select public.report_sales_summary($1, $2, $3) as r", [company, from, to])).rows[0].r);

    it("totaliza o período, separa vendas canceladas e respeita o fuso da empresa", async () => {
      const day9 = await summary("2026-03-09", "2026-03-09");
      expect(day9.completed_count).toBe(2); // inclui a venda das 22:30 locais (02:30Z do dia 10)
      expect(Number(day9.completed_total)).toBe(140);

      const day10 = await summary("2026-03-10", "2026-03-10");
      expect(day10.completed_count).toBe(1);
      expect(Number(day10.completed_total)).toBe(60);
      expect(day10.cancelled_count).toBe(1);
      expect(Number(day10.cancelled_total)).toBe(999);

      const all = await summary("2026-03-09", "2026-03-10");
      expect(all.completed_count).toBe(3);
      expect(Number(all.completed_total)).toBe(200);
    });

    it("agrupa por forma de pagamento (somente vendas concluídas)", async () => {
      const all = await summary("2026-03-09", "2026-03-10");
      const by = Object.fromEntries(all.by_payment.map((m: { method: string; total: string; count: number }) => [m.method, [m.count, Number(m.total)]]));
      expect(by).toEqual({ pix: [2, 160], cash: [1, 40] });
    });

    it("lista os produtos mais vendidos sem contar vendas canceladas", async () => {
      const all = await summary("2026-03-09", "2026-03-10");
      expect(all.top_products.map((p: { name: string; quantity: string }) => [p.name, Number(p.quantity)])).toEqual([
        ["Relatório A", 16],
        ["Relatório B", 2],
      ]);
    });

    it("não vaza dados de outra empresa nos relatórios", async () => {
      const other = await summary("2026-03-09", "2026-03-10", c2.userId, c2.companyId);
      expect(Number(other.completed_total)).toBe(5000);
      const leaked = await summary("2026-03-09", "2026-03-10", c2.userId, companyId);
      expect(leaked.completed_count).toBe(0);
      expect(Number(leaked.completed_total)).toBe(0);
    });

    it("resumo do estoque: contagens e valor estimado pelo custo", async () => {
      const company = await db.createCompanyWithOwner("Estoque report");
      const mk = (name: string, cost: number, stock: number, min: number, active = true) =>
        db.rpc(company.userId, "create_product", [company.companyId, name, company.categoryId, null, null, null, "un", cost, cost * 2, min, stock, active, null]);
      await mk("Normal", 10, 10, 2); // valor 100
      await mk("Baixo", 5, 2, 2);    // valor 10
      await mk("Zerado", 7, 0, 3);   // valor 0
      await mk("Inativo", 4, 5, 1, false); // valor 20, não conta nos alertas
      const r = await db.asUser(company.userId, async (c) => (await c.query("select public.report_stock_summary($1) as r", [company.companyId])).rows[0].r);
      expect(r).toMatchObject({ total_products: 4, active_products: 3, low_stock: 1, out_of_stock: 1 });
      expect(Number(r.stock_value)).toBe(130);
    });

    it("resumo de movimentações por tipo e produto, dentro do período", async () => {
      const company = await db.createCompanyWithOwner("Mov report");
      const mk = async (name: string) =>
        (await db.rpc<{ id: string }>(company.userId, "create_product", [company.companyId, name, company.categoryId, null, null, null, "un", 1, 2, 0, 10, true, null])).id;
      const a = await mk("Mov A");
      const b = await mk("Mov B");
      const mv = (pid: string, type: string, qty: number, reason: string | null) =>
        db.rpc(company.userId, "register_stock_movement", [company.companyId, pid, type, qty, reason, null], ["uuid", "uuid", "stock_movement_type", "numeric", "text", "text"]);
      await mv(a, "entry", 5, null);
      await mv(a, "manual_exit", 2, "quebra");
      await mv(b, "adjust_in", 1, "contagem");
      const d = (await db.admin.query("select (now() at time zone 'America/Sao_Paulo')::date::text as d")).rows[0].d;
      const run = (product: string | null, from = d, to = d) =>
        db.asUser(company.userId, async (c) => (await c.query("select public.report_movements_summary($1,$2,$3,$4) as r", [company.companyId, from, to, product])).rows[0].r);
      const all = Object.fromEntries((await run(null)).map((x: { type: string; count: number; quantity: string }) => [x.type, [x.count, Number(x.quantity)]]));
      expect(all).toEqual({ initial: [2, 20], entry: [1, 5], manual_exit: [1, 2], adjust_in: [1, 1] });
      const onlyA = Object.fromEntries((await run(a)).map((x: { type: string; count: number }) => [x.type, x.count]));
      expect(onlyA).toEqual({ initial: 1, entry: 1, manual_exit: 1 });
      expect(await run(null, "2020-01-01", "2020-01-02")).toEqual([]);
    });
  });
});
