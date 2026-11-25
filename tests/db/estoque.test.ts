import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, dbError, dbTestsEnabled, type TestDb } from "./helpers";

const enabled = await dbTestsEnabled();

describe.skipIf(!enabled)("banco: produtos, categorias e estoque", () => {
  let db: TestDb;
  let userId: string;
  let companyId: string;
  let categoryId: string;

  const newProduct = (overrides: Record<string, unknown> = {}) => {
    const p = {
      name: "Arroz 5kg",
      sku: null,
      barcode: null,
      unit: "un",
      cost: 18.5,
      price: 25.9,
      min: 5,
      initial: 0,
      ...overrides,
    };
    return db.rpc<{ id: string; stock_quantity: string }>(
      userId,
      "create_product",
      [companyId, p.name, categoryId, p.sku, p.barcode, null, p.unit, p.cost, p.price, p.min, p.initial, true, null],
    );
  };

  const movement = (productId: string, type: string, qty: number, reason: string | null = null, key: string | null = null) =>
    db.rpc<{ id: string; balance_before: string; balance_after: string; quantity: string }>(
      userId,
      "register_stock_movement",
      [companyId, productId, type, qty, reason, key],
      ["uuid", "uuid", "stock_movement_type", "numeric", "text", "text"],
    );

  const stockOf = async (productId: string) => {
    const { rows } = await db.admin.query("select stock_quantity from public.products where id = $1", [productId]);
    return Number(rows[0].stock_quantity);
  };

  beforeAll(async () => {
    db = await createTestDb();
    ({ userId, companyId, categoryId } = await db.createCompanyWithOwner("Mercearia do Zé"));
  });
  afterAll(async () => {
    await db?.close();
  });

  it("cadastro cria perfil, empresa, vínculo de proprietário e categoria padrão", async () => {
    const { rows: members } = await db.admin.query("select role from public.company_members where user_id = $1", [userId]);
    expect(members).toEqual([{ role: "owner" }]);
    const { rows: cats } = await db.admin.query("select name from public.categories where company_id = $1", [companyId]);
    expect(cats).toEqual([{ name: "Geral" }]);
    const { rows: prof } = await db.admin.query("select full_name from public.profiles where id = $1", [userId]);
    expect(prof[0].full_name).toBe("Dona Teste");
  });

  it("cadastra produto com estoque inicial rastreável", async () => {
    const product = await newProduct({ name: "Feijão 1kg", initial: 12 });
    expect(Number(product.stock_quantity)).toBe(12);
    const { rows } = await db.admin.query(
      "select type, quantity, balance_before, balance_after, reason, created_by_name from public.stock_movements where product_id = $1",
      [product.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "initial", reason: "Estoque inicial", created_by_name: "Dona Teste" });
    expect(Number(rows[0].balance_before)).toBe(0);
    expect(Number(rows[0].balance_after)).toBe(12);
  });

  it("impede SKU e código de barras duplicados na mesma empresa (sem diferenciar maiúsculas)", async () => {
    await newProduct({ name: "Sabão", sku: "SAB-01", barcode: "7890001" });
    expect((await dbError(newProduct({ name: "Sabão 2", sku: "sab-01 " }))).code).toBe("23505");
    expect((await dbError(newProduct({ name: "Sabão 3", barcode: "7890001" }))).code).toBe("23505");
  });

  it("valida preços, nomes e unidades", async () => {
    expect((await dbError(newProduct({ name: "   " }))).code).toBe("23514");
    expect((await dbError(newProduct({ name: "X", price: -1 }))).code).toBe("23514");
    expect((await dbError(newProduct({ name: "X", cost: -0.01 }))).code).toBe("23514");
    expect((await dbError(newProduct({ name: "X", unit: "xx" }))).code).toBe("23514");
    expect((await dbError(newProduct({ name: "X", initial: -3 }))).code).toBe("SG005");
  });

  it("edita produto, mas o saldo não pode ser gravado diretamente", async () => {
    const product = await newProduct({ name: "Café 500g", initial: 4 });
    await db.asUser(userId, async (c) => {
      const r = await c.query("update public.products set name = 'Café Torrado 500g', sale_price = 19.9 where id = $1", [product.id]);
      expect(r.rowCount).toBe(1);
    });
    const err = await dbError(
      db.asUser(userId, (c) => c.query("update public.products set stock_quantity = 999 where id = $1", [product.id])),
    );
    expect(err.code).toBe("42501");
    expect(await stockOf(product.id)).toBe(4);
  });

  it("não permite inserir produto diretamente (somente pela função) nem mudar company_id", async () => {
    const err = await dbError(
      db.asUser(userId, (c) =>
        c.query(
          "insert into public.products (company_id, category_id, name, stock_quantity) values ($1, $2, 'Hack', 100)",
          [companyId, categoryId],
        ),
      ),
    );
    expect(err.code).toBe("42501");
    const err2 = await dbError(
      db.asUser(userId, (c) => c.query("update public.products set company_id = gen_random_uuid() where company_id = $1", [companyId])),
    );
    expect(err2.code).toBe("42501");
  });

  it("entrada e saída atualizam o saldo e registram saldo anterior/posterior", async () => {
    const product = await newProduct({ name: "Leite", initial: 10 });
    const entry = await movement(product.id, "entry", 5, "Compra fornecedor");
    expect(Number(entry.balance_before)).toBe(10);
    expect(Number(entry.balance_after)).toBe(15);
    const exit = await movement(product.id, "manual_exit", 3, "Quebra");
    expect(Number(exit.balance_before)).toBe(15);
    expect(Number(exit.balance_after)).toBe(12);
    expect(await stockOf(product.id)).toBe(12);
  });

  it("bloqueia saída maior que o saldo e não altera nada", async () => {
    const product = await newProduct({ name: "Óleo", initial: 3 });
    const err = await dbError(movement(product.id, "manual_exit", 4, "Teste"));
    expect(err.code).toBe("SG001");
    expect(err.detail).toContain("Óleo|3.000|4");
    expect(await stockOf(product.id)).toBe(3);
    const { rows } = await db.admin.query("select count(*)::int as n from public.stock_movements where product_id = $1", [product.id]);
    expect(rows[0].n).toBe(1); // somente o estoque inicial
  });

  it("exige motivo para saída manual e ajustes, e aceita entrada sem motivo", async () => {
    const product = await newProduct({ name: "Açúcar", initial: 10 });
    expect((await dbError(movement(product.id, "manual_exit", 1))).code).toBe("SG005");
    expect((await dbError(movement(product.id, "adjust_out", 1, "ok"))).code).toBe("SG005");
    await expect(movement(product.id, "entry", 1)).resolves.toBeTruthy();
  });

  it("não permite registrar manualmente tipos reservados (venda, estorno, inicial)", async () => {
    const product = await newProduct({ name: "Sal", initial: 10 });
    for (const t of ["sale_exit", "sale_reversal", "initial"]) {
      expect((await dbError(movement(product.id, t, 1, "tentativa"))).code).toBe("SG005");
    }
  });

  it("valida quantidade: zero, negativa, fracionada em unidade inteira e casas decimais", async () => {
    const unit = await newProduct({ name: "Caneta", unit: "un", initial: 10 });
    const kg = await newProduct({ name: "Farinha a granel", unit: "kg", initial: 10 });
    expect((await dbError(movement(unit.id, "entry", 0))).code).toBe("SG005");
    expect((await dbError(movement(unit.id, "entry", -2))).code).toBe("SG005");
    expect((await dbError(movement(unit.id, "entry", 1.5))).code).toBe("SG005");
    expect((await dbError(movement(kg.id, "entry", 1.2345))).code).toBe("SG005");
    const ok = await movement(kg.id, "entry", 1.25);
    expect(Number(ok.balance_after)).toBe(11.25);
  });

  it("contagem de inventário calcula a diferença no banco (ajuste positivo e negativo)", async () => {
    const product = await newProduct({ name: "Vela", initial: 10 });
    const up = await db.rpc<{ type: string; quantity: string; balance_after: string }>(userId, "register_inventory_count", [companyId, product.id, 14, "Contagem mensal", null]);
    expect(up).toMatchObject({ type: "adjust_in" });
    expect(Number(up.quantity)).toBe(4);
    const down = await db.rpc<{ type: string; quantity: string; balance_after: string }>(userId, "register_inventory_count", [companyId, product.id, 9, null, null]);
    expect(down).toMatchObject({ type: "adjust_out" });
    expect(Number(down.balance_after)).toBe(9);
    expect((await dbError(db.rpc(userId, "register_inventory_count", [companyId, product.id, 9, null, null]))).code).toBe("SG005");
  });

  it("histórico é imutável: nem o cliente nem um UPDATE/DELETE administrativo alteram movimentações", async () => {
    const product = await newProduct({ name: "Imutável", initial: 5 });
    const mov = await movement(product.id, "entry", 1);
    const e1 = await dbError(db.asUser(userId, (c) => c.query("update public.stock_movements set quantity = 99 where id = $1", [mov.id])));
    expect(e1.code).toBe("42501");
    const e2 = await dbError(db.asUser(userId, (c) => c.query("delete from public.stock_movements where id = $1", [mov.id])));
    expect(e2.code).toBe("42501");
    // Mesmo um superusuário esbarra no gatilho de imutabilidade.
    expect((await dbError(db.admin.query("update public.stock_movements set quantity = 99 where id = $1", [mov.id]))).code).toBe("SG008");
    expect((await dbError(db.admin.query("delete from public.stock_movements where id = $1", [mov.id]))).code).toBe("SG008");
  });

  it("não permite inserir movimentações, vendas ou itens diretamente", async () => {
    const product = await newProduct({ name: "Direto", initial: 5 });
    const e1 = await dbError(
      db.asUser(userId, (c) =>
        c.query(
          "insert into public.stock_movements (company_id, product_id, type, quantity, balance_before, balance_after) values ($1,$2,'entry',1,5,6)",
          [companyId, product.id],
        ),
      ),
    );
    expect(e1.code).toBe("42501");
    const e2 = await dbError(
      db.asUser(userId, (c) =>
        c.query("insert into public.sales (company_id, sale_number, payment_method, subtotal, total) values ($1, 999, 'cash', 1, 1)", [companyId]),
      ),
    );
    expect(e2.code).toBe("42501");
  });

  it("restrição do banco garante coerência entre saldo anterior, quantidade e saldo posterior", async () => {
    const product = await newProduct({ name: "Coerência", initial: 5 });
    const err = await dbError(
      db.admin.query(
        "insert into public.stock_movements (company_id, product_id, type, quantity, balance_before, balance_after) values ($1,$2,'entry',1,5,100)",
        [companyId, product.id],
      ),
    );
    expect(err.code).toBe("23514");
  });

  it("unidade de medida fica bloqueada depois que há movimentações", async () => {
    const product = await newProduct({ name: "Unidade", initial: 2 });
    const err = await dbError(db.asUser(userId, (c) => c.query("update public.products set unit = 'kg' where id = $1", [product.id])));
    expect(err.code).toBe("SG005");
  });

  it("categorias: nome único (sem diferenciar maiúsculas) e exclusão bloqueada quando em uso", async () => {
    const insert = (name: string) =>
      db.asUser(userId, (c) => c.query("insert into public.categories (company_id, name) values ($1, $2) returning id", [companyId, name]));
    const bebidas = await insert("Bebidas");
    expect((await dbError(insert("  bebidas"))).code).toBe("23505");

    await db.rpc(userId, "create_product", [companyId, "Suco", bebidas.rows[0].id, null, null, null, "un", 2, 4, 0, 0, true, null]);
    const err = await dbError(
      db.asUser(userId, (c) => c.query("delete from public.categories where id = $1", [bebidas.rows[0].id])),
    );
    expect(err.code).toBe("23503");

    const livre = await insert("Temporária");
    const del = await db.asUser(userId, (c) => c.query("delete from public.categories where id = $1", [livre.rows[0].id]));
    expect(del.rowCount).toBe(1);
  });

  it("view de categorias informa a quantidade de produtos associados", async () => {
    const { rows } = await db.asUser(userId, (c) =>
      c.query("select name, product_count from public.categories_overview where company_id = $1 order by name", [companyId]),
    );
    const geral = rows.find((r) => r.name === "Geral");
    expect(Number(geral.product_count)).toBeGreaterThan(0);
  });

  it("view de produtos classifica situação do estoque: ok, baixo e sem estoque", async () => {
    const ok = await newProduct({ name: "Status OK", initial: 10, min: 5 });
    const low = await newProduct({ name: "Status Baixo", initial: 5, min: 5 });
    const out = await newProduct({ name: "Status Zerado", initial: 0, min: 5 });
    const { rows } = await db.asUser(userId, (c) =>
      c.query("select id, stock_status from public.products_overview where id = any($1)", [[ok.id, low.id, out.id]]),
    );
    const by = Object.fromEntries(rows.map((r) => [r.id, r.stock_status]));
    expect(by[ok.id]).toBe("ok");
    expect(by[low.id]).toBe("low");
    expect(by[out.id]).toBe("out");
  });

  describe("idempotência e concorrência", () => {
    it("repetir a mesma chave não duplica a movimentação", async () => {
      const product = await newProduct({ name: "Idem", initial: 10 });
      const key = "chave-idempotente-0001";
      const a = await movement(product.id, "entry", 5, null, key);
      const b = await movement(product.id, "entry", 5, null, key);
      expect(b.id).toBe(a.id);
      expect(await stockOf(product.id)).toBe(15);
    });

    it("requisições simultâneas com a mesma chave geram uma única movimentação", async () => {
      const product = await newProduct({ name: "Idem concorrente", initial: 10 });
      const key = "chave-idempotente-0002";
      const results = await Promise.all(Array.from({ length: 6 }, () => movement(product.id, "entry", 2, null, key)));
      expect(new Set(results.map((r) => r.id)).size).toBe(1);
      expect(await stockOf(product.id)).toBe(12);
    });

    it("saídas simultâneas nunca deixam o saldo negativo nem vendem a mais", async () => {
      const product = await newProduct({ name: "Corrida", initial: 10 });
      const attempts = await Promise.allSettled(
        Array.from({ length: 8 }, (_, i) => movement(product.id, "manual_exit", 3, `saída ${i}`)),
      );
      const ok = attempts.filter((a) => a.status === "fulfilled").length;
      const failed = attempts.filter((a) => a.status === "rejected") as PromiseRejectedResult[];
      expect(ok).toBe(3); // 10 / 3 = 3 saídas completas
      expect(failed.every((f) => (f.reason as { code?: string }).code === "SG001")).toBe(true);
      expect(await stockOf(product.id)).toBe(1);

      const { rows } = await db.admin.query(
        "select balance_before, balance_after from public.stock_movements where product_id = $1 order by seq",
        [product.id],
      );
      // Encadeamento contínuo: cada saldo anterior é o posterior do registro anterior.
      for (let i = 1; i < rows.length; i++) {
        expect(Number(rows[i].balance_before)).toBe(Number(rows[i - 1].balance_after));
      }
    });
  });
});
