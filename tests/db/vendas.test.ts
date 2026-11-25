import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, dbError, dbTestsEnabled, type TestDb } from "./helpers";

const enabled = await dbTestsEnabled();

describe.skipIf(!enabled)("banco: vendas, cancelamento e estorno", () => {
  let db: TestDb;
  let userId: string;
  let companyId: string;
  let categoryId: string;

  type Sale = { id: string; sale_number: string; status: string; subtotal: string; discount_total: string; total: string };

  const makeProduct = async (name: string, price: number, stock: number, opts: { unit?: string; cost?: number; active?: boolean } = {}) => {
    const p = await db.rpc<{ id: string }>(userId, "create_product", [
      companyId, name, categoryId, null, null, null, opts.unit ?? "un", opts.cost ?? price / 2, price, 0, stock, opts.active ?? true, null,
    ]);
    return p.id;
  };

  const sell = (items: unknown[], opts: { method?: string; key?: string | null; customer?: string | null; notes?: string | null; user?: string } = {}) =>
    db.rpc<Sale>(
      opts.user ?? userId,
      "register_sale",
      [companyId, opts.customer ?? null, opts.method ?? "cash", JSON.stringify(items), opts.notes ?? null, opts.key ?? null],
      ["uuid", "uuid", "payment_method", "jsonb", "text", "text"],
    );

  const cancel = (saleId: string, reason: string | null = null, user = userId) =>
    db.rpc<Sale>(user, "cancel_sale", [companyId, saleId, reason]);

  const stockOf = async (productId: string) =>
    Number((await db.admin.query("select stock_quantity from public.products where id = $1", [productId])).rows[0].stock_quantity);

  beforeAll(async () => {
    db = await createTestDb();
    ({ userId, companyId, categoryId } = await db.createCompanyWithOwner("Loja do Bairro"));
  });
  afterAll(async () => {
    await db?.close();
  });

  it("registra venda: calcula totais no servidor, baixa estoque e grava movimentações de saída", async () => {
    const a = await makeProduct("Caderno", 10, 20, { cost: 6 });
    const b = await makeProduct("Lápis", 2.5, 100, { cost: 1 });
    const sale = await sell([
      { product_id: a, quantity: 2 },
      { product_id: b, quantity: 4, discount: 1 },
    ], { method: "pix" });

    expect(Number(sale.subtotal)).toBe(30); // 2*10 + 4*2.5
    expect(Number(sale.discount_total)).toBe(1);
    expect(Number(sale.total)).toBe(29);
    expect(sale.status).toBe("completed");
    expect(await stockOf(a)).toBe(18);
    expect(await stockOf(b)).toBe(96);

    const { rows: movs } = await db.admin.query(
      "select type, quantity, reason, sale_id, balance_before, balance_after from public.stock_movements where sale_id = $1 order by seq",
      [sale.id],
    );
    expect(movs).toHaveLength(2);
    expect(movs.every((m) => m.type === "sale_exit" && m.reason === `Venda #${sale.sale_number}`)).toBe(true);

    const { rows: items } = await db.admin.query(
      "select product_name, quantity, base_price, unit_price, unit_cost, discount, line_total from public.sale_items where sale_id = $1 order by product_name",
      [sale.id],
    );
    expect(items.map((i) => [i.product_name, Number(i.unit_price), Number(i.unit_cost), Number(i.line_total)])).toEqual([
      ["Caderno", 10, 6, 20],
      ["Lápis", 2.5, 1, 9],
    ]);
  });

  it("ignora qualquer preço ou total enviado pelo navegador", async () => {
    const a = await makeProduct("Borracha", 4, 10);
    const sale = await sell([{ product_id: a, quantity: 3, unit_price: 0.01, price: 0.01, total: 0.03, line_total: 0.03 }]);
    expect(Number(sale.total)).toBe(12);
  });

  it("suporta quantidade fracionada em unidades decimais e arredonda por item", async () => {
    const kg = await makeProduct("Queijo (kg)", 33.33, 10, { unit: "kg" });
    const sale = await sell([{ product_id: kg, quantity: 1.5 }]);
    expect(Number(sale.total)).toBe(50); // 1.5 * 33.33 = 49.995 -> 50.00 (arredondamento comercial)
    expect(await stockOf(kg)).toBe(8.5);
  });

  it("numera vendas em sequência por empresa, sem lacunas mesmo após falhas", async () => {
    const p = await makeProduct("Seq", 1, 3);
    const first = await sell([{ product_id: p, quantity: 1 }]);
    await dbError(sell([{ product_id: p, quantity: 99 }])); // falha: não consome número
    const second = await sell([{ product_id: p, quantity: 1 }]);
    expect(Number(second.sale_number)).toBe(Number(first.sale_number) + 1);

    const other = await db.createCompanyWithOwner("Outra Loja");
    const otherProduct = await db.rpc<{ id: string }>(other.userId, "create_product", [other.companyId, "X", other.categoryId, null, null, null, "un", 1, 2, 0, 5, true, null]);
    const otherSale = await db.rpc<Sale>(other.userId, "register_sale", [other.companyId, null, "cash", JSON.stringify([{ product_id: otherProduct.id, quantity: 1 }]), null, null], ["uuid", "uuid", "payment_method", "jsonb", "text", "text"]);
    expect(Number(otherSale.sale_number)).toBe(1);
  });

  it("é atômica: se um item não tem estoque, nada é gravado e nenhum saldo muda", async () => {
    const a = await makeProduct("Atômico A", 5, 10);
    const b = await makeProduct("Atômico B", 5, 1);
    const before = (await db.admin.query("select count(*)::int n from public.sales where company_id = $1", [companyId])).rows[0].n;
    const err = await dbError(sell([{ product_id: a, quantity: 2 }, { product_id: b, quantity: 2 }]));
    expect(err.code).toBe("SG001");
    expect(await stockOf(a)).toBe(10);
    expect(await stockOf(b)).toBe(1);
    const after = (await db.admin.query("select count(*)::int n from public.sales where company_id = $1", [companyId])).rows[0].n;
    expect(after).toBe(before);
  });

  it("rejeita venda sem itens, itens repetidos, quantidades inválidas, produto inativo e desconto maior que o item", async () => {
    const a = await makeProduct("Validação", 5, 10);
    const inactive = await makeProduct("Inativo", 5, 10, { active: false });
    expect((await dbError(sell([]))).code).toBe("SG007");
    expect((await dbError(sell([{ product_id: a, quantity: 1 }, { product_id: a, quantity: 2 }]))).code).toBe("SG005");
    expect((await dbError(sell([{ product_id: a, quantity: 0 }]))).code).toBe("SG005");
    expect((await dbError(sell([{ product_id: a, quantity: -1 }]))).code).toBe("SG005");
    expect((await dbError(sell([{ product_id: a, quantity: 1.5 }]))).code).toBe("SG005");
    expect((await dbError(sell([{ product_id: a, quantity: 1, discount: 6 }]))).code).toBe("SG005");
    expect((await dbError(sell([{ product_id: a, quantity: 1, discount: -1 }]))).code).toBe("SG005");
    expect((await dbError(sell([{ product_id: "não-é-uuid", quantity: 1 }]))).code).toBe("SG005");
    expect((await dbError(sell([{ product_id: inactive, quantity: 1 }]))).code).toBe("SG003");
    expect((await dbError(sell([{ product_id: a, quantity: 1 }], { method: "bitcoin" }))).code).toBe("22P02");
    expect(await stockOf(a)).toBe(10);
  });

  it("venda com cliente opcional: aceita sem cliente e com cliente da própria empresa", async () => {
    const a = await makeProduct("Cliente", 5, 10);
    const { rows } = await db.asUser(userId, (c) =>
      c.query("insert into public.customers (company_id, name, phone) values ($1, 'Maria', '(67) 99999-0000') returning id", [companyId]),
    );
    const withCustomer = await sell([{ product_id: a, quantity: 1 }], { customer: rows[0].id });
    const { rows: ov } = await db.asUser(userId, (c) => c.query("select customer_name, items_count from public.sales_overview where id = $1", [withCustomer.id]));
    expect(ov[0].customer_name).toBe("Maria");
    expect(Number(ov[0].items_count)).toBe(1);
    await expect(sell([{ product_id: a, quantity: 1 }])).resolves.toBeTruthy();
  });

  describe("cancelamento", () => {
    it("estorna o estoque, registra responsável e motivo e mantém o histórico da venda", async () => {
      const a = await makeProduct("Cancelável", 8, 10);
      const b = await makeProduct("Cancelável 2", 3, 10);
      const sale = await sell([{ product_id: a, quantity: 4 }, { product_id: b, quantity: 2 }]);
      expect(await stockOf(a)).toBe(6);

      const cancelled = await db.rpc<Sale & { cancelled_by_name: string; cancel_reason: string }>(userId, "cancel_sale", [companyId, sale.id, "Cliente desistiu"]);
      expect(cancelled.status).toBe("cancelled");
      expect(cancelled.cancelled_by_name).toBe("Dona Teste");
      expect(cancelled.cancel_reason).toBe("Cliente desistiu");
      expect(Number(cancelled.total)).toBe(Number(sale.total)); // histórico financeiro preservado

      expect(await stockOf(a)).toBe(10);
      expect(await stockOf(b)).toBe(10);
      const { rows } = await db.admin.query(
        "select type, quantity, balance_before, balance_after, reason from public.stock_movements where sale_id = $1 and type = 'sale_reversal'",
        [sale.id],
      );
      expect(rows).toHaveLength(2);
      expect(rows[0].reason).toBe(`Estorno da venda #${sale.sale_number}`);
      const { rows: kept } = await db.admin.query("select count(*)::int n from public.sale_items where sale_id = $1", [sale.id]);
      expect(kept[0].n).toBe(2);
    });

    it("bloqueia cancelamento duplicado (sequencial e simultâneo) e estorna uma única vez", async () => {
      const a = await makeProduct("Duplo", 8, 10);
      const sale = await sell([{ product_id: a, quantity: 5 }]);
      await cancel(sale.id);
      expect((await dbError(cancel(sale.id))).code).toBe("SG004");
      expect(await stockOf(a)).toBe(10);

      const sale2 = await sell([{ product_id: a, quantity: 5 }]);
      const results = await Promise.allSettled(Array.from({ length: 5 }, () => cancel(sale2.id, "simultâneo")));
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect((results.filter((r) => r.status === "rejected") as PromiseRejectedResult[]).every((r) => r.reason.code === "SG004")).toBe(true);
      expect(await stockOf(a)).toBe(10);
    });

    it("venda inexistente ou de outra empresa não pode ser cancelada", async () => {
      expect((await dbError(cancel("00000000-0000-0000-0000-000000000000"))).code).toBe("SG006");
    });

    it("estorna mesmo que o produto tenha sido desativado depois da venda", async () => {
      const a = await makeProduct("Desativado depois", 8, 10);
      const sale = await sell([{ product_id: a, quantity: 5 }]);
      await db.asUser(userId, (c) => c.query("update public.products set is_active = false where id = $1", [a]));
      await cancel(sale.id);
      expect(await stockOf(a)).toBe(10);
    });

    it("apenas proprietário/gerente cancelam; funcionário vende mas não cancela", async () => {
      const a = await makeProduct("Permissão", 8, 10);
      const staff = await db.createUser("func@teste.local", { full_name: "Funcionário" });
      await db.admin.query("insert into public.company_members (company_id, user_id, role) values ($1, $2, 'staff')", [companyId, staff]);
      const sale = await sell([{ product_id: a, quantity: 1 }], { user: staff });
      expect(sale.status).toBe("completed");
      expect((await dbError(cancel(sale.id, null, staff))).code).toBe("42501");
      await expect(cancel(sale.id)).resolves.toMatchObject({ status: "cancelled" });
    });
  });

  describe("imutabilidade da venda", () => {
    it("uma venda concluída não pode ser editada nem apagada, nem pelo cliente nem por SQL direto", async () => {
      const a = await makeProduct("Imutável", 8, 10);
      const sale = await sell([{ product_id: a, quantity: 1 }]);
      expect((await dbError(db.asUser(userId, (c) => c.query("update public.sales set total = 1 where id = $1", [sale.id])))).code).toBe("42501");
      expect((await dbError(db.asUser(userId, (c) => c.query("delete from public.sales where id = $1", [sale.id])))).code).toBe("42501");
      expect((await dbError(db.admin.query("update public.sales set total = 0, subtotal = 0 where id = $1", [sale.id]))).code).toBe("SG008");
      expect((await dbError(db.admin.query("delete from public.sales where id = $1", [sale.id]))).code).toBe("SG008");
      expect((await dbError(db.admin.query("update public.sale_items set quantity = 50 where sale_id = $1", [sale.id]))).code).toBe("SG008");
      expect((await dbError(db.admin.query("delete from public.sale_items where sale_id = $1", [sale.id]))).code).toBe("SG008");
      // Uma venda cancelada também é definitiva.
      await cancel(sale.id);
      expect((await dbError(db.admin.query("update public.sales set status = 'completed', cancelled_at = null where id = $1", [sale.id]))).code).toBe("SG004");
    });

    it("coerência: total da venda e total do item são garantidos por restrições", async () => {
      const a = await makeProduct("Restrição", 8, 10);
      const sale = await sell([{ product_id: a, quantity: 1 }]);
      const err = await dbError(
        db.admin.query(
          "insert into public.sale_items (company_id, sale_id, product_id, product_name, unit, quantity, base_price, unit_price, unit_cost, discount, line_total) values ($1,$2,$3,'x','un',1,8,8,4,0,1)",
          [companyId, sale.id, a],
        ),
      );
      expect(err.code).toBe("23514");
    });
  });

  describe("idempotência e concorrência", () => {
    it("repetir o envio da venda (mesma chave) não duplica venda nem baixa de estoque", async () => {
      const a = await makeProduct("Idem venda", 8, 10);
      const key = "venda-chave-0001";
      const s1 = await sell([{ product_id: a, quantity: 2 }], { key });
      const s2 = await sell([{ product_id: a, quantity: 2 }], { key });
      expect(s2.id).toBe(s1.id);
      expect(await stockOf(a)).toBe(8);
    });

    it("envios simultâneos da mesma venda geram apenas uma", async () => {
      const a = await makeProduct("Idem concorrente", 8, 10);
      const key = "venda-chave-0002";
      const results = await Promise.all(Array.from({ length: 6 }, () => sell([{ product_id: a, quantity: 2 }], { key })));
      expect(new Set(results.map((r) => r.id)).size).toBe(1);
      expect(await stockOf(a)).toBe(8);
    });

    it("vendas simultâneas do último estoque: nunca vende além do saldo", async () => {
      const a = await makeProduct("Corrida venda", 8, 5);
      const attempts = await Promise.allSettled(Array.from({ length: 12 }, () => sell([{ product_id: a, quantity: 1 }])));
      const ok = attempts.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<Sale>[];
      expect(ok).toHaveLength(5);
      expect((attempts.filter((r) => r.status === "rejected") as PromiseRejectedResult[]).every((r) => r.reason.code === "SG001")).toBe(true);
      expect(await stockOf(a)).toBe(0);
      const numbers = ok.map((r) => Number(r.value.sale_number)).sort((x, y) => x - y);
      expect(new Set(numbers).size).toBe(5); // números únicos
    });

    it("vendas simultâneas com itens em ordens diferentes não causam deadlock", async () => {
      const a = await makeProduct("Deadlock A", 1, 100);
      const b = await makeProduct("Deadlock B", 1, 100);
      const jobs = Array.from({ length: 10 }, (_, i) =>
        sell(i % 2 === 0 ? [{ product_id: a, quantity: 1 }, { product_id: b, quantity: 1 }] : [{ product_id: b, quantity: 1 }, { product_id: a, quantity: 1 }]),
      );
      const results = await Promise.allSettled(jobs);
      expect(results.every((r) => r.status === "fulfilled")).toBe(true);
      expect(await stockOf(a)).toBe(90);
      expect(await stockOf(b)).toBe(90);
    });
  });

  it("o saldo final sempre bate com a soma das movimentações (cadeia íntegra)", async () => {
    const { rows } = await db.admin.query(`
      select p.id, p.stock_quantity,
             coalesce(sum(case when m.type in ('initial','entry','adjust_in','sale_reversal') then m.quantity else -m.quantity end), 0) as soma
      from public.products p left join public.stock_movements m on m.product_id = p.id
      where p.company_id = $1
      group by p.id, p.stock_quantity`, [companyId]);
    expect(rows.length).toBeGreaterThan(5);
    for (const r of rows) expect(Number(r.stock_quantity)).toBeCloseTo(Number(r.soma), 3);
  });
});
